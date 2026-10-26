// Message geometry and lifecycle, shared by the client and the server.
//
// Sky world coordinates. x wraps every SKY_W units (the 360° bearing ring,
// so the sun and moon keep their compass positions). y is unbounded in
// practice: messages may sit anywhere within ±WORLD_Y. One unit is UNIT_PX
// CSS pixels at zoom 1, a fixed size that does not depend on the screen, so
// resizing or rotating changes only what is visible. A message is anchored at
// (x, y) and each block sits at (dx, dy) in glyph cells from that anchor.
//
// LAYOUT 1 (before the camera) measured y from the top of a screen whose height
// was one unit, and x in the same units. Migrating to LAYOUT 2 keeps the layout
// exact on a 900 px tall screen: y becomes y - 0.5 (origin at the centre) and x
// is unchanged.
import { isBlockGlyph } from "./hangul.js";

export const LIFETIME_MS = 24 * 60 * 60 * 1000;
// Large safety bounds protect floating point math; the atmosphere has its
// own 12-unit bearing cycle, independent of this writing canvas.
export const SKY_W = 1_000_008;
export const UNIT_PX = 900;
export const WORLD_Y = 1_000_000;
export const LAYOUT = 2;
export const GLYPH = 0.1; // syllable size in world units
export const MAX_BLOCKS = 40;
const GAP = 0.03; // clearance between messages, in sky units

export const ageOf = (msg, now) => now - msg.createdAt;
export const isLive = (msg, now) => ageOf(msg, now) >= 0 && ageOf(msg, now) < LIFETIME_MS;

// Opacity fades from 1 to 0.3 over the lifetime, faster near the end, and the
// message is gone at exactly 24 hours.
export function opacityAt(age) {
  if (age >= LIFETIME_MS) return 0;
  const t = Math.max(0, age) / LIFETIME_MS;
  return 1 - 0.7 * t ** 1.6;
}

export const wrapX = (x) => { const r = x % SKY_W; return r < 0 ? r + SKY_W : r; };
// Signed horizontal distance from a to b the short way round the panorama.
export function dxWrap(a, b) {
  let d = wrapX(b) - wrapX(a);
  if (d > SKY_W / 2) d -= SKY_W;
  if (d < -SKY_W / 2) d += SKY_W;
  return d;
}

// Half extents of a message, in sky units, from its block offsets.
export function extent(blocks) {
  let w = 0;
  let h = 0;
  for (const b of blocks) {
    w = Math.max(w, Math.abs(b.dx) + 0.5);
    h = Math.max(h, Math.abs(b.dy) + 0.5);
  }
  return { hw: w * GLYPH, hh: h * GLYPH };
}

export const clampWorldY = (y) => Math.max(-WORLD_Y, Math.min(WORLD_Y, y));

// Whether a message's box touches the rectangle { x0, x1, y0, y1 }, with x
// wrapping around the bearing ring.
export function inRect(m, r) {
  const e = extent(m.blocks);
  const mid = (r.x0 + r.x1) / 2;
  if (Math.abs(dxWrap(mid, m.x)) > (r.x1 - r.x0) / 2 + e.hw) return false;
  return m.y + e.hh >= r.y0 && m.y - e.hh <= r.y1;
}

export function overlaps(a, b) {
  const ea = extent(a.blocks);
  const eb = extent(b.blocks);
  return Math.abs(dxWrap(a.x, b.x)) < ea.hw + eb.hw + GAP && Math.abs(a.y - b.y) < ea.hh + eb.hh + GAP;
}

// Moves a new message to the nearest spot that keeps readable spacing from
// live messages: rings of candidates around the requested point.
export function place(msg, others) {
  const { hh } = extent(msg.blocks);
  const clampY = (y) => Math.max(-WORLD_Y + hh, Math.min(WORLD_Y - hh, y));
  const start = { ...msg, x: wrapX(msg.x), y: clampY(msg.y) };
  const free = (c) => others.every((o) => !overlaps(c, o));
  if (free(start)) return start;
  for (let r = 1; r <= 60; r++) {
    const step = 0.04 * r;
    const n = 8 + r * 2;
    let best = null;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = { ...start, x: wrapX(start.x + Math.cos(a) * step * 1.6), y: clampY(start.y + Math.sin(a) * step) };
      if (!free(c)) continue;
      const d = Math.hypot(dxWrap(start.x, c.x), c.y - start.y);
      if (!best || d < best.d) best = { c, d };
    }
    if (best) return best.c;
  }
  return start;
}

// Validates and normalizes a publish request. Returns { error } or { value }.
export function normalizeDraft(input) {
  if (!input || typeof input !== "object") return { error: "invalid_body" };
  const { x, y, blocks } = input;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "invalid_position" };
  if (!Array.isArray(blocks) || blocks.length === 0) return { error: "empty_message" };
  if (blocks.length > MAX_BLOCKS) return { error: "too_long" };
  const out = [];
  for (const b of blocks) {
    if (!b || !isBlockGlyph(b.t)) return { error: "invalid_block" };
    if (!Number.isFinite(b.dx) || !Number.isFinite(b.dy) || Math.abs(b.dx) > 12 || Math.abs(b.dy) > 4) return { error: "invalid_block" };
    out.push({ t: b.t, dx: round(b.dx), dy: round(b.dy) });
  }
  return { value: { x: wrapX(x), y: clampWorldY(y), blocks: out } };
}

// Recenters block offsets on their bounding box, so (x, y) is the middle.
export function recenter(blocks) {
  const xs = blocks.map((b) => b.dx);
  const ys = blocks.map((b) => b.dy);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { cx, cy, blocks: blocks.map((b) => ({ ...b, dx: round(b.dx - cx), dy: round(b.dy - cy) })) };
}

export const textOf = (msg) => {
  // Reading order: rows top to bottom, then left to right.
  const rows = [...msg.blocks].sort((a, b) => (Math.abs(a.dy - b.dy) < 0.5 ? a.dx - b.dx : a.dy - b.dy));
  let out = "";
  let prev = null;
  for (const b of rows) {
    if (prev && (Math.abs(b.dy - prev.dy) >= 0.5 || b.dx - prev.dx > 1.6)) out += " ";
    out += b.t;
    prev = b;
  }
  return out;
};

const round = (v) => Math.round(v * 100) / 100;

// Words on the globe: a simple count of whitespace-separated, nonempty tokens
// in the message text ("보고 싶어" → 2). It is not linguistic Korean word
// segmentation. A message's text puts a space between rows and between
// syllables placed more than a gap apart (see textOf).
export const wordCount = (text) => String(text || "").split(/\s+/).filter(Boolean).length;
