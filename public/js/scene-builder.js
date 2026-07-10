/* =====================================================================
   Scene Builder (v2) — author a 3D "digital twin" once, export scene.json.
   The monitoring dashboard just LOADS scene.json + wires live status;
   no runtime "dandan". Units = meters. Standalone; no v1 code touched.
   ===================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// ---- DOM ----
const view = document.getElementById("view");
const canvas = document.getElementById("c3d");
const tipEl = document.getElementById("tip");
const $ = (id) => document.getElementById(id);

// ---- three globals ----
let scene, camera, renderer, composer, bloomPass, controls, transform;
let hemi, amb, keyLight;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const loader = new GLTFLoader();

// ---- data model ----
let objects = [];         // { id, type, obj, data }
const byId = {};
let idc = 1;
let mode = "select";
let selected = null;
let snapOn = true;
let draggingGizmo = false;
let refPlane = null, refAspect = 1;

const lighting = {
  exposure: 1.05, sunElevation: 55, sunAzimuth: 40, sunIntensity: 2.1,
  ambient: 0.45, bloom: { strength: 0.55, threshold: 0.82, radius: 0.5 },
};

// ---- wall/floor drafting ----
let wallDraft = null;     // { pts:[Vector3], line, dots:Group }
let floorStart = null, floorPreview = null;

const r3 = (n) => Math.round(n * 1000) / 1000;

// =====================================================================
init();

function init() {
  const w = view.clientWidth, h = view.clientHeight;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080b14);
  scene.fog = new THREE.Fog(0x080b14, 120, 400);

  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
  camera.position.set(28, 24, 32);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, 1, 0);

  transform = new TransformControls(camera, canvas);
  transform.setTranslationSnap(0.5);
  transform.setRotationSnap(THREE.MathUtils.degToRad(15));
  transform.addEventListener("dragging-changed", (e) => {
    draggingGizmo = e.value;
    controls.enabled = !e.value;
  });
  scene.add(transform.getHelper());

  // lights
  hemi = new THREE.HemisphereLight(0x9fb4d8, 0x0a0e1a, lighting.ambient);
  amb = new THREE.AmbientLight(0x1a2436, lighting.ambient * 0.5);
  keyLight = new THREE.DirectionalLight(0xffffff, lighting.sunIntensity);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.6;
  const sc = keyLight.shadow.camera;
  sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 200;
  scene.add(hemi, amb, keyLight);

  // ground + grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x0e131d, roughness: 0.98, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "__ground";
  scene.add(ground);
  const grid = new THREE.GridHelper(120, 120, 0x263352, 0x172036);
  grid.position.y = 0.001;
  grid.material.transparent = true; grid.material.opacity = 0.5;
  scene.add(grid);

  // post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), lighting.bloom.strength, lighting.bloom.radius, lighting.bloom.threshold);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  pmrem.dispose();

  applyLighting();
  bindUI();
  bindPointer();
  setMode("select");
  window.addEventListener("resize", onResize);
  animate();
  connectWSForIps();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  composer.render();
}

function onResize() {
  const w = view.clientWidth, h = view.clientHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h);
}

// =====================================================================
//  LIGHTING
// =====================================================================
function applyLighting() {
  renderer.toneMappingExposure = lighting.exposure;
  const el = THREE.MathUtils.degToRad(lighting.sunElevation);
  const az = THREE.MathUtils.degToRad(lighting.sunAzimuth);
  const R = 70;
  keyLight.position.set(R * Math.cos(el) * Math.cos(az), R * Math.sin(el), R * Math.cos(el) * Math.sin(az));
  keyLight.intensity = lighting.sunIntensity;
  hemi.intensity = lighting.ambient;
  amb.intensity = lighting.ambient * 0.5;
  bloomPass.strength = lighting.bloom.strength;
  bloomPass.threshold = lighting.bloom.threshold;
  bloomPass.radius = lighting.bloom.radius;
}

// =====================================================================
//  MODES
// =====================================================================
const MODE_LABEL = { select: "Pilih", wall: "Tembok", floor: "Lantai", pin: "Pin Device" };
function setMode(m) {
  cancelWall(); cancelFloor();
  mode = m;
  document.querySelectorAll(".btn.mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  if (m !== "select") { transform.detach(); selected = null; }
  $("statMode").innerHTML = `Mode: <b>${MODE_LABEL[m]}</b>`;
  updateInspector();
  setTip();
}
function setTip() {
  const tips = {
    select: "<b>Pilih</b>: klik objek untuk memilih. Model/Pin bisa digeser pakai gizmo. Tombol <b>Delete</b> untuk hapus.",
    wall: "<b>Tembok</b>: klik titik demi titik di lantai. <b>Enter</b>/klik-dobel = selesai · <b>Esc</b> = batal.",
    floor: "<b>Lantai</b>: klik 2 sudut untuk membuat kotak lantai.",
    pin: "<b>Pin</b>: klik di lantai untuk menaruh titik status device.",
  };
  tipEl.innerHTML = tips[mode] || "";
}

// =====================================================================
//  RAYCAST → GROUND
// =====================================================================
function groundPoint(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(GROUND, p)) return null;
  if (snapOn) { p.x = Math.round(p.x * 2) / 2; p.z = Math.round(p.z * 2) / 2; p.y = 0; }
  return p;
}

// =====================================================================
//  POINTER
// =====================================================================
function bindPointer() {
  let dn = null;
  canvas.addEventListener("pointerdown", (e) => { dn = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("pointermove", (e) => {
    const p = groundPoint(e);
    if (p) $("statCoords").textContent = `x: ${p.x.toFixed(1)}  z: ${p.z.toFixed(1)} m`;
    if (mode === "wall" && wallDraft) updateWallPreview(p);
    if (mode === "floor" && floorStart) updateFloorPreview(p);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!dn) return;
    const moved = Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 5;
    dn = null;
    if (moved || draggingGizmo) return;   // was an orbit/gizmo drag, not a tap
    tap(e);
  });
  canvas.addEventListener("dblclick", () => { if (mode === "wall") finishWall(); });
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "Enter" && mode === "wall") finishWall();
    if (e.key === "Escape") { cancelWall(); cancelFloor(); if (mode !== "select") setMode("select"); }
    if ((e.key === "Delete" || e.key === "Backspace") && selected) { removeRecord(selected); }
  });
}

function tap(e) {
  const p = groundPoint(e);
  if (mode === "select") { pickAt(e); return; }
  if (!p) return;
  if (mode === "wall") addWallPoint(p);
  else if (mode === "floor") floorTap(p);
  else if (mode === "pin") placePin(p);
}

function pickAt(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(objects.map((o) => o.obj), true);
  const rec = hits.length ? recordOf(hits[0].object) : null;
  select(rec);
}
function recordOf(o) {
  while (o) { if (o.userData && o.userData.recId != null) return byId[o.userData.recId]; o = o.parent; }
  return null;
}

// =====================================================================
//  OBJECTS: add / select / remove
// =====================================================================
function addObject(type, obj, data) {
  const id = idc++;
  obj.userData.recId = id;
  const rec = { id, type, obj, data };
  objects.push(rec); byId[id] = rec;
  scene.add(obj);
  refreshList();
  return rec;
}
function removeRecord(rec) {
  if (!rec) return;
  if (selected === rec) { transform.detach(); selected = null; }
  scene.remove(rec.obj);
  objects = objects.filter((o) => o !== rec);
  delete byId[rec.id];
  refreshList(); updateInspector();
}
function select(rec) {
  selected = rec;
  transform.detach();
  if (rec && (rec.type === "model" || rec.type === "pin")) transform.attach(rec.obj);
  updateInspector();
  refreshList();
  if (rec) $("statCoords").textContent = `Terpilih: ${rec.data.name || rec.type}  (Delete = hapus)`;
}

// =====================================================================
//  WALLS
// =====================================================================
function addWallPoint(p) {
  if (!wallDraft) {
    wallDraft = { pts: [], line: null, dots: new THREE.Group() };
    scene.add(wallDraft.dots);
    const g = new THREE.BufferGeometry();
    wallDraft.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x8ab4ff }));
    scene.add(wallDraft.line);
  }
  wallDraft.pts.push(p.clone());
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), new THREE.MeshBasicMaterial({ color: 0x8ab4ff }));
  dot.position.copy(p).setY(0.1);
  wallDraft.dots.add(dot);
  updateWallPreview(p);
}
function updateWallPreview(cursor) {
  if (!wallDraft) return;
  const pts = wallDraft.pts.map((v) => new THREE.Vector3(v.x, 0.1, v.z));
  if (cursor) pts.push(new THREE.Vector3(cursor.x, 0.1, cursor.z));
  wallDraft.line.geometry.setFromPoints(pts);
}
function finishWall() {
  if (!wallDraft || wallDraft.pts.length < 2) { cancelWall(); return; }
  const height = clampNum($("wallH").value, 3, 0.2, 50);
  const thickness = clampNum($("wallT").value, 0.15, 0.02, 5);
  const color = $("wallColor").value;
  const closed = $("wallClosed").checked;
  const pts = wallDraft.pts.map((p) => [r3(p.x), r3(p.z)]);
  const group = buildWallGroup(pts, height, thickness, color, closed);
  addObject("wall", group, { points: pts, height, thickness, color, closed });
  cancelWall();
  toast("Tembok dibuat", true);
}
function cancelWall() {
  if (!wallDraft) return;
  scene.remove(wallDraft.line, wallDraft.dots);
  wallDraft = null;
}
function buildWallGroup(pts, height, thickness, color, closed) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.6, metalness: 0.12, envMapIntensity: 0.9 });
  const pairs = [];
  for (let i = 0; i < pts.length - 1; i++) pairs.push([pts[i], pts[i + 1]]);
  if (closed && pts.length > 2) pairs.push([pts[pts.length - 1], pts[0]]);
  pairs.forEach(([a, b]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 1e-3) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len + thickness, height, thickness), mat);
    m.position.set((a[0] + b[0]) / 2, height / 2, (a[1] + b[1]) / 2);
    m.rotation.y = -Math.atan2(dz, dx);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  });
  return g;
}

// =====================================================================
//  FLOORS
// =====================================================================
function floorTap(p) {
  if (!floorStart) { floorStart = p.clone(); return; }
  const a = floorStart, b = p;
  clearFloorPreview();
  floorStart = null;
  if (Math.abs(b.x - a.x) < 0.2 || Math.abs(b.z - a.z) < 0.2) { toast("Area terlalu kecil", false); return; }
  const type = $("floorType").value;
  const color = $("floorColor").value;
  const data = { x: r3((a.x + b.x) / 2), z: r3((a.z + b.z) / 2), w: r3(Math.abs(b.x - a.x)), d: r3(Math.abs(b.z - a.z)), type, color };
  addObject("floor", buildFloor(data), data);
  toast("Lantai dibuat", true);
}
function updateFloorPreview(cursor) {
  if (!floorStart || !cursor) return;
  clearFloorPreview();
  const a = floorStart, b = cursor;
  const w = Math.max(Math.abs(b.x - a.x), 0.1), d = Math.max(Math.abs(b.z - a.z), 0.1);
  floorPreview = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  floorPreview.rotation.x = -Math.PI / 2;
  floorPreview.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2);
  scene.add(floorPreview);
}
function clearFloorPreview() { if (floorPreview) { scene.remove(floorPreview); floorPreview = null; } }
function cancelFloor() { floorStart = null; clearFloorPreview(); }
const FLOOR_COL = { concrete: 0x3a3f47, green: 0x1f9e55, office: 0x8790a0 };
function buildFloor(d) {
  const col = d.type === "custom" ? new THREE.Color(d.color).getHex() : FLOOR_COL[d.type];
  const mat = new THREE.MeshStandardMaterial({
    color: col, roughness: d.type === "green" ? 0.6 : 0.92, metalness: 0,
    emissive: d.type === "green" ? 0x0c3f22 : 0x000000, emissiveIntensity: d.type === "green" ? 0.35 : 0,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(d.x, 0.02, d.z);
  m.receiveShadow = true;
  return m;
}

// =====================================================================
//  PINS
// =====================================================================
function placePin(p) {
  const ip = $("pinIp").value.trim();
  const label = $("pinLabel").value.trim();
  const g = buildPin();
  g.position.set(p.x, 0, p.z);
  const rec = addObject("pin", g, { ip, label });
  select(rec);
}
function buildPin() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 36), new THREE.MeshBasicMaterial({ color: 0x6366f1, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x6366f1, emissive: 0x4338ca, emissiveIntensity: 0.5 }));
  stem.position.y = 1.1; stem.castShadow = true;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0x818cf8, emissive: 0x6366f1, emissiveIntensity: 2.0 }));
  ball.position.y = 2.35; ball.castShadow = true;
  g.add(ring, stem, ball);
  return g;
}

// =====================================================================
//  MODELS
// =====================================================================
$("btnModel").onclick = () => $("fileModel").click();
$("fileModel").onchange = (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  toast("Memuat model…", true);
  f.arrayBuffer().then((buf) => {
    loader.parse(buf, "", (gltf) => {
      onModelLoaded(gltf.scene, { url: "/models/" + f.name, name: f.name.replace(/\.(glb|gltf)$/i, ""), deviceIp: "" });
      toast("Model dimuat. Salin file ke public/models/" + f.name, true);
    }, (err) => toast("Gagal parse model: " + err, false));
  });
};
function onModelLoaded(root, data) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // normalize odd scales, rest base on ground, center at current view target
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxd = Math.max(size.x, size.y, size.z) || 1;
  if (maxd > 50 || maxd < 0.3) { root.scale.setScalar(5 / maxd); box.setFromObject(root); box.getSize(size); }
  const c = box.getCenter(new THREE.Vector3());
  root.position.x += controls.target.x - c.x;
  root.position.z += controls.target.z - c.z;
  root.position.y += -box.min.y;
  const rec = addObject("model", root, data);
  setMode("select");
  select(rec);
}

// =====================================================================
//  DENAH (tracing aid — not saved)
// =====================================================================
$("btnDenah").onclick = () => $("fileDenah").click();
$("fileDenah").onchange = (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  const url = URL.createObjectURL(f);
  new THREE.TextureLoader().load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    refAspect = (tex.image.height || 1) / (tex.image.width || 1);
    if (refPlane) scene.remove(refPlane);
    refPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: +$("denahOp").value, depthWrite: false })
    );
    refPlane.rotation.x = -Math.PI / 2;
    refPlane.position.y = 0.005;
    scene.add(refPlane);
    updateDenah();
    $("secDenah").classList.remove("hidden");
    toast("Denah dimuat sebagai alas jiplak", true);
  });
};
function updateDenah() {
  if (!refPlane) return;
  const w = +$("denahW").value || 40;
  refPlane.scale.set(w, w * refAspect, 1);
  refPlane.material.opacity = +$("denahOp").value;
  refPlane.visible = $("denahShow").checked;
}

// =====================================================================
//  INSPECTOR + OBJECT LIST
// =====================================================================
function updateInspector() {
  $("secWall").classList.toggle("hidden", mode !== "wall");
  $("secFloor").classList.toggle("hidden", mode !== "floor");
  $("secPin").classList.toggle("hidden", !(mode === "pin" || (selected && selected.type === "pin")));
  $("secModel").classList.toggle("hidden", !(selected && selected.type === "model"));
  if (selected && selected.type === "model") {
    $("modelName").value = selected.data.name || "";
    $("modelPath").value = selected.data.url || "";
    $("modelIp").value = selected.data.deviceIp || "";
  }
  if (selected && selected.type === "pin") {
    $("pinIp").value = selected.data.ip || "";
    $("pinLabel").value = selected.data.label || "";
  }
}
function refreshList() {
  const ul = $("objList");
  $("statCount").textContent = `${objects.length} objek`;
  if (!objects.length) { ul.innerHTML = `<div class="empty">Belum ada objek. Mulai gambar tembok/lantai.</div>`; return; }
  ul.innerHTML = "";
  objects.forEach((o) => {
    const li = document.createElement("li");
    if (o === selected) li.className = "sel";
    const nm = o.data.name || o.data.ip || o.type;
    li.innerHTML = `<span class="tag">${o.type}</span><span class="nm">${escapeHtml(nm)}</span><span class="x">✕</span>`;
    li.onclick = (ev) => {
      if (ev.target.classList.contains("x")) { removeRecord(o); return; }
      if (mode !== "select") setMode("select");
      select(o);
    };
    ul.appendChild(li);
  });
}

// =====================================================================
//  SAVE / LOAD / NEW
// =====================================================================
function buildSceneJSON() {
  return {
    version: 1, units: "m",
    walls: objects.filter((o) => o.type === "wall").map((o) => o.data),
    floors: objects.filter((o) => o.type === "floor").map((o) => o.data),
    models: objects.filter((o) => o.type === "model").map((o) => ({
      url: o.data.url, name: o.data.name, deviceIp: o.data.deviceIp || "",
      position: [r3(o.obj.position.x), r3(o.obj.position.y), r3(o.obj.position.z)],
      rotationY: r3(o.obj.rotation.y), scale: r3(o.obj.scale.x),
    })),
    pins: objects.filter((o) => o.type === "pin").map((o) => ({
      x: r3(o.obj.position.x), z: r3(o.obj.position.z), ip: o.data.ip || "", label: o.data.label || "",
    })),
    lighting: JSON.parse(JSON.stringify(lighting)),
    camera: {
      position: [r3(camera.position.x), r3(camera.position.y), r3(camera.position.z)],
      target: [r3(controls.target.x), r3(controls.target.y), r3(controls.target.z)],
    },
  };
}
$("btnSave").onclick = () => {
  const blob = new Blob([JSON.stringify(buildSceneJSON(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "scene.json"; a.click();
  toast("scene.json diunduh. Taruh di public/ agar dashboard memuatnya.", true);
};
$("btnLoad").onclick = () => $("fileScene").click();
$("fileScene").onchange = (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  f.text().then((t) => { try { loadSceneJSON(JSON.parse(t)); toast("Scene dimuat", true); } catch (err) { toast("JSON tidak valid", false); } });
};
$("btnNew").onclick = () => { if (confirm("Kosongkan scene?")) clearAll(); };

function clearAll() {
  objects.slice().forEach((o) => scene.remove(o.obj));
  objects = []; for (const k in byId) delete byId[k];
  transform.detach(); selected = null;
  refreshList(); updateInspector();
}
function loadSceneJSON(s) {
  clearAll();
  (s.walls || []).forEach((d) => addObject("wall", buildWallGroup(d.points, d.height, d.thickness, d.color, d.closed), d));
  (s.floors || []).forEach((d) => addObject("floor", buildFloor(d), d));
  (s.pins || []).forEach((d) => { const g = buildPin(); g.position.set(d.x, 0, d.z); addObject("pin", g, { ip: d.ip, label: d.label }); });
  (s.models || []).forEach((d) => {
    loader.load(d.url, (gltf) => {
      const root = gltf.scene;
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      root.position.fromArray(d.position || [0, 0, 0]);
      root.rotation.y = d.rotationY || 0;
      root.scale.setScalar(d.scale || 1);
      addObject("model", root, { url: d.url, name: d.name, deviceIp: d.deviceIp || "" });
    }, undefined, () => toast("Model tak ditemukan: " + d.url + " (taruh di public/models/)", false));
  });
  if (s.lighting) { Object.assign(lighting, s.lighting); syncLightUI(); applyLighting(); }
  if (s.camera) {
    camera.position.fromArray(s.camera.position); controls.target.fromArray(s.camera.target); controls.update();
  }
}

// =====================================================================
//  UI BINDINGS
// =====================================================================
function bindUI() {
  document.querySelectorAll(".btn.mode").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $("btnTop").onclick = () => { camera.position.set(controls.target.x, 55, controls.target.z + 0.001); controls.update(); };
  $("snap").onchange = (e) => { snapOn = e.target.checked; };

  // model fields
  $("modelName").oninput = () => { if (selected && selected.type === "model") { selected.data.name = $("modelName").value; refreshList(); } };
  $("modelPath").oninput = () => { if (selected && selected.type === "model") selected.data.url = $("modelPath").value; };
  $("modelIp").oninput = () => { if (selected && selected.type === "model") selected.data.deviceIp = $("modelIp").value; };
  document.querySelectorAll(".tmodes .btn").forEach((b) => (b.onclick = () => {
    transform.setMode(b.dataset.tm);
    document.querySelectorAll(".tmodes .btn").forEach((x) => x.classList.toggle("active", x === b));
  }));

  // pin fields (edit selected)
  $("pinIp").oninput = () => { if (selected && selected.type === "pin") { selected.data.ip = $("pinIp").value; refreshList(); } };
  $("pinLabel").oninput = () => { if (selected && selected.type === "pin") selected.data.label = $("pinLabel").value; };

  // floor custom color live
  $("floorType").onchange = () => {};

  // denah
  ["denahW", "denahOp", "denahShow"].forEach((id) => ($(id).oninput = updateDenah));

  // lighting sliders
  const bind = (id, key, fmt, apply) => {
    const el = $(id);
    el.oninput = () => { apply(+el.value); $(fmt).textContent = fmtVal(id, +el.value); applyLighting(); };
  };
  bind("lgExp", 0, "vExp", (v) => (lighting.exposure = v));
  bind("lgElev", 0, "vElev", (v) => (lighting.sunElevation = v));
  bind("lgAzi", 0, "vAzi", (v) => (lighting.sunAzimuth = v));
  bind("lgInt", 0, "vInt", (v) => (lighting.sunIntensity = v));
  bind("lgAmb", 0, "vAmb", (v) => (lighting.ambient = v));
  bind("lgBloom", 0, "vBloom", (v) => (lighting.bloom.strength = v));
  bind("lgThr", 0, "vThr", (v) => (lighting.bloom.threshold = v));
}
function fmtVal(id, v) {
  if (id === "lgElev" || id === "lgAzi") return v + "°";
  return v.toFixed(2).replace(/\.00$/, "");
}
function syncLightUI() {
  $("lgExp").value = lighting.exposure; $("vExp").textContent = lighting.exposure;
  $("lgElev").value = lighting.sunElevation; $("vElev").textContent = lighting.sunElevation + "°";
  $("lgAzi").value = lighting.sunAzimuth; $("vAzi").textContent = lighting.sunAzimuth + "°";
  $("lgInt").value = lighting.sunIntensity; $("vInt").textContent = lighting.sunIntensity;
  $("lgAmb").value = lighting.ambient; $("vAmb").textContent = lighting.ambient;
  $("lgBloom").value = lighting.bloom.strength; $("vBloom").textContent = lighting.bloom.strength;
  $("lgThr").value = lighting.bloom.threshold; $("vThr").textContent = lighting.bloom.threshold;
}

// =====================================================================
//  UTIL
// =====================================================================
function clampNum(v, def, min, max) { v = parseFloat(v); if (isNaN(v)) return def; return Math.min(max, Math.max(min, v)); }
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }
let toastT;
function toast(msg, ok) {
  const t = $("toast"); t.textContent = msg; t.className = (ok ? "ok" : "err") + " show";
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3200);
}
// read-only WS just to offer known device IPs as autocomplete
function connectWSForIps() {
  try {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (!m.devices) return;
      $("ipList").innerHTML = m.devices.map((d) => `<option value="${d.ip}">${escapeHtml(d.name)}</option>`).join("");
    };
  } catch { /* ignore */ }
}
