# v2 — 3D Monitoring gaya Cisco (standalone, parkir)

Prototipe v2 **berdiri sendiri dalam satu file**: `v2.html`.
Memuat **scene.json buatanmu** (hasil Scene Builder) + model `.glb` dari
`/models/`, lalu menempel status device live. Tampilan patokan **Cisco Spaces**
(flat/clean, tanpa glow): kartu status melayang + panel kiri occupancy.

Disimpan di `unused/` agar repo rapi & tidak mengganggu v1 — tinggal aktifkan
kalau mau dilanjut.

## Mengaktifkan
File di `unused/` tidak disajikan server (Express hanya menyajikan `public/`).

```bash
cp unused/v2-cisco/v2.html public/v2.html      # 1) salin halaman
# 2) taruh scene.json kamu di  public/scene.json
# 3) taruh model 3D di          public/models/*.glb   (folder yang seharusnya)
npm start
# buka http://localhost:10101/v2.html
```

Butuh server jalan karena memakai `/vendor/three/…`, `/scene.json`, `/models/…`, dan `/ws`.

Mau coba pakai contoh dulu: `http://localhost:10101/v2.html?scene=/scene.example.json`
Selesai coba & mau rapikan lagi: `rm public/v2.html`.

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
