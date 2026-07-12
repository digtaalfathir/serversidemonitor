/**
 * Builder (v2) — SERVER SENDIRI, terpisah dari monitoring.
 *
 * Authoring app (3D + 2D) untuk membuat scene.json / layout2d.json.
 * TIDAK butuh backend/monitoring sama sekali — murni statik.
 *
 *   npm run builder            → http://localhost:10103
 *   BUILDER_PORT=xxxx          → ganti port
 *
 * Hasil: unduh scene.json (3D) / layout2d.json (2D) + siapkan .glb, lalu taruh
 * di app monitoring (v2/public/) untuk ditampilkan Viewer.
 */
const path = require("path");
const express = require("express");

const PORT = process.env.BUILDER_PORT || 10103;
const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log("========================================");
  console.log("  Builder v2 — BERDIRI SENDIRI (tanpa backend)");
  console.log(`  App    : http://localhost:${PORT}   (pilih 3D / 2D)`);
  console.log("========================================");
});
