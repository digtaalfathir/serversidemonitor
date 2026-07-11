/* =====================================================================
   Floor Map (v2) — client logic
   - Connects to the SAME WebSocket as v1 (read-only here: no commands).
   - Renders one live marker per device on the blueprint floor plan.
   - Lightweight pan/zoom (no external library).
   Standalone: does not import or modify any v1 code.
   ===================================================================== */

// ===== WebSocket (auto protocol/host, Nginx-friendly — same as v1) =====
const protocol = location.protocol === "https:" ? "wss" : "ws";
const WS_URL = `${protocol}://${location.host}/ws`;
let ws;

// ===== Device coordinate layout (SVG viewBox units: 0..1120 x 0..780) =====
// Dummy positions for now — each known device sits in a room of the denah.
// Devices without an entry get an auto-placed spot (deterministic from IP).
const LAYOUT = {
  "172.19.88.30": { x: 250, y: 200 }, // DCS MIXING MATERIAL  -> CARPORT
  "172.19.88.16": { x: 455, y: 175 }, // DCS PLAYMAKER        -> KAMAR 1
  "172.19.88.29": { x: 655, y: 175 }, // DCS POLES            -> KAMAR 2
  "172.19.88.19": { x: 858, y: 175 }, // DCS QI               -> DAPUR
  "172.19.88.20": { x: 250, y: 395 }, // DCS REPAIR IN LINE   -> R.TAMU
  "172.19.88.24": { x: 620, y: 390 }, // DCS TASK FORCE       -> R.KELUARGA
  "172.19.88.17": { x: 858, y: 390 }, // IOT NODE 001         -> TERAS
  "172.19.88.21": { x: 250, y: 560 }, // Printer M#5          -> KAMAR 3
};

// Deterministic fallback position (so newly-added devices still appear)
function autoPos(ip) {
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) >>> 0;
  return { x: 190 + (h % 720), y: 120 + ((h >> 8) % 500) };
}
function getPos(d) { return LAYOUT[d.ip] || autoPos(d.ip); }

// ===== State =====
let deviceByIp = {};     // live data keyed by ip
let markerEls = {};      // ip -> <g> element
let selectedIp = null;
let dtTimer = null;

const SVG_NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("floormap");
const viewport = document.getElementById("viewport");
const markersG = document.getElementById("markers");
const stage = document.getElementById("stage");
const tooltip = document.getElementById("tooltip");
const detailPanel = document.getElementById("detailPanel");
const detailContent = document.getElementById("detailContent");

// ===== WebSocket connection =====
function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => setConn(true);
  ws.onclose = () => { setConn(false); setTimeout(connect, 3000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "cmd_result") return; // this page issues no commands
    if (msg.devices) { syncMarkers(msg.devices); updateSummary(msg.devices); }
    if (msg.timestamp) {
      document.getElementById("lastUpdate").textContent = `Last update: ${msg.timestamp}`;
    }
  };
}

function setConn(ok) {
  document.getElementById("connDot").classList.toggle("connected", ok);
  document.getElementById("connLabel").textContent = ok ? "Connected" : "Disconnected";
}

// ===== Marker sync (create / update / remove without full rebuild) =====
function syncMarkers(devices) {
  const seen = new Set();
  devices.forEach((d) => {
    deviceByIp[d.ip] = d;
    seen.add(d.ip);
    const pos = getPos(d);
    let el = markerEls[d.ip];
    if (!el) { el = makeMarker(d); markersG.appendChild(el); markerEls[d.ip] = el; }
    el.setAttribute("transform", `translate(${pos.x} ${pos.y})`);
    const sev = d.severity || "LOW";
    const status = (d.status || "").toLowerCase();
    let cls = `fm-marker status-${status} sev-${sev}`;
    if (d.ip === selectedIp) cls += " selected";
    el.setAttribute("class", cls);
    setLabel(el, d.name);
  });
  // remove markers for devices that no longer exist
  Object.keys(markerEls).forEach((ip) => {
    if (!seen.has(ip)) { markerEls[ip].remove(); delete markerEls[ip]; if (ip === selectedIp) closeDetail(); }
  });
  // keep an open detail panel fresh
  if (selectedIp && deviceByIp[selectedIp]) renderDetail(deviceByIp[selectedIp]);
}

function makeMarker(d) {
  const g = document.createElementNS(SVG_NS, "g");
  g.dataset.ip = d.ip;
  const pulse = mk("circle", { class: "fm-pulse", r: 12 });
  const ring = mk("circle", { class: "fm-ring", r: 12 });
  const core = mk("circle", { class: "fm-core", r: 6.5 });
  const labelBg = mk("rect", { class: "mk-label-bg", rx: 5, y: 20, height: 17 });
  const label = mk("text", { class: "mk-label", y: 28.5 });
  g.append(pulse, ring, core, labelBg, label);

  // NOTE: marker "click" is handled in the pointerup logic below (not a click
  // listener) so it stays reliable while the svg holds pointer capture for panning.
  g.addEventListener("mouseenter", (e) => showTooltip(d.ip, e));
  g.addEventListener("mousemove", (e) => moveTooltip(e));
  g.addEventListener("mouseleave", hideTooltip);
  return g;
}

function setLabel(el, name) {
  const label = el.querySelector(".mk-label");
  if (label.textContent === name) return;
  label.textContent = name;
  const w = Math.max(40, name.length * 6.6 + 14);
  const bg = el.querySelector(".mk-label-bg");
  bg.setAttribute("x", -w / 2);
  bg.setAttribute("width", w);
}

function mk(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// ===== Summary bar =====
function updateSummary(devices) {
  const total = devices.length;
  const up = devices.filter((d) => d.status === "UP").length;
  const down = total - up;
  document.getElementById("totalDevices").textContent = total;
  document.getElementById("upCount").textContent = up;
  document.getElementById("downCount").textContent = down;
  const score = total > 0 ? ((up / total) * 100).toFixed(1) : "100.0";
  const el = document.getElementById("healthScore");
  el.textContent = `${score}%`;
  el.style.color = score >= 95 ? "var(--up)" : score >= 80 ? "var(--high)" : "var(--down)";
}

// ===== Tooltip =====
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

// ===== Detail panel =====
function openDetail(ip) {
  selectedIp = ip;
  Object.entries(markerEls).forEach(([k, el]) => el.classList.toggle("selected", k === ip));
  const d = deviceByIp[ip];
  if (d) renderDetail(d);
  detailPanel.classList.add("open");
}
function closeDetail() {
  detailPanel.classList.remove("open");
  if (selectedIp && markerEls[selectedIp]) markerEls[selectedIp].classList.remove("selected");
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
        <span>${isDown ? "●" : "●"}</span>
        <span>${isDown ? "DEVICE DOWN" : "DEVICE UP"}</span>
        ${isDown && d.downSince ? `<span style="margin-left:auto;font-size:12px;font-weight:600" id="dtLive">—</span>` : ""}
      </div>
      <div class="dt-section">Network Quality</div>
      <div class="dt-grid">
        <div class="dt-item"><div class="dt-label">Availability</div><div class="dt-val ${avail >= 99 ? "up" : "down"}">${avail}%</div></div>
        <div class="dt-item"><div class="dt-label">Current Latency</div><div class="dt-val">${lat}</div></div>
        <div class="dt-item"><div class="dt-label">Avg Latency</div><div class="dt-val">${avg}</div></div>
        <div class="dt-item"><div class="dt-label">Peak Latency</div><div class="dt-val">${peak}</div></div>
        <div class="dt-item"><div class="dt-label">Downtime Today</div><div class="dt-val">${fmtSec(d.downtimeTodaySec ?? 0)}</div></div>
        <div class="dt-item"><div class="dt-label">Position</div><div class="dt-val" style="font-size:11px">${getPos(d).x}, ${getPos(d).y}</div></div>
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

// ===== Utils =====
function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }
function fmtSec(s) {
  if (!s) return "0s";
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}

// ===================================================================
//  PAN / ZOOM  (viewBox-aware, no external library)
// ===================================================================
let view = { x: 0, y: 0, k: 1 };
const K_MIN = 0.5, K_MAX = 6;

function applyView() {
  viewport.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`);
}
// screen point -> SVG root user space (accounts for viewBox + aspect ratio)
function toUser(clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function zoomAt(clientX, clientY, factor) {
  const u = toUser(clientX, clientY);
  const newK = Math.min(K_MAX, Math.max(K_MIN, view.k * factor));
  const r = newK / view.k;
  view.x = u.x - (u.x - view.x) * r;
  view.y = u.y - (u.y - view.y) * r;
  view.k = newK;
  applyView();
}

// wheel zoom
svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

// drag pan
let panning = false, didPan = false, startU = null, startView = null, downMarker = null;
svg.addEventListener("pointerdown", (e) => {
  panning = true; didPan = false;
  downMarker = e.target.closest ? e.target.closest(".fm-marker") : null;
  startU = toUser(e.clientX, e.clientY);
  startView = { x: view.x, y: view.y };
  svg.setPointerCapture(e.pointerId);
});
svg.addEventListener("pointermove", (e) => {
  if (!panning) return;
  const u = toUser(e.clientX, e.clientY);
  const dx = u.x - startU.x, dy = u.y - startU.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) { didPan = true; stage.classList.add("dragging"); }
  view.x = startView.x + dx;
  view.y = startView.y + dy;
  applyView();
});
function endPan(e) {
  if (!panning) return;
  panning = false;
  stage.classList.remove("dragging");
  try { svg.releasePointerCapture(e.pointerId); } catch {}
  // a press-release on a marker without dragging = a click on that marker
  if (!didPan && downMarker && downMarker.dataset.ip) openDetail(downMarker.dataset.ip);
  downMarker = null;
}
svg.addEventListener("pointerup", endPan);
svg.addEventListener("pointercancel", endPan);

// toolbar zoom buttons (zoom around stage center)
function zoomCenter(factor) {
  const r = svg.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}
document.getElementById("zoomIn").onclick = () => zoomCenter(1.25);
document.getElementById("zoomOut").onclick = () => zoomCenter(1 / 1.25);
document.getElementById("zoomReset").onclick = () => { view = { x: 0, y: 0, k: 1 }; applyView(); };

// close detail with Escape
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

// ===== Start =====
applyView();
connect();
