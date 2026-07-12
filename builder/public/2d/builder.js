/* =====================================================================
   Floor-map Builder 2D (v2 / Track 2D) — authoring, SVG (no Three.js).
   Draw rooms / walls / device-pins (top-down), trace an uploaded denah,
   export layout2d.json (own 2D format, NOT scene.json/3D).
   ===================================================================== */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const svg = $("c2d"), vp = $("vp"), content = $("content"), draft = $("draft");
  const denahImg = $("denahImg"), tipEl = $("tip");

  let objects = [];            // { id, type, el, data }
  const byId = {};
  let idc = 1, mode = "select", selected = null, snapOn = true;
  let view = { x: 0, y: 0, k: 1 };
  let roomStart = null, roomPreview = null;
  let wallDraft = null;        // { pts:[{x,y}], line, dots }
  let down = null;             // pointer-down bookkeeping
  const r1 = (n) => Math.round(n);

  // ---------- coordinate helpers ----------
  function toUser(cx, cy) { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function toSvg(e) {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const u = p.matrixTransform(content.getScreenCTM().inverse());
    let x = u.x, y = u.y;
    if (snapOn) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; }
    return { x, y };
  }
  function applyView() { vp.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`); }

  // ---------- object build / render ----------
  function el(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function addObject(type, data) {
    const id = idc++;
    const g = el("g", { "data-recid": id }); g.classList.add("b-obj");
    const rec = { id, type, el: g, data };
    objects.push(rec); byId[id] = rec;
    if (type === "room") { g.appendChild(el("rect", { class: "b-room" })); g.appendChild(el("text", { class: "b-label" })); }
    else if (type === "wall") { g.appendChild(el("polyline", { class: "b-wall" })); }
    else if (type === "pin") {
      g.appendChild(el("circle", { class: "p-ring", r: 11 }));
      g.appendChild(el("circle", { class: "p-core", r: 6 }));
      const t = el("text", { class: "p-label", y: -16 }); g.appendChild(t);
    }
    content.appendChild(g);
    renderRec(rec);
    refreshList();
    return rec;
  }
  function renderRec(rec) {
    const d = rec.data;
    if (rec.type === "room") {
      const rect = rec.el.querySelector(".b-room");
      rect.setAttribute("x", d.x); rect.setAttribute("y", d.y);
      rect.setAttribute("width", d.w); rect.setAttribute("height", d.h);
      rect.setAttribute("rx", 4); rect.setAttribute("fill", d.color || "rgba(124,147,184,0.06)");
      const t = rec.el.querySelector(".b-label");
      t.setAttribute("x", d.x + d.w / 2); t.setAttribute("y", d.y + d.h / 2); t.textContent = d.label || "";
    } else if (rec.type === "wall") {
      const pl = rec.el.querySelector(".b-wall");
      const pts = d.points.map((p) => p.join(",")).join(" ") + (d.closed && d.points.length > 2 ? " " + d.points[0].join(",") : "");
      pl.setAttribute("points", pts);
    } else if (rec.type === "pin") {
      rec.el.setAttribute("transform", `translate(${d.x} ${d.y})`);
      rec.el.querySelector(".p-label").textContent = d.label || d.ip || "";
    }
  }
  function recOf(node) { while (node && node !== content) { if (node.dataset && node.dataset.recid) return byId[node.dataset.recid]; node = node.parentNode; } return null; }

  // ---------- selection ----------
  function markSel(rec, on) {
    const s = rec.type === "room" ? rec.el.querySelector(".b-room") : rec.type === "wall" ? rec.el.querySelector(".b-wall") : rec.el;
    s.classList.toggle("sel", on);
  }
  function select(rec) {
    if (selected) markSel(selected, false);
    selected = rec;
    if (rec) markSel(rec, true);
    updateInspector(); refreshList();
  }
  function removeSelected() {
    if (!selected) return;
    selected.el.remove();
    objects = objects.filter((o) => o !== selected);
    delete byId[selected.id];
    selected = null;
    refreshList(); updateInspector();
    toast("Objek dihapus", true);
  }

  // ---------- create actions ----------
  function updateRoomPreview(a, b) {
    if (!roomPreview) { roomPreview = el("rect", { class: "b-preview", rx: 4 }); draft.appendChild(roomPreview); }
    roomPreview.setAttribute("x", Math.min(a.x, b.x)); roomPreview.setAttribute("y", Math.min(a.y, b.y));
    roomPreview.setAttribute("width", Math.abs(b.x - a.x)); roomPreview.setAttribute("height", Math.abs(b.y - a.y));
  }
  function finalizeRoom(a, b) {
    if (roomPreview) { roomPreview.remove(); roomPreview = null; }
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (w < 15 || h < 15) { toast("Ruangan terlalu kecil", false); return; }
    const rec = addObject("room", { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w, h, label: "", color: $("roomNewColor").value });
    setMode("select"); select(rec);
  }
  function addWallPoint(p) {
    if (!wallDraft) {
      wallDraft = { pts: [], line: el("polyline", { class: "b-draftline" }), dots: el("g", {}) };
      draft.appendChild(wallDraft.line); draft.appendChild(wallDraft.dots);
    }
    wallDraft.pts.push([p.x, p.y]);
    wallDraft.dots.appendChild(el("circle", { cx: p.x, cy: p.y, r: 3, fill: "#8ab4ff" }));
    updateWallPreview(p);
  }
  function updateWallPreview(cur) {
    if (!wallDraft) return;
    const pts = wallDraft.pts.map((p) => p.join(",")).join(" ") + (cur ? " " + cur.x + "," + cur.y : "");
    wallDraft.line.setAttribute("points", pts);
  }
  function finishWall() {
    if (!wallDraft || wallDraft.pts.length < 2) { cancelWall(); return; }
    const rec = addObject("wall", { points: wallDraft.pts.slice(), closed: false });
    cancelWall(); setMode("select"); select(rec);
  }
  function cancelWall() { if (wallDraft) { wallDraft.line.remove(); wallDraft.dots.remove(); wallDraft = null; } }
  function placePin(p) {
    const rec = addObject("pin", { x: p.x, y: p.y, ip: $("pinIp").value.trim(), label: $("pinLabel").value.trim() });
    select(rec);
  }

  // ---------- move ----------
  function objOrigin(rec) {
    if (rec.type === "wall") return { points: rec.data.points.map((p) => p.slice()) };
    return { x: rec.data.x, y: rec.data.y };
  }
  function moveRec(rec, orig, dx, dy) {
    if (rec.type === "wall") rec.data.points = orig.points.map(([x, y]) => [x + dx, y + dy]);
    else { rec.data.x = orig.x + dx; rec.data.y = orig.y + dy; }
    renderRec(rec);
  }

  // ---------- pointer ----------
  svg.addEventListener("contextmenu", (e) => e.preventDefault());
  svg.addEventListener("pointerdown", (e) => {
    if (e.button === 2 || e.button === 1) {           // pan (right/middle drag)
      down = { pan: true, u: toUser(e.clientX, e.clientY), v: { x: view.x, y: view.y } };
      svg.setPointerCapture(e.pointerId); return;
    }
    const p = toSvg(e);
    down = { cx: e.clientX, cy: e.clientY, moved: false, sx: p.x, sy: p.y };
    if (mode === "select") { const rec = recOf(e.target); down.rec = rec; if (rec) down.orig = objOrigin(rec); }
    else if (mode === "room") roomStart = p;
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    const p = toSvg(e);
    $("statCoords").textContent = `x: ${r1(p.x)}  y: ${r1(p.y)}`;
    if (mode === "wall" && wallDraft) updateWallPreview(p);
    if (!down) return;
    if (down.pan) { const u = toUser(e.clientX, e.clientY); view.x = down.v.x + (u.x - down.u.x); view.y = down.v.y + (u.y - down.u.y); applyView(); return; }
    if (Math.hypot(e.clientX - down.cx, e.clientY - down.cy) > 4) down.moved = true;
    if (mode === "room" && roomStart) updateRoomPreview(roomStart, p);
    if (mode === "select" && down.rec && down.moved) moveRec(down.rec, down.orig, p.x - down.sx, p.y - down.sy);
  });
  svg.addEventListener("pointerup", (e) => {
    try { svg.releasePointerCapture(e.pointerId); } catch {}
    if (!down) return;
    if (down.pan) { down = null; return; }
    const p = toSvg(e);
    if (mode === "room" && roomStart) { finalizeRoom(roomStart, p); roomStart = null; down = null; return; }
    if (!down.moved) {                                // a click
      if (mode === "pin") placePin(p);
      else if (mode === "wall") addWallPoint(p);
      else if (mode === "select") select(down.rec || null);
    } else if (mode === "select" && down.rec) { refreshList(); }
    down = null;
  });
  svg.addEventListener("dblclick", () => { if (mode === "wall") finishWall(); });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const u = toUser(e.clientX, e.clientY), f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nk = Math.min(6, Math.max(0.4, view.k * f)), r = nk / view.k;
    view.x = u.x - (u.x - view.x) * r; view.y = u.y - (u.y - view.y) * r; view.k = nk; applyView();
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "Enter" && mode === "wall") finishWall();
    if (e.key === "Escape") { cancelWall(); if (roomPreview) { roomPreview.remove(); roomPreview = null; roomStart = null; } if (mode !== "select") setMode("select"); }
    if ((e.key === "Delete" || e.key === "Backspace") && selected) removeSelected();
  });

  // ---------- modes / inspector ----------
  const LABELS = { select: "Pilih", room: "Ruangan", wall: "Tembok", pin: "Pin Device" };
  function setMode(m) {
    cancelWall(); if (roomPreview) { roomPreview.remove(); roomPreview = null; } roomStart = null;
    mode = m;
    document.querySelectorAll(".btn.mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    if (m !== "select" && selected) select(null);
    svg.classList.toggle("sel", m === "select");
    $("statMode").innerHTML = `Mode: <b>${LABELS[m]}</b>`;
    const tips = { select: "Klik objek untuk pilih; drag untuk geser. Delete = hapus. Drag-kanan = geser peta.",
      room: "Klik-drag untuk gambar kotak ruangan.", wall: "Klik titik demi titik; Enter selesai.", pin: "Klik untuk taruh pin device." };
    tipEl.innerHTML = tips[m] || "";
    updateInspector();
  }
  function show(id, on) { $(id).classList.toggle("hidden", !on); }
  function updateInspector() {
    const t = selected && selected.type;
    show("secRoomNew", mode === "room");
    show("secWallNew", mode === "wall");
    show("secPin", mode === "pin" || t === "pin");
    show("secRoomSel", t === "room");
    show("secActions", !!selected);
    if (t === "room") { $("roomLabel").value = selected.data.label || ""; $("roomW").value = selected.data.w; $("roomH").value = selected.data.h; $("roomColor").value = rgbToHex(selected.data.color); }
    if (t === "pin") { $("pinIp").value = selected.data.ip || ""; $("pinLabel").value = selected.data.label || ""; }
  }
  function refreshList() {
    const ul = $("objList"); $("statCount").textContent = `${objects.length} objek`;
    if (!objects.length) { ul.innerHTML = `<div class="empty">Belum ada objek.</div>`; return; }
    ul.innerHTML = "";
    objects.forEach((o) => {
      const li = document.createElement("li"); if (o === selected) li.className = "sel";
      const nm = o.data.label || o.data.ip || o.type;
      li.innerHTML = `<span class="tag">${o.type}</span><span class="nm">${esc(nm)}</span><span class="x">✕</span>`;
      li.onclick = (ev) => { if (ev.target.classList.contains("x")) { select(o); removeSelected(); return; } if (mode !== "select") setMode("select"); select(o); };
      ul.appendChild(li);
    });
  }

  // ---------- inspector edits ----------
  $("roomLabel").oninput = () => { if (selected?.type === "room") { selected.data.label = $("roomLabel").value; renderRec(selected); refreshList(); } };
  $("roomW").onchange = () => { if (selected?.type === "room") { selected.data.w = Math.max(15, +$("roomW").value || 15); renderRec(selected); } };
  $("roomH").onchange = () => { if (selected?.type === "room") { selected.data.h = Math.max(15, +$("roomH").value || 15); renderRec(selected); } };
  $("roomColor").oninput = () => { if (selected?.type === "room") { selected.data.color = $("roomColor").value; renderRec(selected); } };
  $("pinIp").oninput = () => { if (selected?.type === "pin") { selected.data.ip = $("pinIp").value; renderRec(selected); refreshList(); } };
  $("pinLabel").oninput = () => { if (selected?.type === "pin") { selected.data.label = $("pinLabel").value; renderRec(selected); refreshList(); } };
  $("btnDel").onclick = removeSelected;
  document.querySelectorAll(".btn.mode").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $("snap").onchange = (e) => (snapOn = e.target.checked);

  // ---------- denah ----------
  $("btnDenah").onclick = () => $("fileDenah").click();
  $("fileDenah").onchange = (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const asp = img.height / img.width, W = 1120, H = W * asp;
      denahImg.setAttribute("href", url); denahImg.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
      denahImg.setAttribute("width", W); denahImg.setAttribute("height", H);
      denahImg.style.display = ""; updateDenah();
      $("secDenah").classList.remove("hidden");
      toast("Denah dimuat sebagai alas jiplak", true);
    };
    img.src = url;
  };
  function updateDenah() { denahImg.setAttribute("opacity", $("denahOp").value); denahImg.style.display = $("denahShow").checked ? "" : "none"; }
  ["denahOp", "denahShow"].forEach((id) => ($(id).oninput = updateDenah));

  // ---------- save / load / new ----------
  function buildLayout() {
    return {
      version: 1, viewBox: [0, 0, 1120, 780],
      rooms: objects.filter((o) => o.type === "room").map((o) => ({ x: r1(o.data.x), y: r1(o.data.y), w: r1(o.data.w), h: r1(o.data.h), label: o.data.label || "", color: o.data.color })),
      walls: objects.filter((o) => o.type === "wall").map((o) => ({ points: o.data.points.map(([x, y]) => [r1(x), r1(y)]), closed: !!o.data.closed })),
      pins: objects.filter((o) => o.type === "pin").map((o) => ({ x: r1(o.data.x), y: r1(o.data.y), ip: o.data.ip || "", label: o.data.label || "" })),
    };
  }
  $("btnSave").onclick = () => {
    const blob = new Blob([JSON.stringify(buildLayout(), null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "layout2d.json"; a.click();
    toast("layout2d.json diunduh. Taruh di v2/public/ agar Viewer memuatnya.", true);
  };
  $("btnLoad").onclick = () => $("fileLayout").click();
  $("fileLayout").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; f.text().then((t) => { try { loadLayout(JSON.parse(t)); toast("Layout dimuat", true); } catch { toast("JSON tidak valid", false); } }); };
  $("btnNew").onclick = () => { if (confirm("Kosongkan layout?")) clearAll(); };
  function clearAll() { objects.slice().forEach((o) => o.el.remove()); objects = []; for (const k in byId) delete byId[k]; selected = null; refreshList(); updateInspector(); }
  function loadLayout(L) {
    clearAll();
    (L.rooms || []).forEach((r) => addObject("room", { x: r.x, y: r.y, w: r.w, h: r.h, label: r.label || "", color: r.color || "#27324e" }));
    (L.walls || []).forEach((w) => addObject("wall", { points: (w.points || []).map((p) => p.slice()), closed: !!w.closed }));
    (L.pins || []).forEach((p) => addObject("pin", { x: p.x, y: p.y, ip: p.ip || "", label: p.label || "" }));
  }

  // ---------- util + WS (IP autocomplete) ----------
  function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }
  function rgbToHex(c) { if (!c) return "#27324e"; if (c[0] === "#") return c.slice(0, 7); const m = c.match(/\d+/g); if (!m) return "#27324e"; return "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join(""); }
  let toastT; function toast(msg, ok) { const t = $("toast"); t.textContent = msg; t.className = (ok ? "ok" : "err") + " show"; clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3000); }

  applyView(); setMode("select"); refreshList();
  window.__fbReady = true;
})();
