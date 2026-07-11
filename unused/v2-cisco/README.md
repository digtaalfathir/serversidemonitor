# v2 — 3D Monitoring gaya Cisco (standalone, parkir)

Prototipe v2 **berdiri sendiri dalam satu file**: `v2.html`.
Memuat **scene.json buatanmu** (hasil Scene Builder) + model `.glb` dari
`/models/`, lalu menempel status device live. Tampilan patokan **Cisco Spaces**
(flat/clean, tanpa glow): kartu status melayang + panel kiri occupancy.

Disimpan di `unused/` agar repo rapi & tidak mengganggu v1 — tinggal aktifkan
kalau mau dilanjut.

## Mengaktifkan
v2 sekarang **app terpisah** di folder `v2/` (server sendiri). File `unused/`
tidak disajikan. Untuk mengaktifkan halaman Cisco ini, salin ke `v2/public/`:

```bash
cp unused/v2-cisco/v2.html v2/public/v2.html   # 1) salin halaman ke app v2
# 2) taruh scene.json kamu di  v2/public/scene.json
# 3) taruh model 3D di          v2/public/models/*.glb
npm run v2
# buka http://localhost:10102/v2.html
```

Server v2 (`npm run v2`) mem-proxy `/ws` ke backend monitoring (default
`ws://localhost:10101/ws`) untuk status live. Builder tetap jalan walau backend
monitoring mati.

Contoh: `http://localhost:10102/v2.html?scene=/scene.example.json`
Selesai coba: `rm v2/public/v2.html`.

## Folder yang seharusnya
```
public/
  v2.html            ← halaman v2 (hasil salin dari sini)
  scene.json         ← scene buatanmu (dari Scene Builder → Simpan)
  models/
    inject.glb       ← model 3D yang direferensikan scene.json
    forklift.glb
```
Ganti scene = ganti `public/scene.json`. Tambah 3D = taruh `.glb` di `public/models/`
dan referensikan path-nya lewat Scene Builder (field Path model).

## Cara pin nyambung ke device asli
**Jembatannya = IP.** Pin punya `ip`, model punya `deviceIp`. Server kirim
device live via `/ws` (punya `ip` + `status`). Kode mencocokkan
`device.ip === pin.ip` (atau `model.deviceIp`) → warnai penanda + kartu status
(**hijau UP / merah DOWN**). Tidak ada konfigurasi lain: samakan IP = tersambung.

## Hubungan dengan tool v2 lain (di `public/`)
- `scene-builder.html` — bikin scene (tembok/lantai/pintu/pin/teks/model) → **Simpan scene.json**.
- `scene-view.html` — versi runtime "resmi" (WYSIWYG dengan Scene Builder: ada
  tooltip + panel detail per device).
- `v2.html` (ini) — versi presentasi **Cisco flat** dari scene yang sama, dalam
  satu file mandiri. Sumber scene & model identik (`scene.json` + `/models/`).
