/* =====================================================================
   Floor-plan data (v2 / Fase 3) — the "digital twin" definition.
   Geometry is DATA, not a hand-modeled mesh: Three.js extrudes it.
   Coordinates use the same top-down space as the Fase-1 SVG blueprint
   (x: 0..1120 →right, y: 0..780 →down/"depth"), so both views agree.
   Edit this file to reshape the building or move devices.
   ===================================================================== */

// viewBox + center (used to recenter the model around world origin)
export const VIEW = { w: 1120, h: 780, cx: 560, cy: 390 };

// wall dimensions (in the same units as the plan)
export const WALL = { height: 70, thickness: 7 };

// Rooms as rectangles {x,y,w,h} (top-left origin) + type (drives color).
export const ROOMS = [
  { id: "carport",    label: "CARPORT",     level: "-0.35", x: 140, y: 90,  w: 220, h: 210, type: "util" },
  { id: "kamar1",     label: "KAMAR",       level: "±0.00", x: 360, y: 90,  w: 200, h: 210, type: "room" },
  { id: "kamar2",     label: "KAMAR",       level: "±0.00", x: 560, y: 90,  w: 200, h: 210, type: "room" },
  { id: "dapur",      label: "DAPUR",       level: "±0.00", x: 760, y: 90,  w: 200, h: 210, type: "wet" },
  { id: "rtamu",      label: "R. TAMU",     level: "±0.00", x: 140, y: 300, w: 220, h: 170, type: "room" },
  { id: "naik",       label: "NAIK",        level: "",      x: 360, y: 300, w: 110, h: 170, type: "core" },
  { id: "rkeluarga",  label: "R. KELUARGA", level: "±0.00", x: 470, y: 300, w: 290, h: 170, type: "room" },
  { id: "terasside",  label: "TERAS",       level: "-0.10", x: 760, y: 300, w: 200, h: 170, type: "outdoor" },
  { id: "kamar3",     label: "KAMAR",       level: "±0.00", x: 140, y: 470, w: 220, h: 180, type: "room" },
  { id: "wc1",        label: "WC",          level: "-0.10", x: 360, y: 470, w: 110, h: 90,  type: "wet" },
  { id: "wc2",        label: "WC",          level: "-0.10", x: 360, y: 560, w: 110, h: 90,  type: "wet" },
  { id: "terasfront", label: "TERAS",       level: "-0.10", x: 470, y: 470, w: 290, h: 180, type: "outdoor" },
  { id: "taman",      label: "TAMAN",       level: "-0.50", x: 760, y: 470, w: 200, h: 180, type: "garden" },
];

// Walls as line segments [x1,y1,x2,y2]; extruded to WALL.height.
// Each interior partition is listed ONCE (no per-room duplication → no z-fighting).
export const WALLS = [
  // outer ring
  [140, 90, 960, 90], [140, 650, 960, 650], [140, 90, 140, 650], [960, 90, 960, 650],
  // interior verticals
  [360, 90, 360, 650], [560, 90, 560, 300], [760, 90, 760, 650], [470, 300, 470, 650],
  // interior horizontals
  [140, 300, 960, 300], [140, 470, 960, 470], [360, 560, 470, 560],
];

// Floor slab tint per room type (dark-theme friendly).
export const ROOM_COLORS = {
  room: 0x27324e, wet: 0x1f3d47, outdoor: 0x1f3b2c,
  garden: 0x1a3626, util: 0x30313d, core: 0x352f4e,
};

// Device positions (DUMMY, same as Fase 1). Keyed by IP. y = plan-depth.
export const LAYOUT = {
  "172.19.88.30": { x: 250, y: 200 }, // DCS MIXING MATERIAL -> CARPORT
  "172.19.88.16": { x: 455, y: 175 }, // DCS PLAYMAKER       -> KAMAR 1
  "172.19.88.29": { x: 655, y: 175 }, // DCS POLES           -> KAMAR 2
  "172.19.88.19": { x: 858, y: 175 }, // DCS QI              -> DAPUR
  "172.19.88.20": { x: 250, y: 395 }, // DCS REPAIR IN LINE  -> R.TAMU
  "172.19.88.24": { x: 620, y: 390 }, // DCS TASK FORCE      -> R.KELUARGA
  "172.19.88.17": { x: 858, y: 390 }, // IOT NODE 001        -> TERAS
  "172.19.88.21": { x: 250, y: 560 }, // Printer M#5         -> KAMAR 3
};

// Deterministic fallback for devices not in LAYOUT.
export function autoPos(ip) {
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) >>> 0;
  return { x: 190 + (h % 720), y: 120 + ((h >> 8) % 500) };
}

export const SEV_COLORS = { CRITICAL: 0xef4444, HIGH: 0xf59e0b, MEDIUM: 0x3b82f6, LOW: 0x6b7280 };
export const STATUS_COLORS = { UP: 0x10b981, DOWN: 0xef4444 };
