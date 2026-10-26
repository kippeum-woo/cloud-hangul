// Fluffy cloud letters. Each character is drawn once per size and lighting
// into an offscreen canvas: a fat rounded glyph with puffs stamped along its
// edge, soft underside shading, and the real letter strokes embossed on top so
// the Hangul stays recognizable. The sky, drafts and tray all reuse the cache.

export const FONT = '"Jua", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
const DAY_INK = { fill: [255, 255, 255], shade: [124, 148, 196], edge: 0.35, glow: 0 };

const shapes = new Map(); // `${ch}|${size}` -> canvas (white cloud silhouette)
const sprites = new Map(); // `${ch}|${size}|${inkKey}` -> canvas
const PAD = 0.28; // margin around the glyph cell, as a share of size

const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(",")},${a})`;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Seeded random so the same letter always has the same puffs.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)), (s >>> 0) / 4294967296);
}

function silhouette(ch, size) {
  const key = `${ch}|${size}`;
  if (shapes.has(key)) return shapes.get(key);
  const full = Math.ceil(size * (1 + PAD * 2));
  const c = makeCanvas(full, full);
  // Read back once below; keep this canvas on the CPU so that is cheap.
  const g = c.getContext("2d", { willReadFrequently: true });
  const cx = full / 2;
  const cy = full / 2;
  g.font = `${Math.round(size * 0.86)}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineCap = "round";
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  g.lineWidth = size * 0.1;
  g.strokeText(ch, cx, cy + size * 0.04);
  g.fillText(ch, cx, cy + size * 0.04);

  // Stamp puffs on the silhouette's edge.
  const img = g.getImageData(0, 0, full, full).data;
  const step = Math.max(2, Math.round(size / 26));
  const edge = [];
  const at = (x, y) => (x < 0 || y < 0 || x >= full || y >= full ? 0 : img[(y * full + x) * 4 + 3]);
  for (let y = step; y < full - step; y += step) {
    for (let x = step; x < full - step; x += step) {
      if (at(x, y) > 128 && (at(x - step, y) < 128 || at(x + step, y) < 128 || at(x, y - step) < 128 || at(x, y + step) < 128)) edge.push([x, y]);
    }
  }
  let seed = 0;
  for (const chr of ch) seed = seed * 31 + chr.codePointAt(0);
  const rand = rng(seed + size);
  g.beginPath();
  const stride = Math.max(1, Math.floor(edge.length / 90));
  for (let i = 0; i < edge.length; i += stride) {
    const [x, y] = edge[i];
    const r = size * (0.028 + rand() * 0.03);
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, Math.PI * 2);
  }
  g.fill();
  shapes.set(key, c);
  return c;
}

const inkKey = (ink) => [...ink.fill.map((v) => Math.round(v / 12)), ...ink.shade.map((v) => Math.round(v / 12)), Math.round(ink.edge * 8), Math.round(ink.glow * 8)].join(".");

// Returns { canvas, pad } where pad is the margin (in px) around the cell.
export function cloudGlyph(ch, sizePx, ink = DAY_INK) {
  const size = Math.max(16, Math.min(200, Math.round(sizePx / 4) * 4));
  const key = `${ch}|${size}|${inkKey(ink)}`;
  let canvas = sprites.get(key);
  if (!canvas) {
    if (sprites.size > 600) sprites.clear();
    canvas = paint(ch, size, ink);
    sprites.set(key, canvas);
  }
  return { canvas, size, pad: size * PAD };
}

// The silhouette tinted with one colour, drawn at 1/k size: scaling it back
// up with smoothing spreads the edge by about k pixels.
function soft(shape, color, alpha, k) {
  const w = Math.max(2, Math.round(shape.width / k));
  const c = makeCanvas(w, w);
  const x = c.getContext("2d");
  x.drawImage(shape, 0, 0, w, w);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = rgb(color, Math.min(1, alpha));
  x.fillRect(0, 0, w, w);
  return c;
}

function paint(ch, size, ink) {
  const shape = silhouette(ch, size);
  const full = shape.width;
  const c = makeCanvas(full, full);
  const g = c.getContext("2d");

  // Night glow and the soft drop shadow that lift the letter off the sky.
  // Canvas shadowBlur is avoided: it can stall badly on weak or
  // software-rendered devices. A tinted silhouette drawn small and scaled
  // back up gives the same soft edge for almost nothing.
  if (ink.glow > 0.02) g.drawImage(soft(shape, [255, 255, 255], ink.glow * 0.8, 7), -size * 0.06, -size * 0.06, full + size * 0.12, full + size * 0.12);
  g.drawImage(soft(shape, ink.shade.map((v) => v * 0.7), 0.35 + ink.edge * 0.6, 4), 0, size * 0.035, full, full);

  // Body: tint the silhouette, top light to shaded underside.
  const body = makeCanvas(full, full);
  const b = body.getContext("2d");
  b.drawImage(shape, 0, 0);
  b.globalCompositeOperation = "source-in";
  const grad = b.createLinearGradient(0, full * 0.2, 0, full * 0.85);
  grad.addColorStop(0, rgb(ink.fill));
  grad.addColorStop(0.55, rgb(ink.fill.map((v, i) => v + (ink.shade[i] - v) * 0.18)));
  grad.addColorStop(1, rgb(ink.fill.map((v, i) => v + (ink.shade[i] - v) * 0.55)));
  b.fillStyle = grad;
  b.fillRect(0, 0, full, full);

  // Embossed strokes: a shaded line under a bright one, clipped to the body.
  b.globalCompositeOperation = "source-atop";
  b.font = `${Math.round(size * 0.86)}px ${FONT}`;
  b.textAlign = "center";
  b.textBaseline = "middle";
  b.fillStyle = rgb(ink.shade, 0.55);
  b.fillText(ch, full / 2, full / 2 + size * 0.04 + size * 0.022);
  b.fillStyle = rgb(ink.fill.map((v) => Math.min(255, v + 12)), 1);
  b.fillText(ch, full / 2, full / 2 + size * 0.04);
  // A soft highlight across the top.
  const hi = b.createRadialGradient(full * 0.45, full * 0.3, 0, full * 0.45, full * 0.3, full * 0.55);
  hi.addColorStop(0, "rgba(255,255,255,0.45)");
  hi.addColorStop(1, "rgba(255,255,255,0)");
  b.fillStyle = hi;
  b.fillRect(0, 0, full, full);

  g.drawImage(body, 0, 0);
  return c;
}

// Draws a glyph centered at (x, y) with the given cell size.
// dpr is the backing-store scale of ctx, so the sprite stays sharp.
export function drawGlyph(ctx, ch, x, y, sizePx, ink, alpha = 1, dpr = 1) {
  const { canvas, size } = cloudGlyph(ch, sizePx * dpr, ink);
  const scale = sizePx / size;
  const w = canvas.width * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(canvas, x - w / 2, y - w / 2, w, w);
  ctx.globalAlpha = 1;
}

// A standalone canvas element for DOM use (tray, drafts, drag ghost).
export function glyphElement(ch, sizePx, ink = DAY_INK) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { canvas, size } = cloudGlyph(ch, sizePx * dpr, ink);
  const el = document.createElement("canvas");
  el.width = canvas.width;
  el.height = canvas.height;
  el.getContext("2d").drawImage(canvas, 0, 0);
  const css = (canvas.width / size) * sizePx;
  el.style.width = `${css}px`;
  el.style.height = `${css}px`;
  return el;
}

export function clearGlyphCache() {
  shapes.clear();
  sprites.clear();
}
