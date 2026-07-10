/* =====================================================================
   Floor Map 3D (v2 / Fase 3) — Three.js
   Approach (a): geometry is EXTRUDED FROM DATA (floorplan-data.js), not a
   hand-modeled mesh. Device markers are 3D "pins" that poke above the walls;
   live status comes from the SAME /ws WebSocket used by v1 (read-only here).
   ES module. Touches no v1 code.
   ===================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import {
  VIEW, WALL, ROOMS, WALLS, ROOM_COLORS, LAYOUT, autoPos, SEV_COLORS, STATUS_COLORS,
} from "./floorplan-data.js";

// ---- DOM refs ----
const stage = document.getElementById("stage");
const canvas = document.getElementById("glcanvas");
const tooltip = document.getElementById("tooltip");
const detailPanel = document.getElementById("detailPanel");
const detailContent = document.getElementById("detailContent");
const splash = document.getElementById("splash");
const splashMsg = document.getElementById("splashMsg");

// coordinate helpers: plan (x right, y depth) -> world (X, Z), Y is up
const toX = (x) => x - VIEW.cx;
const toZ = (y) => y - VIEW.cy;
const SPHERE_Y = WALL.height + 24;   // pins float just above the walls

// ---- state ----
let scene, camera, renderer, labelRenderer, controls, raycaster, clock;
let deviceByIp = {};
const markerGroups = {};   // ip -> THREE.Group
const markerMeshes = [];   // sphere meshes (raycast targets)
const deviceLabelEls = []; // device-name label DOM nodes (for toggling)
let selectedIp = null, dtTimer = null, labelsVisible = true;

// =====================================================================
//  INIT
// =====================================================================
try {
  initThree();
  buildFloorPlan();
  bindInteraction();
  animate();
  connectWS();
  hideSplash();
} catch (err) {
  showError(err);
}

function initThree() {
  const w = stage.clientWidth, h = stage.clientHeight;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(48, w / h, 1, 8000);
  camera.position.set(0, 720, 900);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);

  // CSS2D overlay for crisp text labels (sits above the canvas)
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  Object.assign(labelRenderer.domElement.style, {
    position: "absolute", top: "0", left: "0", pointerEvents: "none",
  });
  stage.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 30, 0);
  controls.maxPolarAngle = Math.PI * 0.49;   // never dip below the floor
  controls.minDistance = 250;
  controls.maxDistance = 2600;
  controls.update();

  // lights
  scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x0a0e1a, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(420, 640, 320);
  scene.add(dir);
  scene.add(new THREE.AmbientLight(0x223148, 0.5));

  // ground + grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3600, 3600),
    new THREE.MeshStandardMaterial({ color: 0x070a12, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  scene.add(ground);
  const grid = new THREE.GridHelper(2400, 48, 0x1c2740, 0x121a2e);
  grid.position.y = -2.5;
  scene.add(grid);

  window.addEventListener("resize", onResize);
}

// =====================================================================
//  BUILD FLOOR PLAN (extrude from data)
// =====================================================================
function buildFloorPlan() {
  const building = new THREE.Group();

  // ---- floor slabs (one per room, tinted by type) + outline ----
  ROOMS.forEach((r) => {
    const geo = new THREE.BoxGeometry(r.w, 3, r.h);
    const mat = new THREE.MeshStandardMaterial({
      color: ROOM_COLORS[r.type] ?? 0x27324e, roughness: 0.95, metalness: 0.0,
    });
    const slab = new THREE.Mesh(geo, mat);
    slab.position.set(toX(r.x + r.w / 2), -1.5, toZ(r.y + r.h / 2));
    building.add(slab);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x3a4a6b })
    );
    edges.position.copy(slab.position);
    building.add(edges);

    // room label on the floor
    const el = document.createElement("div");
    el.className = "room3d-label";
    el.innerHTML = `${r.label}${r.level ? `<small>${r.level}</small>` : ""}`;
    const lbl = new CSS2DObject(el);
    lbl.position.set(toX(r.x + r.w / 2), 8, toZ(r.y + r.h / 2));
    building.add(lbl);
  });

  // ---- walls (extruded from line segments; each drawn once) ----
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x8fa3c4, roughness: 0.55, metalness: 0.1,
  });
  WALLS.forEach(([x1, y1, x2, y2]) => {
    const horizontal = y1 === y2;
    const len = Math.hypot(x2 - x1, y2 - y1) + WALL.thickness;
    const geo = horizontal
      ? new THREE.BoxGeometry(len, WALL.height, WALL.thickness)
      : new THREE.BoxGeometry(WALL.thickness, WALL.height, len);
    const wall = new THREE.Mesh(geo, wallMat);
    wall.position.set(
      toX((x1 + x2) / 2), WALL.height / 2, toZ((y1 + y2) / 2)
    );
    building.add(wall);
  });

  scene.add(building);
}

// =====================================================================
//  DEVICE MARKERS
// =====================================================================
function getPos(d) { return LAYOUT[d.ip] || autoPos(d.ip); }

function makeMarker(ip) {
  const g = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(16, 22, 36),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 2;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, SPHERE_Y, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, roughness: 0.5 })
  );
  stem.position.y = SPHERE_Y / 2;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(12, 28, 28),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, emissiveIntensity: 0.9, roughness: 0.35 })
  );
  core.position.y = SPHERE_Y;
  core.userData.ip = ip;

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(12, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false })
  );
  halo.position.y = SPHERE_Y;

  const el = document.createElement("div");
  el.className = "mk3d-label";
  el.style.display = labelsVisible ? "" : "none";
  deviceLabelEls.push(el);
  const label = new CSS2DObject(el);
  label.position.y = SPHERE_Y + 28;

  g.add(ring, stem, core, halo, label);
  g.userData = { ring, stem, core, halo, labelEl: el, status: "UP" };
  markerMeshes.push(core);
  return g;
}

function syncMarkers(devices) {
  const seen = new Set();
  devices.forEach((d) => {
    deviceByIp[d.ip] = d;
    seen.add(d.ip);
    let g = markerGroups[d.ip];
    if (!g) { g = makeMarker(d.ip); markerGroups[d.ip] = g; scene.add(g); }

    const p = getPos(d);
    g.position.set(toX(p.x), 0, toZ(p.y));

    const statusCol = STATUS_COLORS[d.status] ?? 0x6b7280;
    const sevCol = SEV_COLORS[d.severity] ?? SEV_COLORS.LOW;
    const u = g.userData;
    u.status = d.status;
    u.core.material.color.setHex(statusCol);
    u.core.material.emissive.setHex(statusCol);
    u.stem.material.color.setHex(statusCol);
    u.stem.material.emissive.setHex(statusCol);
    u.stem.material.emissiveIntensity = 0.25;
    u.halo.material.color.setHex(statusCol);
    u.ring.material.color.setHex(sevCol);
    u.labelEl.textContent = d.name;
    u.labelEl.classList.toggle("down", d.status === "DOWN");
  });

  // remove markers for devices that disappeared
  Object.keys(markerGroups).forEach((ip) => {
    if (seen.has(ip)) return;
    const g = markerGroups[ip];
    scene.remove(g);
    const idx = markerMeshes.indexOf(g.userData.core);
    if (idx >= 0) markerMeshes.splice(idx, 1);
    const li = deviceLabelEls.indexOf(g.userData.labelEl);
    if (li >= 0) deviceLabelEls.splice(li, 1);
    delete markerGroups[ip];
    if (ip === selectedIp) closeDetail();
  });

  if (selectedIp && deviceByIp[selectedIp]) renderDetail(deviceByIp[selectedIp]);
}

// =====================================================================
//  ANIMATION
// =====================================================================
function animate() {
  requestAnimationFrame(animate);
  const t = clock ? clock.getElapsedTime() : 0;
  // pulse halos: strong for DOWN, faint for UP
  for (const ip in markerGroups) {
    const u = markerGroups[ip].userData;
    if (u.status === "DOWN") {
      const phase = (t * 0.9) % 1;
      u.halo.scale.setScalar(1 + phase * 1.8);
      u.halo.material.opacity = 0.4 * (1 - phase);
    } else {
      u.halo.scale.setScalar(1.05);
      u.halo.material.opacity = 0.12;
    }
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function onResize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}

// =====================================================================
//  INTERACTION (raycast hover + click, distinguished from orbit-drag)
// =====================================================================
function bindInteraction() {
  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();

  let downX = 0, downY = 0, isDown = false, moved = false;

  canvas.addEventListener("pointerdown", (e) => {
    isDown = true; moved = false; downX = e.clientX; downY = e.clientY; hideTooltip();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (isDown) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) { moved = true; stage.classList.add("dragging"); }
      return; // orbiting → no hover
    }
    handleHover(e);
  });
  window.addEventListener("pointerup", (e) => {
    stage.classList.remove("dragging");
    if (isDown && !moved) handleClick(e);
    isDown = false;
  });
  canvas.addEventListener("pointerleave", hideTooltip);

  document.getElementById("resetView").onclick = () => {
    camera.position.set(0, 720, 900);
    controls.target.set(0, 30, 0);
    controls.update();
  };
  document.getElementById("toggleLabels").onclick = () => {
    labelsVisible = !labelsVisible;
    deviceLabelEls.forEach((el) => (el.style.display = labelsVisible ? "" : "none"));
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
}

function pick(e) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(markerMeshes, false);
  return hits.length ? hits[0].object.userData.ip : null;
}

function handleHover(e) {
  const ip = pick(e);
  if (ip) { canvas.style.cursor = "pointer"; showTooltip(ip, e); }
  else { canvas.style.cursor = ""; hideTooltip(); }
}
function handleClick(e) {
  const ip = pick(e);
  if (ip) openDetail(ip);
  else closeDetail();
}

// =====================================================================
//  TOOLTIP + DETAIL PANEL  (markup mirrors the 2D view)
// =====================================================================
function showTooltip(ip, e) {
  const d = deviceByIp[ip];
  if (!d) return;
  const isDown = d.status === "DOWN";
  const lat = d.latency != null ? `${d.latency} ms` : "—";
  const avail = d.uptimeToday ?? 100;
  tooltip.innerHTML = `
    <div class="tt-name">${esc(d.name)}</div>
    <div class="tt-ip">${d.ip}</div>
    <div class="tt-row"><span>Status</span><span class="${isDown ? "tt-down" : "tt-up"}">${d.status || "—"}</span></div>
    <div class="tt-row"><span>Latency</span><span>${lat}</span></div>
    <div class="tt-row"><span>Availability</span><span>${avail}%</span></div>
    <div class="tt-row"><span>Severity</span><span>${d.severity || "—"}</span></div>`;
  tooltip.classList.add("show");
  moveTooltip(e);
}
function moveTooltip(e) {
  const r = stage.getBoundingClientRect();
  let x = e.clientX - r.left + 16, y = e.clientY - r.top + 16;
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  if (x + tw > r.width) x = e.clientX - r.left - tw - 16;
  if (y + th > r.height) y = r.height - th - 8;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}
function hideTooltip() { tooltip.classList.remove("show"); }

function openDetail(ip) {
  selectedIp = ip;
  const d = deviceByIp[ip];
  if (d) renderDetail(d);
  detailPanel.classList.add("open");
}
function closeDetail() {
  detailPanel.classList.remove("open");
  selectedIp = null;
  if (dtTimer) { clearInterval(dtTimer); dtTimer = null; }
}
function renderDetail(d) {
  const isDown = d.status === "DOWN";
  const lat = d.latency != null ? `${d.latency} ms` : "—";
  const avg = d.avgLatency != null ? `${d.avgLatency} ms` : "—";
  const peak = d.maxLatency != null ? `${d.maxLatency} ms` : "—";
  const avail = d.uptimeToday ?? 100;
  const hist = (d.history || []).slice(-6).reverse();
  const p = getPos(d);

  detailContent.innerHTML = `
    <div class="dt-head">
      <div>
        <h2>${esc(d.name)}</h2>
        <div class="dt-ip">${d.ip} · <span class="badge sev-${d.severity || "LOW"}">${d.severity || "—"}</span></div>
      </div>
      <button class="dt-close" id="dtClose">✕</button>
    </div>
    <div class="dt-body">
      <div class="dt-status-banner ${isDown ? "down" : "up"}">
        <span>●</span><span>${isDown ? "DEVICE DOWN" : "DEVICE UP"}</span>
        ${isDown && d.downSince ? `<span style="margin-left:auto;font-size:12px;font-weight:600" id="dtLive">—</span>` : ""}
      </div>
      <div class="dt-section">Network Quality</div>
      <div class="dt-grid">
        <div class="dt-item"><div class="dt-label">Availability</div><div class="dt-val ${avail >= 99 ? "up" : "down"}">${avail}%</div></div>
        <div class="dt-item"><div class="dt-label">Current Latency</div><div class="dt-val">${lat}</div></div>
        <div class="dt-item"><div class="dt-label">Avg Latency</div><div class="dt-val">${avg}</div></div>
        <div class="dt-item"><div class="dt-label">Peak Latency</div><div class="dt-val">${peak}</div></div>
        <div class="dt-item"><div class="dt-label">Downtime Today</div><div class="dt-val">${fmtSec(d.downtimeTodaySec ?? 0)}</div></div>
        <div class="dt-item"><div class="dt-label">Position (x,y)</div><div class="dt-val" style="font-size:11px">${p.x}, ${p.y}</div></div>
      </div>
      <div class="dt-section">Device Info</div>
      <div class="dt-meta">
        <div class="m-row"><span class="m-k">Owner</span><span class="m-v">${esc(d.owner) || "—"}</span></div>
        <div class="m-row"><span class="m-k">Location</span><span class="m-v">${esc(d.location) || "—"}</span></div>
        <div class="m-row"><span class="m-k">Vendor</span><span class="m-v">${esc(d.vendor) || "—"}</span></div>
        <div class="m-row"><span class="m-k">Notes</span><span class="m-v">${esc(d.notes) || "—"}</span></div>
      </div>
      <div class="dt-section">Recent Events</div>
      <div class="dt-events">
        ${hist.length ? hist.map((h) => `
          <div class="dt-ev">
            <span class="ev-dot ${h.status.toLowerCase()}"></span>
            <span class="ev-time">${h.timestamp}</span>
            <span class="ev-status" style="color:${h.status === "UP" ? "var(--up)" : "var(--down)"}">${h.status}</span>
          </div>`).join("") : `<div class="dt-empty">Belum ada event tercatat.</div>`}
      </div>
    </div>`;
  document.getElementById("dtClose").onclick = closeDetail;
  startDtLive(d);
}
function startDtLive(d) {
  if (dtTimer) { clearInterval(dtTimer); dtTimer = null; }
  const el = document.getElementById("dtLive");
  if (!el || !d.downSince) return;
  const since = new Date(d.downSince.replace(" ", "T")).getTime();
  const tick = () => {
    const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    el.textContent = `Down ${hh}:${mm}:${ss}`;
  };
  tick();
  dtTimer = setInterval(tick, 1000);
}

// =====================================================================
//  WEBSOCKET  (same endpoint as v1; read-only)
// =====================================================================
function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => setConn(true);
  ws.onclose = () => { setConn(false); setTimeout(connectWS, 3000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "cmd_result") return;
    if (msg.devices) { syncMarkers(msg.devices); updateSummary(msg.devices); }
    if (msg.timestamp) document.getElementById("lastUpdate").textContent = `Last update: ${msg.timestamp}`;
  };
}
function setConn(ok) {
  document.getElementById("connDot").classList.toggle("connected", ok);
  document.getElementById("connLabel").textContent = ok ? "Connected" : "Disconnected";
}
function updateSummary(devices) {
  const total = devices.length;
  const up = devices.filter((d) => d.status === "UP").length;
  document.getElementById("totalDevices").textContent = total;
  document.getElementById("upCount").textContent = up;
  document.getElementById("downCount").textContent = total - up;
  const score = total > 0 ? ((up / total) * 100).toFixed(1) : "100.0";
  const el = document.getElementById("healthScore");
  el.textContent = `${score}%`;
  el.style.color = score >= 95 ? "var(--up)" : score >= 80 ? "var(--high)" : "var(--down)";
}

// =====================================================================
//  UTIL / SPLASH
// =====================================================================
function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }
function fmtSec(s) {
  if (!s) return "0s";
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}
function hideSplash() { splash.classList.add("hidden"); }
function showError(err) {
  console.error(err);
  splash.classList.remove("hidden");
  splash.classList.add("error");
  splashMsg.textContent = "Gagal memuat tampilan 3D: " + (err && err.message ? err.message : err) +
    ". Cek console browser (F12). Kemungkinan WebGL tidak didukung atau file Three.js tidak termuat.";
}
