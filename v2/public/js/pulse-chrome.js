/* =====================================================================
   Stechoq Pulse — CHROME bersama (dipakai index.html [3D] & floormap.html [2D])
   Tanggung jawab: tema gelap/terang, toggle 2D/3D, deep-link ?loc=&view=,
   dan pemilih lokasi (dropdown ala Cisco) dari /api/locations.
   Data scene/summary tetap diurus scene-view.js / floormap.js masing-masing.
   ===================================================================== */
(function () {
  const html = document.documentElement;
  const params = new URLSearchParams(location.search);
  const CURRENT_VIEW = document.body.dataset.view === "2d" ? "2d" : "3d";
  const locParam = params.get("loc");

  function buildURL(loc, view) {
    const page = view === "2d" ? "/floormap.html" : "/";
    const qs = new URLSearchParams();
    if (loc) qs.set("loc", loc);
    qs.set("view", view);
    return `${page}?${qs.toString()}`;
  }

  // ---- deep-link: hormati ?view= kalau beda dgn halaman ini (mis. /?view=2d → pindah ke 2D) ----
  const wantView = params.get("view");
  if (wantView === "2d" && CURRENT_VIEW === "3d") { location.replace(buildURL(locParam, "2d")); return; }
  if (wantView === "3d" && CURRENT_VIEW === "2d") { location.replace(buildURL(locParam, "3d")); return; }

  // ---- tema ----
  const themeBtn = document.getElementById("themeToggle");
  function applyTheme(t) {
    html.setAttribute("data-theme", t);
    localStorage.setItem("pulse-theme", t);
    if (themeBtn) themeBtn.textContent = t === "light" ? "☀️" : "🌙";
    window.dispatchEvent(new CustomEvent("pulse-theme", { detail: t }));   // scene-view.js dengarkan (kanvas 3D)
  }
  if (themeBtn) {
    themeBtn.onclick = () => applyTheme(html.getAttribute("data-theme") === "light" ? "dark" : "light");
    themeBtn.textContent = html.getAttribute("data-theme") === "light" ? "☀️" : "🌙";
  }

  // ---- toggle 2D / 3D (pindah viewer, bawa lokasi + view) ----
  let activeLocId = locParam;                 // di-update setelah fetch (default = lokasi pertama)
  const t3d = document.getElementById("t3d"), t2d = document.getElementById("t2d");
  if (t3d) t3d.onclick = () => { if (CURRENT_VIEW !== "3d") location.href = buildURL(activeLocId, "3d"); };
  if (t2d) t2d.onclick = () => { if (CURRENT_VIEW !== "2d") location.href = buildURL(activeLocId, "2d"); };

  // ---- pemilih lokasi (D2) — hanya muncul kalau ada >1 lokasi ----
  const nav = document.getElementById("locNav");
  fetch("/api/locations", { cache: "no-store" })
    .then((r) => r.json())
    .then((data) => {
      const list = data.locations || [];
      const active = list.find((l) => l.id === locParam) || list[0] || null;
      activeLocId = active ? active.id : locParam;
      if (!nav || list.length <= 1) return;   // 1 lokasi → nama sudah tampil di panel kiri, tak perlu dropdown
      const sel = document.createElement("select");
      sel.className = "loc-select";
      sel.setAttribute("aria-label", "Pilih lokasi");
      list.forEach((l) => {
        const o = document.createElement("option");
        o.value = l.id; o.textContent = l.name;
        if (active && l.id === active.id) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = () => (location.href = buildURL(sel.value, CURRENT_VIEW));   // D3: pindah lokasi, view tetap
      nav.appendChild(sel);
    })
    .catch(() => {});

  // ---- E3: cari device (nama/IP) → sorot & fly-to. Data & fly-to dari viewer via hook. ----
  const box = document.getElementById("searchBox");
  const results = document.getElementById("searchResults");
  const dotColor = (s) => (s === "UP" ? "var(--up)" : s === "DOWN" ? "var(--down)" : "var(--unknown)");
  let items = [], active = -1;
  function render(q) {
    if (!results) return;
    const ql = q.trim().toLowerCase();
    const all = window.pulseGetTargets ? window.pulseGetTargets() : [];
    items = ql ? all.filter((t) => (t.name || "").toLowerCase().includes(ql) || (t.ip || "").toLowerCase().includes(ql)).slice(0, 10) : [];
    active = -1;
    if (!ql) { results.classList.remove("show"); results.innerHTML = ""; return; }
    results.innerHTML = items.length
      ? items.map((t, i) => `<div class="sr-item" data-i="${i}"><span class="sr-dot" style="background:${dotColor(t.status)}"></span><span class="sr-name">${t.name || t.ip}</span><span class="sr-ip">${t.ip}</span></div>`).join("")
      : `<div class="sr-empty">Tak ada yang cocok.</div>`;
    results.classList.add("show");
    results.querySelectorAll(".sr-item").forEach((el) => (el.onclick = () => choose(+el.dataset.i)));
  }
  function mark() { results.querySelectorAll(".sr-item").forEach((el, i) => el.classList.toggle("active", i === active)); }
  function choose(i) {
    const t = items[i]; if (!t) return;
    if (window.pulseFocus) window.pulseFocus(t.ip);
    results.classList.remove("show"); if (box) box.blur();
  }
  if (box) {
    box.addEventListener("input", () => render(box.value));
    box.addEventListener("focus", () => box.value && render(box.value));
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { box.value = ""; results.classList.remove("show"); box.blur(); return; }
      if (!items.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % items.length; mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + items.length) % items.length; mark(); }
      else if (e.key === "Enter") { e.preventDefault(); choose(active >= 0 ? active : 0); }
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".tb-search")) results.classList.remove("show"); });
  }

  // ---- E4: filter status (Semua / Up / Down) → viewer redupkan yg tak cocok ----
  const filterBox = document.getElementById("statusFilter");
  if (filterBox) {
    filterBox.querySelectorAll("button").forEach((btn) => {
      btn.onclick = () => {
        filterBox.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (window.pulseFilter) window.pulseFilter(btn.dataset.f);
      };
    });
  }
})();
