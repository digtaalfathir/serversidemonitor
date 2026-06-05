const ping = require("ping");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const TIMEZONE = "Asia/Jakarta";
const LOG_DIR = path.join(__dirname, "logs");
const INTERVAL_MS = 3000;
const INTERVAL_SEC = INTERVAL_MS / 1000;
const WS_PORT = 10012;

// ================= WEBSOCKET SERVER =================
const wss = new WebSocket.Server({ port: WS_PORT });

// pastikan ada folder logs
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ---------------- Shared flags file (single JSON) ----------------
const SHARED_DIR = path.join(__dirname, "..", "shared");
if (!fs.existsSync(SHARED_DIR)) fs.mkdirSync(SHARED_DIR, { recursive: true });

const GLOBAL_FLAG_FILE = path.join(SHARED_DIR, "needrestart.json");

// load existing flags (if ada)
let globalFlags = {};
if (fs.existsSync(GLOBAL_FLAG_FILE)) {
  try {
    globalFlags = JSON.parse(fs.readFileSync(GLOBAL_FLAG_FILE, "utf8"));
  } catch (e) {
    console.error("Gagal load existing needrestart.json:", e);
    globalFlags = {};
  }
}

// helper untuk menulis file global
function writeGlobalFlagsToDisk() {
  try {
    fs.writeFileSync(GLOBAL_FLAG_FILE, JSON.stringify(globalFlags, null, 2));
    appendLogLine(`GLOBAL FLAG wrote ${GLOBAL_FLAG_FILE}`);
  } catch (e) {
    console.error("Gagal menulis flag global:", e);
  }
}

function updateGlobalFlag(key, value) {
  globalFlags[key] = !!value;
  writeGlobalFlagsToDisk();
}

function sanitizeFlagKey(name) {
  // remove non-alphanumeric, to-lowercase; prefix needrestart
  return "needrestart" + name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ---------------- end shared flags ----------------

// ================= DEVICE DEFINITIONS (from devices.json) =================
// Severity levels: CRITICAL, HIGH, MEDIUM, LOW
const DEVICES_FILE = path.join(__dirname, "devices.json");

function loadDevices() {
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      const raw = fs.readFileSync(DEVICES_FILE, "utf8");
      const list = JSON.parse(raw);
      return list.map(d => ({
        name: d.name,
        ip: d.ip,
        severity: d.severity || "MEDIUM",
        status: "UNKNOWN",
        // metadata
        owner: d.owner || "",
        location: d.location || "",
        vendor: d.vendor || "",
        notes: d.notes || "",
      }));
    }
  } catch (e) {
    console.error("Gagal load devices.json:", e);
  }
  return [];
}

function saveDevices() {
  try {
    const toSave = devices.map(d => ({
      name: d.name,
      ip: d.ip,
      severity: d.severity,
      owner: d.owner || "",
      location: d.location || "",
      vendor: d.vendor || "",
      notes: d.notes || "",
    }));
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(toSave, null, 2));
    appendLogLine(`DEVICES saved to ${DEVICES_FILE} (${devices.length} devices)`);
  } catch (e) {
    console.error("Gagal menyimpan devices.json:", e);
  }
}

const devices = loadDevices();

// warna untuk console
const color = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  reset: "\x1b[0m",
};

// ================= TIME HELPERS =================
function nowDateObj() {
  return new Date();
}
function dateStrLocal(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}
function timeStrLocal(date = new Date()) {
  return date.toLocaleTimeString("en-GB", { timeZone: TIMEZONE });
}
function dateTimeLocal(date = new Date()) {
  return `${dateStrLocal(date)} ${timeStrLocal(date)}`;
}

// ================= LOGGING =================
function logFilePathFor(date = new Date()) {
  const fname = `${dateStrLocal(date)}.log`;
  return path.join(LOG_DIR, fname);
}
function appendLogLine(line, date = new Date()) {
  const file = logFilePathFor(date);
  const final = `[${dateTimeLocal(date)}] ${line}\n`;
  fs.appendFile(file, final, err => {
    if (err) console.error("Gagal menulis log:", err);
  });
}

// ================= SNAPSHOT (status_snapshot.json) =================
const SNAPSHOT_FILE = path.join(LOG_DIR, "status_snapshot.json");

function saveSnapshot(data) {
  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Gagal menyimpan snapshot:", e);
  }
}

function loadSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      const raw = fs.readFileSync(SNAPSHOT_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Gagal load snapshot:", e);
  }
  return null;
}

// ================= DAILY STATS (logs/daily_stats.json) =================
const DAILY_STATS_FILE = path.join(LOG_DIR, "daily_stats.json");

function loadDailyStats() {
  try {
    if (fs.existsSync(DAILY_STATS_FILE)) {
      const raw = fs.readFileSync(DAILY_STATS_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Gagal load daily_stats.json:", e);
  }
  return {};
}

function saveDailyStats(stats) {
  try {
    fs.writeFileSync(DAILY_STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (e) {
    console.error("Gagal menyimpan daily_stats.json:", e);
  }
}

/**
 * dailyStats structure:
 * {
 *   date: "2026-06-04",
 *   devices: {
 *     "DCS QI F4": { upSeconds: 12345, downSeconds: 155 },
 *     ...
 *   }
 * }
 */
let dailyStats = loadDailyStats();

// reset jika hari sudah berganti
function checkDailyReset() {
  const today = dateStrLocal();
  if (dailyStats.date && dailyStats.date !== today) {
    appendLogLine(`DAILY RESET: statistik hari ${dailyStats.date} direset untuk hari baru ${today}`);
    dailyStats = { date: today, devices: {} };
    saveDailyStats(dailyStats);
  }
  if (!dailyStats.date) {
    dailyStats.date = today;
    dailyStats.devices = dailyStats.devices || {};
  }
}

function updateAvailability(deviceName, status) {
  checkDailyReset();
  if (!dailyStats.devices[deviceName]) {
    dailyStats.devices[deviceName] = { upSeconds: 0, downSeconds: 0 };
  }
  const d = dailyStats.devices[deviceName];
  if (status === "UP") {
    d.upSeconds += INTERVAL_SEC;
  } else if (status === "DOWN") {
    d.downSeconds += INTERVAL_SEC;
  }
  // save setiap update (bisa dioptimasi nanti kalau perlu)
  saveDailyStats(dailyStats);
}

function getAvailability(deviceName) {
  checkDailyReset();
  const d = dailyStats.devices && dailyStats.devices[deviceName];
  if (!d || (d.upSeconds + d.downSeconds) === 0) {
    return { uptimeToday: 100, downtimeTodaySec: 0 };
  }
  const total = d.upSeconds + d.downSeconds;
  const uptimeToday = parseFloat(((d.upSeconds / total) * 100).toFixed(2));
  return { uptimeToday, downtimeTodaySec: d.downSeconds };
}

// ================= HISTORY (logs/history.json) =================
const HISTORY_FILE = path.join(LOG_DIR, "history.json");
const HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 jam

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Gagal load history.json:", e);
  }
  return {};
}

function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) {
    console.error("Gagal menyimpan history.json:", e);
  }
}

/**
 * history structure:
 * {
 *   "DCS QI F4": [
 *     { timestamp: "2026-06-04 14:22:00", status: "DOWN" },
 *     { timestamp: "2026-06-04 14:25:00", status: "UP" }
 *   ]
 * }
 */
let history = loadHistory();

function pruneOldHistory() {
  const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
  for (const deviceName of Object.keys(history)) {
    history[deviceName] = (history[deviceName] || []).filter(entry => {
      try {
        const ts = entry.timestamp.replace(" ", "T");
        return new Date(ts).getTime() >= cutoff;
      } catch {
        return false;
      }
    });
  }
}

function updateHistory(deviceName, newStatus) {
  if (!history[deviceName]) {
    history[deviceName] = [];
  }
  history[deviceName].push({
    timestamp: dateTimeLocal(),
    status: newStatus,
  });
  pruneOldHistory();
  saveHistory(history);
}

// ================= STATE =================
// untuk track perubahan: lastStatus[name] = "UP"/"DOWN"/"UNKNOWN"
// downSince[name] = datetime string when it went down
// latency[name] = ms or null
const lastStatus = {};
const downSince = {};
const latency = {};

// ================= LATENCY STATS (rolling window) =================
const LATENCY_WINDOW_SIZE = 20; // simpan 20 sample terakhir
const latencyHistory = {}; // latencyHistory[name] = [ms, ms, ...]

function updateLatencyStats(deviceName, latMs) {
  if (!latencyHistory[deviceName]) {
    latencyHistory[deviceName] = [];
  }
  if (latMs !== null && latMs !== undefined && !isNaN(latMs)) {
    latencyHistory[deviceName].push(latMs);
    // trim ke window size
    if (latencyHistory[deviceName].length > LATENCY_WINDOW_SIZE) {
      latencyHistory[deviceName] = latencyHistory[deviceName].slice(-LATENCY_WINDOW_SIZE);
    }
  }
}

function getLatencyStats(deviceName) {
  const samples = latencyHistory[deviceName] || [];
  if (samples.length === 0) {
    return { avgLatency: null, maxLatency: null };
  }
  const sum = samples.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / samples.length);
  const max = Math.max(...samples);
  return { avgLatency: avg, maxLatency: max };
}

// ================= RESTORE SNAPSHOT =================
const snap = loadSnapshot();
if (snap && snap.lastStatus) {
  Object.assign(lastStatus, snap.lastStatus);
  Object.assign(downSince, snap.downSince || {});
} else {
  devices.forEach(d => lastStatus[d.name] = d.status || "UNKNOWN");
}

// ================= BUILD PAYLOAD =================
function buildDevicePayload(dev) {
  const avail = getAvailability(dev.name);
  const latStats = getLatencyStats(dev.name);
  return {
    name: dev.name,
    ip: dev.ip,
    status: dev.status,
    latency: latency[dev.name] !== undefined ? latency[dev.name] : null,
    avgLatency: latStats.avgLatency,
    maxLatency: latStats.maxLatency,
    severity: dev.severity,
    downSince: downSince[dev.name] || null,
    uptimeToday: avail.uptimeToday,
    downtimeTodaySec: avail.downtimeTodaySec,
    history: history[dev.name] || [],
    // metadata
    owner: dev.owner || "",
    location: dev.location || "",
    vendor: dev.vendor || "",
    notes: dev.notes || "",
  };
}

// ================= TABLE HELPERS =================
function line(widths) {
  let out = "+";
  widths.forEach(w => out += "-".repeat(w + 2) + "+");
  return out;
}
function row(cols, widths) {
  let out = "|";
  cols.forEach((c, i) => {
    out += " " + c.toString().padEnd(widths[i]) + " |";
  });
  return out;
}

// ================= MAIN CHECK =================
async function checkAll() {
  console.clear();
  console.log(`${color.cyan}=== DEVICE STATUS MONITORING ===${color.reset}`);
  console.log("Last update:", dateTimeLocal());
  console.log("");

  // --- Ping semua device ---
  const pingTasks = devices.map(dev =>
    ping.promise.probe(dev.ip, { timeout: 1 })
      .then(res => ({
        dev,
        alive: res.alive,
        time: res.alive ? parseFloat(res.time) : null,
      }))
      .catch(() => ({ dev, alive: false, time: null }))
  );

  const results = await Promise.all(pingTasks);

  // --- Update status dan cek perubahan ---
  results.forEach(r => {
    const dev = r.dev;
    const alive = r.alive;
    const newStatus = alive ? "UP" : "DOWN";
    const prev = lastStatus[dev.name] || "UNKNOWN";

    // update latency
    latency[dev.name] = alive && r.time !== null && !isNaN(r.time)
      ? Math.round(r.time)
      : null;

    // update rolling latency stats
    updateLatencyStats(dev.name, latency[dev.name]);

    // update availability (setiap interval, bukan hanya saat berubah)
    updateAvailability(dev.name, newStatus);

    // jika status berubah, catat log dan history
    if (prev !== newStatus) {
      const flagKey = sanitizeFlagKey(dev.name);

      if (newStatus === "DOWN") {
        // mulai downtime
        const since = dateTimeLocal();
        downSince[dev.name] = since;
        appendLogLine(`ALERT: ${dev.name} (${dev.ip}) -> DOWN (started at ${since})`);

        // set global flag true only when previously was UP
        if (prev === "UP") {
          updateGlobalFlag(flagKey, true);
        }

      } else if (newStatus === "UP") {
        // recover dari downtime — catat durasi jika ada
        const since = downSince[dev.name];
        const now = dateTimeLocal();
        let durText = "";
        if (since) {
          try {
            const s = since.replace(" ", "T");
            const e = now.replace(" ", "T");
            const d1 = new Date(s);
            const d2 = new Date(e);
            const diffMs = d2 - d1;
            const sec = Math.floor(diffMs / 1000);
            const hh = Math.floor(sec / 3600);
            const mm = Math.floor((sec % 3600) / 60);
            const ss = sec % 60;
            durText = ` (downtime: ${hh}h ${mm}m ${ss}s)`;
          } catch (err) {
            durText = "";
          }
        }
        appendLogLine(`INFO: ${dev.name} (${dev.ip}) -> UP at ${now}${durText}`);
        // clear downSince
        delete downSince[dev.name];

        // clear flag when recovered
        // updateGlobalFlag(flagKey, false);
      } else {
        appendLogLine(`INFO: ${dev.name} (${dev.ip}) -> ${newStatus}`);
      }

      // update lastStatus
      lastStatus[dev.name] = newStatus;

      // update history (hanya saat terjadi perubahan)
      updateHistory(dev.name, newStatus);
    }

    // update device object so UI prints current status
    dev.status = newStatus;
  });

  // --- Save snapshot ---
  saveSnapshot({ lastStatus, downSince });

  // --- Build structured payload ---
  const payload = {
    type: "update",
    timestamp: dateTimeLocal(),
    devices: devices.map(dev => buildDevicePayload(dev)),
  };

  // --- Broadcast ke semua client ---
  broadcast(payload);

  // --- Tampil tabel di console ---
  const widths = [26, 15, 8, 10, 10];
  console.log(line(widths));
  console.log(row(["DEVICE", "IP ADDRESS", "STATUS", "LATENCY", "SEVERITY"], widths));
  console.log(line(widths));

  devices.forEach(d => {
    const statusColor = d.status === "UP" ? color.green : color.red;
    const statusStr = `${statusColor}${d.status}${color.reset}`;

    const latMs = latency[d.name];
    const latStr = latMs !== null && latMs !== undefined ? `${latMs} ms` : "-";

    const sevStr = d.severity || "-";

    console.log(row([d.name, d.ip, statusStr, latStr, sevStr], widths));

    // jika sedang DOWN, tampilkan sejak kapan dan availability
    if (d.status === "DOWN" && downSince[d.name]) {
      console.log("  " + color.yellow + `down since: ${downSince[d.name]}` + color.reset);
    }

    // tampilkan availability
    const avail = getAvailability(d.name);
    if (avail.downtimeTodaySec > 0) {
      console.log("  " + color.magenta + `availability: ${avail.uptimeToday}% | downtime: ${avail.downtimeTodaySec}s` + color.reset);
    }
  });

  console.log(line(widths));
}

// ================= DEVICE CRUD HANDLER =================
function handleDeviceCommand(msg, ws) {
  const reply = (ok, message, extra) => {
    ws.send(JSON.stringify({ type: "cmd_result", ok, message, ...extra }));
  };

  switch (msg.action) {
    case "add_device": {
      const { name, ip, severity } = msg;
      if (!name || !ip) return reply(false, "Name dan IP wajib diisi.");
      if (devices.find(d => d.name === name)) return reply(false, `Device '${name}' sudah ada.`);
      if (devices.find(d => d.ip === ip)) return reply(false, `IP '${ip}' sudah digunakan.`);
      const sev = ["CRITICAL","HIGH","MEDIUM","LOW"].includes(severity) ? severity : "MEDIUM";
      devices.push({ name, ip, severity: sev, status: "UNKNOWN", owner: msg.owner || "", location: msg.location || "", vendor: msg.vendor || "", notes: msg.notes || "" });
      lastStatus[name] = "UNKNOWN";
      saveDevices();
      appendLogLine(`DEVICE ADDED: ${name} (${ip}) severity=${sev}`);
      reply(true, `Device '${name}' berhasil ditambahkan.`);
      broadcastFullUpdate();
      break;
    }
    case "edit_device": {
      const { originalName, name, ip, severity } = msg;
      const idx = devices.findIndex(d => d.name === originalName);
      if (idx === -1) return reply(false, `Device '${originalName}' tidak ditemukan.`);
      // cek duplikat nama (jika nama berubah)
      if (name !== originalName && devices.find(d => d.name === name)) return reply(false, `Nama '${name}' sudah digunakan.`);
      // cek duplikat IP (jika IP berubah)
      if (ip !== devices[idx].ip && devices.find(d => d.ip === ip)) return reply(false, `IP '${ip}' sudah digunakan.`);
      const sev = ["CRITICAL","HIGH","MEDIUM","LOW"].includes(severity) ? severity : devices[idx].severity;
      // migrate state jika nama berubah
      if (name !== originalName) {
        lastStatus[name] = lastStatus[originalName] || "UNKNOWN";
        delete lastStatus[originalName];
        if (downSince[originalName]) { downSince[name] = downSince[originalName]; delete downSince[originalName]; }
        if (latency[originalName] !== undefined) { latency[name] = latency[originalName]; delete latency[originalName]; }
        if (latencyHistory[originalName]) { latencyHistory[name] = latencyHistory[originalName]; delete latencyHistory[originalName]; }
        if (history[originalName]) { history[name] = history[originalName]; delete history[originalName]; saveHistory(history); }
        if (dailyStats.devices && dailyStats.devices[originalName]) {
          dailyStats.devices[name] = dailyStats.devices[originalName]; delete dailyStats.devices[originalName]; saveDailyStats(dailyStats);
        }
      }
      devices[idx].name = name;
      devices[idx].ip = ip;
      devices[idx].severity = sev;
      if (msg.owner !== undefined) devices[idx].owner = msg.owner;
      if (msg.location !== undefined) devices[idx].location = msg.location;
      if (msg.vendor !== undefined) devices[idx].vendor = msg.vendor;
      if (msg.notes !== undefined) devices[idx].notes = msg.notes;
      saveDevices();
      appendLogLine(`DEVICE EDITED: ${originalName} -> ${name} (${ip}) severity=${sev}`);
      reply(true, `Device berhasil diupdate.`);
      broadcastFullUpdate();
      break;
    }
    case "delete_device": {
      const { name } = msg;
      const idx = devices.findIndex(d => d.name === name);
      if (idx === -1) return reply(false, `Device '${name}' tidak ditemukan.`);
      devices.splice(idx, 1);
      delete lastStatus[name];
      delete downSince[name];
      delete latency[name];
      delete latencyHistory[name];
      saveDevices();
      appendLogLine(`DEVICE DELETED: ${name}`);
      reply(true, `Device '${name}' berhasil dihapus.`);
      broadcastFullUpdate();
      break;
    }
    case "update_notes": {
      const { name, owner, location: loc, vendor, notes } = msg;
      const idx = devices.findIndex(d => d.name === name);
      if (idx === -1) return reply(false, `Device '${name}' tidak ditemukan.`);
      if (owner !== undefined) devices[idx].owner = owner;
      if (loc !== undefined) devices[idx].location = loc;
      if (vendor !== undefined) devices[idx].vendor = vendor;
      if (notes !== undefined) devices[idx].notes = notes;
      saveDevices();
      appendLogLine(`DEVICE NOTES UPDATED: ${name}`);
      reply(true, `Notes untuk '${name}' berhasil diupdate.`);
      broadcastFullUpdate();
      break;
    }
    default:
      reply(false, `Action '${msg.action}' tidak dikenal.`);
  }
}

function broadcastFullUpdate() {
  broadcast({
    type: "update",
    timestamp: dateTimeLocal(),
    devices: devices.map(dev => buildDevicePayload(dev)),
  });
}

// ================= WEBSOCKET =================
console.log("WebSocket running on port", WS_PORT);

wss.on("connection", (ws) => {
  console.log("Client connected");

  // kirim snapshot awal saat connect (full structured payload)
  const snapshotPayload = {
    type: "snapshot",
    timestamp: dateTimeLocal(),
    devices: devices.map(dev => buildDevicePayload(dev)),
  };
  ws.send(JSON.stringify(snapshotPayload));

  // handle incoming commands dari client
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "command") {
        handleDeviceCommand(msg, ws);
      }
    } catch (e) {
      console.error("Invalid WS message:", e);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// fungsi broadcast
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// ================= RUN =================
const timer = setInterval(checkAll, INTERVAL_MS);
checkAll();

// ================= GRACEFUL SHUTDOWN =================
function gracefulExit() {
  console.log("\nExiting... saving all data.");
  saveSnapshot({ lastStatus, downSince });
  saveDailyStats(dailyStats);
  saveHistory(history);
  writeGlobalFlagsToDisk();
  process.exit(0);
}
process.on("SIGINT", gracefulExit);
process.on("SIGTERM", gracefulExit);
