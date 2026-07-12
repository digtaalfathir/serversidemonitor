# v2 — MONITORING (Viewer 3D/2D)

App v2 = **monitoring** (viewer). Terpisah dari dashboard v1 dan dari **Builder**
(app authoring sendiri, lihat `../builder/`). v2 hanya **menampilkan** denah +
**status device live** dari backend monitoring via WebSocket (di-proxy).

```
v2/
  server.js            ← server statik v2 + proxy /ws → backend monitoring
  public/
    index.html         ← launcher (Viewer 3D / Viewer 2D)
    scene-view.html    + js/scene-view.js          (viewer 3D)
    floormap.html      + js/floormap.js + css/floormap.css   (viewer 2D)
    scene.example.json · layout2d.example.json     ← contoh
    models/            ← file .glb (dipakai scene 3D)
    vendor/three/      ← Three.js lokal (offline)
```
> **Builder ada di folder terpisah `builder/`** (repo root) — jalankan `npm run builder`.

## Menjalankan
```bash
npm start     # backend monitoring (v1) di :10101  — sumber status device
npm run v2    # app monitoring v2 di :10102         — buka http://localhost:10102
```
Butuh `npm start` agar status device (warna pin, detail) muncul. Tanpa itu → pin abu.

## Alur pakai
1. Buat denah di **Builder** (`npm run builder`, :10103) → **Simpan** `scene.json` (3D) / `layout2d.json` (2D) + siapkan `.glb`.
2. Taruh `scene.json` / `layout2d.json` di **`v2/public/`**, model `.glb` di **`v2/public/models/`**.
3. Buka **Viewer 3D** (`/scene-view.html`) / **Viewer 2D** (`/floormap.html`) → denah + status live.

**Pin ↔ device asli** dicocokkan lewat **IP** (`pin.ip` / `model.deviceIp` = `device.ip`).
