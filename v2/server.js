/**
 * v2 — Digital Twin (Scene Builder + Viewer 3D/2D) — SERVER SENDIRI.
 *
 * Berdiri sendiri, TERPISAH dari app monitoring (v1). Menjalankan ini hanya
 * menjalankan v2 (static files di v2/public). Untuk status device live, server
 * ini mem-PROXY /ws ke backend monitoring (v1) — v2 cuma konsumen data; yang
 * meng-ping device tetap backend monitoring.
 *
 *   npm run v2            → http://localhost:10102
 *   V2_PORT=xxxx          → ganti port v2
 *   MONITOR_WS=ws://host:10101/ws → sumber status device (default localhost:10101)
 *
 * Kalau backend monitoring tidak jalan: Builder tetap 100% berfungsi; hanya
 * status live di viewer yang kosong (wajar — tidak ada sumber data).
 */

const path = require("path");
const http = require("http");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = process.env.V2_PORT || 10102;
const MONITOR_WS = process.env.MONITOR_WS || "ws://localhost:10101/ws";

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);

// ---- Proxy WebSocket /ws → backend monitoring ----
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (client) => {
  const upstream = new WebSocket(MONITOR_WS);
  const closeBoth = () => { try { client.close(); } catch {} try { upstream.close(); } catch {} };
  upstream.on("message", (d) => { if (client.readyState === WebSocket.OPEN) client.send(d.toString()); });
  client.on("message", (d) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(d.toString()); });
  upstream.on("close", closeBoth);
  client.on("close", closeBoth);
  upstream.on("error", (e) => { console.warn("[v2] upstream WS error:", e.message); closeBoth(); });
  client.on("error", closeBoth);
});

server.listen(PORT, () => {
  console.log("========================================");
  console.log("  v2 Digital Twin — BERDIRI SENDIRI");
  console.log(`  App    : http://localhost:${PORT}`);
  console.log(`  Builder: http://localhost:${PORT}/scene-builder.html`);
  console.log(`  Viewer : http://localhost:${PORT}/scene-view.html`);
  console.log(`  2D Map : http://localhost:${PORT}/floormap.html`);
  console.log(`  Status device di-proxy dari: ${MONITOR_WS}`);
  console.log("========================================");
});
