# v2 — Digital Twin (Scene Builder + Viewer 3D/2D)

Aplikasi v2 **berdiri sendiri**, terpisah dari app monitoring (v1). Menjalankan
v2 hanya menjalankan v2 — tidak menyalakan dashboard monitoring. v2 hanya
**mengambil status device** dari backend monitoring lewat WebSocket (di-proxy).

```
v2/
  server.js            ← server statik v2 + proxy /ws → backend monitoring
  README.md            ← file ini
  public/
    index.html         ← launcher (Builder / Viewer 3D / Viewer 2D)
    builder/           ← SATU app Builder, toggle 3D | 2D
      index.html         (shell + toggle; embed 3d/ atau 2d/ via iframe)
      3d/  index.html + builder.js + builder.css   (builder 3D, WebGL)
      2d/  index.html + builder.js + builder.css   (builder 2D, SVG)
    scene-view.html    + js/scene-view.js          (viewer 3D)
    floormap.html      + js/floormap.js + css/floormap.css   (viewer 2D)
    scene.example.json · layout2d.example.json     ← contoh
    models/            ← file .glb + models.json (katalog)
    vendor/three/      ← Three.js lokal (offline, tanpa CDN)
```

## Menjalankan

**Cara utama (dengan status live):**
```bash
npm start     # backend monitoring (v1) di :10101  — sumber status device
npm run v2    # app v2 di :10102                    — buka http://localhost:10102
```
Builder ada di **`/builder/`** — tinggal pilih **3D** atau **2D** di atas.

**Builder saja, tanpa backend (benar-benar standalone):**
Builder **tidak butuh backend sama sekali** (tidak ada WebSocket lagi — IP device
diketik manual). Cukup sajikan folder statis:
```bash
npx serve v2/public      # atau server statik apa pun → buka /builder/
```
(Font memakai Google Fonts; kalau offline otomatis fallback ke font sistem.)

## Tidak bergantung pada v1
- **Builder & Viewer** = file statik di `v2/public/` + Three.js lokal di `vendor/`.
- Satu-satunya sentuhan ke monitoring = **status device via `/ws`** (di-proxy `server.js`) untuk **Viewer**.
- **Builder tidak menyentuh backend sama sekali.**

## Alur pakai
1. **Builder** (`/builder/`) → pilih **3D** (scene.json) atau **2D** (layout2d.json):
   gambar tembok/lantai/pintu/pin/teks/model → **Simpan**.
2. Taruh `scene.json` / `layout2d.json` di `v2/public/`, model `.glb` di `v2/public/models/`.
3. **Viewer 3D** (`/scene-view.html`) / **Viewer 2D** (`/floormap.html`) memuat + status live.

## Katalog model (`models/models.json`)
```jsonc
{ "models": [ { "file": "inject.glb", "name": "Mesin Inject" }, … ] }
```
`file` relatif ke `models/`. Di Builder: klik item → taruh di tengah, atau **drag**
ke lantai. Tombol ⟳ untuk muat ulang daftar.

## Pintasan Builder
- **Shift/Ctrl+klik** = pilih banyak · **Ctrl+D** duplikat · **Delete** hapus (semua terpilih).
- **Ctrl+Z / Ctrl+Y** = undo / redo.
- Mode Tembok: **Enter** selesai, **Esc** batal; centang **Lurus** untuk kunci sudut.
  Titik nempel (snap) ke vertex tembok lain; ada garis bantu sejajar.
- Pilih tembok → drag titik kuning untuk ubah bentuk; edit tinggi/tebal/lubang di panel.
