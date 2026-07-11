# v2 — Digital Twin (Scene Builder + Viewer 3D/2D)

Aplikasi v2 **berdiri sendiri**, terpisah dari app monitoring (v1). Menjalankan
v2 hanya menjalankan v2 — tidak menyalakan dashboard monitoring. v2 hanya
**mengambil status device** dari backend monitoring lewat WebSocket (di-proxy).

```
v2/
  server.js            ← server statik v2 + proxy /ws → backend monitoring
  README.md            ← file ini
  public/
    index.html         ← launcher (Builder / Viewer 3D / Peta 2D)
    scene-builder.html  + js/scene-builder.js  + css/scene-builder.css
    scene-view.html     + js/scene-view.js       (viewer 3D runtime)
    floormap.html       + js/floormap.js         (peta 2D)
    scene.example.json  ← contoh scene
    models/             ← file .glb + models.json (katalog)
    vendor/three/       ← Three.js lokal (offline, tanpa CDN)
```

## Menjalankan

**Cara utama (dengan status live):**
```bash
npm start     # backend monitoring (v1) di :10101  — sumber status device
npm run v2    # app v2 di :10102                    — buka http://localhost:10102
```

**Builder saja, tanpa apa pun (benar-benar standalone):**
Scene Builder **tidak butuh backend sama sekali** — WebSocket hanya dipakai untuk
autocomplete IP (kalau tidak ada, dilewati). Jadi cukup sajikan folder statis:
```bash
npx serve v2/public      # atau server statik apa pun
# lalu buka /scene-builder.html
```
(Font memakai Google Fonts; kalau offline otomatis fallback ke font sistem.)

## Tidak bergantung pada v1
- **Builder & Viewer** = file statik di `v2/public/` + Three.js lokal di `vendor/`.
- Satu-satunya sentuhan ke monitoring = **status device via `/ws`** (di-proxy `server.js`),
  dan itu pun opsional untuk Builder.
- Untuk memindah v2 ke mesin/proyek lain: cukup salin folder `v2/` + `node_modules`
  (express + ws) — tidak perlu membawa `src/` monitoring.

## Alur pakai
1. **Scene Builder** (`/scene-builder.html`): gambar tembok/lantai/pintu/pin/teks,
   taruh model dari **Katalog**, atur pencahayaan → **Simpan scene.json**.
2. Taruh `scene.json` di `v2/public/`, model `.glb` di `v2/public/models/`.
3. **Viewer 3D** (`/scene-view.html`) / **v2 Cisco** memuat scene + status live.

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
