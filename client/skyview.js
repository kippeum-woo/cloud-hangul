// Renders a city's sky. Messages live in a boundless world (see messages.js)
// seen through a camera (centerX, centerY, zoom). The backdrop is a 360°
// panorama that follows the camera with gentle zoom and vertical parallax.
//
// The atmosphere is shaded per pixel into two small buffers that are scaled
// up (which also keeps gradients smooth): a sky buffer with a vertical
// gradient, sun-centred forward scattering and horizon haze; and a cloud
// buffer that projects a tiling noise field onto a cloud deck in perspective,
// so clouds shrink and thin toward the horizon, and lights each texel by how
// much cloud lies between it and the sun. Stars, sun and moon are drawn
// between the two, so clouds really cover them. Messages are drawn last so
// they stay readable. Buffer resolution adapts to how long a frame takes.
import { skyState } from "../src/sky.js";
import { clampWorldY, dxWrap, extent, GLYPH, opacityAt, SKY_W, UNIT_PX, wrapX } from "../src/messages.js";
import { drawGlyph } from "./glyphs.js";

export const ZOOM_MIN = 0.08;
export const ZOOM_MAX = 8;
const BG_PX = 40; // backdrop pixels per world unit of vertical camera travel
const LOD_GLYPH_PX = 12; // below this glyph size, messages draw as dots

const RAD = Math.PI / 180;
const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")},${a})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export const bearingToX = (deg) => wrapX((deg / 360) * SKY_W);

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
}
const hashStr = (str) => [...str].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

// Tiling fractal value noise, N×N, values about 0..1.
const N = 256;
function buildNoise(seed) {
  const out = new Float32Array(N * N);
  const r = rng(seed);
  let amp = 0.5;
  let total = 0;
  for (let period = 64; period >= 4; period /= 2) {
    const g = period;
    const cells = N / g;
    const lattice = new Float32Array(cells * cells);
    for (let i = 0; i < lattice.length; i++) lattice[i] = r();
    for (let y = 0; y < N; y++) {
      const fy = y / g;
      const y0 = Math.floor(fy);
      let ty = fy - y0;
      ty = ty * ty * (3 - 2 * ty);
      const ya = (y0 % cells) * cells;
      const yb = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < N; x++) {
        const fx = x / g;
        const x0 = Math.floor(fx);
        let tx = fx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const xa = x0 % cells;
        const xb = (x0 + 1) % cells;
        const top = lattice[ya + xa] + (lattice[ya + xb] - lattice[ya + xa]) * tx;
        const bot = lattice[yb + xa] + (lattice[yb + xb] - lattice[yb + xa]) * tx;
        out[y * N + x] += (top + (bot - top) * ty) * amp;
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
let NOISE = null;
function noise(u, v) {
  // Bilinear lookup with wrap; u, v in noise texels.
  const x = u - Math.floor(u / N) * N;
  const y = v - Math.floor(v / N) * N;
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = (x0 + 1) & (N - 1);
  const y1 = (y0 + 1) & (N - 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = NOISE[y0 * N + x0];
  const b = NOISE[y0 * N + x1];
  const c = NOISE[y1 * N + x0];
  const d = NOISE[y1 * N + x1];
  const top = a + (b - a) * fx;
  return top + (c + (d - c) * fx - top) * fy;
}

export class SkyView {
  constructor(canvas, { reducedMotion, quality = "auto" }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reducedMotion = reducedMotion;
    this.centerX = SKY_W / 2;
    this.centerY = 0;
    this.zoom = 1;
    this.messages = new Map();
    this.highlight = null;
    this.weather = null;
    this.city = null;
    this.state = null;
    this.stateAt = 0;
    this.particles = [];
    this.flash = 0;
    this.nextFlash = 0;
    this.ageOffset = 0;
    this.w = 1;
    this.h = 1;
    this.skyH = 1;
    this.dpr = 1;
    // Weather the renderer shows, easing toward the reported condition.
    this.wx = { cloud: 0.2, rain: 0, snow: 0, fog: 0, wind: 8, storm: 0 };
    this.target = { ...this.wx };
    this.windDir = 270;
    this.drift = [0, 0];
    this.quality = quality;
    this.scale = quality === "low" ? 8 : 5; // screen px per buffer px
    this.lastBuild = -1e9;
    this.lastCenter = null;
    this.buildMs = 0;
    this.skyBuf = document.createElement("canvas");
    this.cloudBuf = document.createElement("canvas");
    if (!NOISE) NOISE = buildNoise(20261025);
  }

  // The tray now overlays the sky, so the sky always spans the screen.
  resize(w, h) {
    this.dpr = Math.min(this.lowPower ? 1 : 2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.skyH = Math.max(200, h);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.particles = [];
    this.allocBuffers();
  }

  allocBuffers() {
    const bw = Math.max(48, Math.ceil(this.w / this.scale));
    const bh = Math.max(48, Math.ceil(this.h / this.scale));
    for (const b of [this.skyBuf, this.cloudBuf]) {
      b.width = bw;
      b.height = bh;
    }
    this.skyImg = this.skyBuf.getContext("2d").createImageData(bw, bh);
    this.cloudImg = this.cloudBuf.getContext("2d").createImageData(bw, bh);
    this.lastBuild = -1e9;
  }

  // Screen pixels per world unit at the current zoom.
  get unit() {
    return UNIT_PX * this.zoom;
  }

  setCity(city, now) {
    this.city = city;
    this.messages.clear();
    this.highlight = null;
    const r = rng(hashStr(city.id));
    this.stars = Array.from({ length: 320 }, () => ({ x: r() * SKY_W, y: r() * 0.92, s: 0.4 + r() * r() * 1.6, p: r() * 6.28 }));
    this.drift = [r() * N, r() * N];
    this.state = skyState(city, now, this.weather);
    this.stateAt = now;
    this.centerX = this.defaultCenter();
    this.centerY = 0;
    this.zoom = 1;
    this.lastBuild = -1e9;
  }

  // Face the sun if it is up, else the moon, else the equator-ward horizon.
  defaultCenter() {
    const s = this.state;
    if (s.sun.altDeg > -6) return bearingToX(s.sun.bearingDeg);
    if (s.moon.altDeg > 0) return bearingToX(s.moon.bearingDeg);
    return bearingToX(this.city.lat >= 0 ? 180 : 0);
  }

  setWeather(weather, now) {
    this.weather = weather;
    if (this.city) this.state = skyState(this.city, now, weather);
    const w = weather || { cloud: 0.2, rain: 0, snow: 0, fog: 0, wind: 8, windDir: 270 };
    this.target = { cloud: w.cloud, rain: w.rain, snow: w.snow, fog: w.fog, wind: w.wind || 0, storm: w.kind === "storm" ? 1 : 0 };
    this.windDir = Number.isFinite(w.windDir) ? w.windDir : 270;
    if (this.reducedMotion || !this.city) this.wx = { ...this.target };
    this.lastBuild = -1e9;
  }

  // World coordinates <-> CSS pixels, through the camera.
  toScreen(x, y) {
    return { x: this.w / 2 + dxWrap(this.centerX, x) * this.unit, y: this.h / 2 + (y - this.centerY) * this.unit };
  }
  toSky(px, py) {
    return { x: wrapX(this.centerX + (px - this.w / 2) / this.unit), y: this.centerY + (py - this.h / 2) / this.unit };
  }
  visibleRange(margin = 0.5) {
    const hx = this.w / 2 / this.unit + margin;
    const hy = this.h / 2 / this.unit + margin;
    return { x0: this.centerX - hx, x1: this.centerX + hx, y0: this.centerY - hy, y1: this.centerY + hy };
  }
  setCamera(x, y, zoom) {
    this.zoom = clampTo(zoom, ZOOM_MIN, ZOOM_MAX);
    this.centerX = wrapX(x);
    this.centerY = clampWorldY(y);
  }
  panBy(dxPx, dyPx) {
    this.setCamera(this.centerX - dxPx / this.unit, this.centerY - dyPx / this.unit, this.zoom);
  }
  // Zooms by factor, keeping the world point under (px, py) still on screen.
  zoomAt(factor, px, py) {
    const anchor = this.toSky(px, py);
    const zoom = clampTo(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const u = UNIT_PX * zoom;
    this.setCamera(anchor.x - (px - this.w / 2) / u, anchor.y - (py - this.h / 2) / u, zoom);
  }

  // Backdrop follows zoom gently, with vertical parallax
  // clamped so the sky never runs out at extreme pans.
  bgShift() {
    return clampTo(-this.centerY * BG_PX, -0.3 * this.skyH, 0.3 * this.skyH);
  }
  bgX(bearingX) {
    return this.w / 2 + dxWrap(this.centerX, bearingX) * UNIT_PX * this.bgZoom;
  }

  get bgZoom() { return clampTo(Math.sqrt(this.zoom), 0.5, 4); }

  altToY(altDeg) {
    const base = this.skyH * (0.97 - (clampTo(altDeg, -10, 89) / 72) * 0.9);
    return this.skyH / 2 + (base - this.skyH / 2) * this.bgZoom + this.bgShift();
  }
  yToAlt(y) {
    const base = this.skyH / 2 + (y - this.bgShift() - this.skyH / 2) / this.bgZoom;
    return ((0.97 - base / this.skyH) / 0.9) * 72;
  }

  hitMessage(px, py, now) {
    let best = null;
    for (const m of this.messages.values()) {
      if (opacityAt(now + this.ageOffset - m.createdAt) <= 0) continue;
      const p = this.toScreen(m.x, m.y);
      const e = extent(m.blocks);
      const pad = 8;
      if (Math.abs(px - p.x) < e.hw * this.unit + pad && Math.abs(py - p.y) < e.hh * this.unit + pad) best = m;
    }
    return best;
  }

  frame(now, t) {
    if (!this.city) return;
    const f0 = performance.now();
    if (Math.abs(now - this.stateAt) > 1000) {
      this.state = skyState(this.city, now, this.weather);
      this.stateAt = now;
    }
    const dt = Math.min(0.1, Math.max(0, (t - (this.lastT ?? t)) / 1000));
    this.lastT = t;
    this.ease(dt);
    // Clouds drift downwind; the speed breathes a little, like real wind.
    const gust = 1 + 0.18 * Math.sin(t / 23000) + 0.08 * Math.sin(t / 7100);
    const speed = (0.35 + this.wx.wind * 0.06) * gust * (this.reducedMotion ? 0.25 : 1);
    const to = (this.windDir + 180) * RAD;
    this.drift[0] += Math.sin(to) * speed * dt;
    this.drift[1] += Math.cos(to) * speed * dt;

    // Rebuild the atmosphere at most ~30 times a second (2 with reduced
    // motion), and right away when the view pans.
    const key = `${this.centerX}|${this.bgShift()}`;
    const interval = this.reducedMotion ? 500 : 33;
    if (key !== this.lastKey || t - this.lastBuild > interval) {
      const t0 = performance.now();
      this.buildAtmosphere();
      this.adapt(performance.now() - t0);
      this.lastBuild = t;
      this.lastKey = key;
    }

    const s = this.state;
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(this.skyBuf, 0, 0, this.w, this.h);
    this.drawStars(g, s, t);
    this.drawMoon(g, s);
    this.drawSunDisc(g, s);
    g.drawImage(this.cloudBuf, 0, 0, this.w, this.h);
    this.drawPrecip(g, s, t, dt);
    this.drawCompass(g, s);
    this.drawMessages(g, s, now, t);
    this.drawFlash(g, t);
    this.watchFrame(performance.now() - f0);
  }

  // Whole-frame budget: if drawing keeps running long (slow phone, software
  // rendering), drop the canvas to 1× pixels and coarsen the shading once.
  watchFrame(ms) {
    this.frameMs = (this.frameMs ?? ms) * 0.9 + ms * 0.1;
    if (this.lowPower || this.quality === "low") return;
    if (this.frameMs < 22) {
      this.slowFrames = 0;
      return;
    }
    if ((this.slowFrames = (this.slowFrames || 0) + 1) < 60) return;
    this.lowPower = true;
    this.scale = Math.max(this.scale, 7);
    this.resize(this.w, this.h);
  }

  ease(dt) {
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt / 2.5);
    for (const key of Object.keys(this.target)) this.wx[key] += (this.target[key] - this.wx[key]) * k;
  }

  // Keeps the shading cost near 6 ms by changing buffer resolution.
  adapt(ms) {
    if (this.quality === "low") return;
    this.buildMs = this.buildMs * 0.8 + ms * 0.2;
    let next = this.scale;
    if (this.buildMs > 9 && this.scale < 9) next = this.scale + 1;
    else if (this.buildMs < 3 && this.scale > 3) next = this.scale - 1;
    if (next !== this.scale) {
      this.scale = next;
      this.buildMs = 6;
      this.allocBuffers();
    }
  }

  buildAtmosphere() {
    const s = this.state;
    const wx = this.wx;
    const { zenith, middle, horizon, light } = s.colors;
    const bw = this.skyBuf.width;
    const bh = this.skyBuf.height;
    const sky = this.skyImg.data;
    const cl = this.cloudImg.data;
    const sunAlt = s.sun.altDeg * RAD;
    const sunBear = s.sun.bearingDeg * RAD;
    const sx = Math.cos(sunAlt) * Math.sin(sunBear);
    const sy = Math.sin(sunAlt);
    const sz = Math.cos(sunAlt) * Math.cos(sunBear);
    // Sunlight colour: white high up, deep orange near the horizon.
    const low = 1 - smooth(-2, 18, s.sun.altDeg);
    const sunCol = mix([255, 248, 236], [255, 150, 80], low);
    const sunUp = smooth(-8, 2, s.sun.altDeg); // scattering fades out after dusk
    const veil = 1 - wx.cloud * 0.75 - wx.fog * 0.5;
    const glowK = sunUp * Math.max(0.1, veil);
    // Cloud colours: lit tops follow the sunlight, bases pick up the sky.
    const night = 1 - light;
    let lit = mix([78, 86, 112], [255, 255, 255], light);
    lit = mix(lit, sunCol, low * sunUp * 0.6);
    let base = mix(mix(lit, zenith, 0.35), [40, 44, 58], 0.25 + wx.rain * 0.35);
    base = base.map((v) => v * (0.92 - night * 0.2));
    const gray = (lit[0] + lit[1] + lit[2]) / 3;
    lit = mix(lit, [gray, gray, gray * 1.02], wx.cloud * 0.35 + wx.rain * 0.3);
    lit = lit.map((v) => v * (1 - wx.rain * 0.25 - wx.storm * 0.15));
    const haze = mix(horizon, [205, 210, 218].map((v) => v * (0.15 + 0.85 * light)), 0.3 + wx.fog * 0.5);
    // Coverage threshold: thin scattered clouds to a closed deck.
    const cover = clamp01(wx.cloud);
    const th = 0.66 - cover * 0.42;
    const soft = 0.1 + cover * 0.12;
    const deck = smooth(0.75, 1, cover) * 0.75 + wx.rain * 0.2;
    const sunPlane = [Math.sin(sunBear), Math.cos(sunBear)];
    const step = 3.5; // texels toward the sun for the self-shadow sample
    const [ox, oy] = this.drift;
    let i = 0;
    for (let y = 0; y < bh; y++) {
      const py = (y + 0.5) * this.scale;
      const altDeg = this.yToAlt(py);
      const alt = Math.max(-0.2, altDeg * RAD);
      const ca = Math.cos(alt);
      const sa = Math.sin(alt);
      const e = clamp01(altDeg / 90);
      const t1 = Math.pow(e, 0.5);
      const base0 = t1 < 0.5 ? mix(horizon, middle, t1 * 2) : mix(middle, zenith, (t1 - 0.5) * 2);
      const hz = Math.exp(-Math.max(0, altDeg) / 7);
      // Cloud deck distance (perspective): far near the horizon, capped.
      const dist = altDeg > 0.6 ? Math.min(16, 1 / Math.tan(Math.max(alt, 0.012))) : 16;
      const aerial = 1 - Math.exp(-dist * 0.12);
      const scaleUV = 46 * dist;
      for (let x = 0; x < bw; x++, i += 4) {
        const pxs = (x + 0.5) * this.scale;
        const bearing = ((this.centerX + (pxs - this.w / 2) / (UNIT_PX * this.bgZoom)) / SKY_W) * 2 * Math.PI;
        const sb = Math.sin(bearing);
        const cb = Math.cos(bearing);
        const dx = ca * sb;
        const dz = ca * cb;
        const cosG = dx * sx + sa * sy + dz * sz;
        const gam = Math.acos(cosG > 1 ? 1 : cosG < -1 ? -1 : cosG);
        // Forward scattering around the sun, broad and tight lobes, plus a
        // warm horizon band toward the sun at low sun.
        const mie = (Math.exp(-gam * 9) * 0.85 + Math.exp(-gam * 2.4) * 0.3) * glowK;
        const band = hz * low * sunUp * (0.35 + 0.65 * Math.max(0, cosG)) * 0.55 * Math.max(0.25, veil);
        let r = base0[0] + (sunCol[0] - base0[0]) * clamp01(mie + band);
        let gg = base0[1] + (sunCol[1] - base0[1]) * clamp01(mie + band);
        let b = base0[2] + (sunCol[2] - base0[2]) * clamp01(mie + band);
        const hzk = hz * 0.35;
        r += (haze[0] - r) * hzk;
        gg += (haze[1] - gg) * hzk;
        b += (haze[2] - b) * hzk;
        if (altDeg < 0) {
          // Below the horizon line (hidden under the tray mostly): dim haze.
          r *= 0.9;
          gg *= 0.9;
          b *= 0.92;
        }
        sky[i] = r;
        sky[i + 1] = gg;
        sky[i + 2] = b;
        sky[i + 3] = 255;

        // Clouds: noise sampled on the deck at (dist·sinθ, dist·cosθ).
        const u = sb * scaleUV + ox;
        const v = cb * scaleUV + oy;
        let d = noise(u, v) * 0.72 + noise(u * 2.7 + 31, v * 2.7 + 17) * 0.28;
        let a = smooth(th, th + soft, d);
        a = a + (1 - a) * deck * (0.75 + 0.25 * d);
        a *= 1 - aerial * 0.55;
        a *= smooth(0.3, 4.5, altDeg); // distant deck dissolves into the haze
        if (a < 0.01) {
          cl[i + 3] = 0;
          continue;
        }
        // Self-shadow: denser cloud toward the sun means less light here.
        const d2 = noise(u + sunPlane[0] * step, v + sunPlane[1] * step) * 0.72 + d * 0.28;
        const shade = clamp01(0.62 + (d - d2) * 3.2 + (sunAlt > 0 ? 0.12 : 0));
        let cr = base[0] + (lit[0] - base[0]) * shade;
        let cg = base[1] + (lit[1] - base[1]) * shade;
        let cbb = base[2] + (lit[2] - base[2]) * shade;
        // Silver lining: thin edges near the sun glow.
        const rim = (1 - a) * Math.exp(-gam * 5) * glowK * 1.4;
        cr += (sunCol[0] - cr) * clamp01(rim);
        cg += (sunCol[1] - cg) * clamp01(rim);
        cbb += (sunCol[2] - cbb) * clamp01(rim);
        // Distance blends clouds into the horizon haze.
        cr += (haze[0] - cr) * aerial * 0.6;
        cg += (haze[1] - cg) * aerial * 0.6;
        cbb += (haze[2] - cbb) * aerial * 0.6;
        cl[i] = cr;
        cl[i + 1] = cg;
        cl[i + 2] = cbb;
        cl[i + 3] = a * 255;
      }
    }
    // Fog: an even, horizon-heavy veil over sky and clouds alike.
    if (wx.fog > 0.02) {
      const fogCol = mix([70, 74, 86], [214, 218, 224], light);
      let j = 0;
      for (let y = 0; y < bh; y++) {
        const altDeg = this.yToAlt((y + 0.5) * this.scale);
        const f = wx.fog * (0.45 + 0.55 * Math.exp(-Math.max(0, altDeg) / 18));
        for (let x = 0; x < bw; x++, j += 4) {
          sky[j] += (fogCol[0] - sky[j]) * f;
          sky[j + 1] += (fogCol[1] - sky[j + 1]) * f;
          sky[j + 2] += (fogCol[2] - sky[j + 2]) * f;
          if (cl[j + 3]) {
            cl[j] += (fogCol[0] - cl[j]) * f;
            cl[j + 1] += (fogCol[1] - cl[j + 1]) * f;
            cl[j + 2] += (fogCol[2] - cl[j + 2]) * f;
          }
        }
      }
    }
    this.skyBuf.getContext("2d").putImageData(this.skyImg, 0, 0);
    this.cloudBuf.getContext("2d").putImageData(this.cloudImg, 0, 0);
  }

  drawStars(g, s, t) {
    const night = 1 - smooth(-15, -5, s.sun.altDeg);
    const clear = clamp01(1 - this.wx.fog * 1.2) * (1 - this.wx.cloud * 0.5);
    if (night < 0.02 || clear < 0.05) return;
    for (const st of this.stars) {
      const p = { x: this.bgX(st.x), y: this.skyH / 2 + (st.y - 0.5) * this.skyH * this.bgZoom + this.bgShift() };
      if (p.x < -4 || p.x > this.w + 4) continue;
      // Fainter near the horizon, where the air is thicker.
      const ext = smooth(0.95, 0.55, st.y);
      const tw = this.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 0.0013 + st.p);
      g.fillStyle = `rgba(250,250,240,${night * clear * ext * tw * (0.25 + st.s * 0.45)})`;
      g.fillRect(p.x, p.y, st.s, st.s);
    }
  }

  drawSunDisc(g, s) {
    if (s.sun.altDeg < -1) return;
    const p = { x: this.bgX(bearingToX(s.sun.bearingDeg)) };
    const y = this.altToY(s.sun.altDeg);
    if (p.x < -60 || p.x > this.w + 60) return;
    const low = 1 - smooth(0, 14, s.sun.altDeg);
    const veil = Math.max(0.05, 1 - this.wx.cloud * 0.8 - this.wx.fog * 0.7);
    const core = mix([255, 253, 244], [255, 196, 130], low);
    const r = UNIT_PX * 0.022;
    const glow = g.createRadialGradient(p.x, y, r * 0.6, p.x, y, r * 4);
    glow.addColorStop(0, rgb(core, 0.9 * veil));
    glow.addColorStop(1, rgb(core, 0));
    g.fillStyle = glow;
    g.fillRect(p.x - r * 4, y - r * 4, r * 8, r * 8);
    g.fillStyle = rgb(core, Math.min(1, veil * 1.3));
    g.beginPath();
    g.arc(p.x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  drawMoon(g, s) {
    if (s.moon.altDeg < -2) return;
    const p = { x: this.bgX(bearingToX(s.moon.bearingDeg)) };
    const y = this.altToY(s.moon.altDeg);
    if (p.x < -60 || p.x > this.w + 60) return;
    const r = UNIT_PX * 0.02;
    const dayFade = 1 - smooth(-2, 12, s.sun.altDeg) * 0.7;
    const veil = Math.max(0.08, 1 - this.wx.fog * 0.8) * dayFade;
    const halo = g.createRadialGradient(p.x, y, r, p.x, y, r * 6);
    halo.addColorStop(0, `rgba(220,228,250,${0.22 * veil * s.moon.fraction})`);
    halo.addColorStop(1, "rgba(220,228,250,0)");
    g.fillStyle = halo;
    g.fillRect(p.x - r * 6, y - r * 6, r * 12, r * 12);
    // Earthshine on the dark part, then the lit part with its terminator.
    g.fillStyle = `rgba(120,128,150,${0.18 * veil})`;
    g.beginPath();
    g.arc(p.x, y, r, 0, Math.PI * 2);
    g.fill();
    const phase = s.moon.phase;
    const waxing = phase < 0.5;
    const flip = (this.city.lat < 0) !== waxing ? 1 : -1; // +1: lit on the right
    const k = Math.cos(phase * 2 * Math.PI);
    const lit = g.createRadialGradient(p.x - r * 0.3, y - r * 0.3, 0, p.x, y, r);
    lit.addColorStop(0, `rgba(250,248,238,${veil})`);
    lit.addColorStop(1, `rgba(222,220,210,${veil})`);
    g.fillStyle = lit;
    g.beginPath();
    g.arc(p.x, y, r, -Math.PI / 2, Math.PI / 2, flip < 0);
    g.ellipse(p.x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === (flip > 0));
    g.fill();
  }

  drawPrecip(g, s, t, dt) {
    const wx = this.wx;
    const snow = wx.snow > wx.rain;
    const amount = snow ? wx.snow : wx.rain;
    if (amount < 0.03) {
      this.particles.length = 0;
      return;
    }
    const target = Math.round((snow ? 120 : 160) * amount * (this.reducedMotion ? 0.3 : 1) * Math.min(1.3, this.w / 900 + 0.4));
    while (this.particles.length < target) {
      this.particles.push({ x: Math.random() * this.w, y: Math.random() * this.h, z: 0.25 + Math.random() * 0.75, p: Math.random() * 6.28 });
    }
    this.particles.length = target;
    const to = (this.windDir + 180) * RAD;
    const across = Math.sin(to - (this.centerX / SKY_W) * 2 * Math.PI); // crosswind relative to the view
    const windPx = across * Math.min(1, wx.wind / 45);
    const tone = mix([120, 128, 150], [215, 222, 235], s.colors.light);
    const slow = this.reducedMotion ? 0.2 : 1;
    g.lineCap = "round";
    for (const q of this.particles) {
      if (snow) {
        q.y += (22 + 36 * q.z) * dt * slow;
        q.x += (windPx * 36 + Math.sin(t / 1100 + q.p) * 10 * q.z) * dt * slow;
        g.fillStyle = `rgba(250,252,255,${0.35 + q.z * 0.5})`;
        g.beginPath();
        g.arc(q.x, q.y, 0.8 + q.z * 2, 0, Math.PI * 2);
        g.fill();
      } else {
        const vy = (700 + 500 * q.z) * slow;
        const vx = windPx * 220 * slow;
        q.y += vy * dt;
        q.x += vx * dt;
        const len = 8 + 16 * q.z;
        g.strokeStyle = rgb(tone, 0.08 + q.z * 0.2);
        g.lineWidth = 0.6 + q.z * 0.8;
        g.beginPath();
        g.moveTo(q.x, q.y);
        g.lineTo(q.x - (vx / vy) * len, q.y - len);
        g.stroke();
      }
      if (q.y > this.h + 10) {
        q.y = -10;
        q.x = Math.random() * this.w;
      }
      if (q.x < -20) q.x += this.w + 40;
      if (q.x > this.w + 20) q.x -= this.w + 40;
    }
  }

  drawFlash(g, t) {
    if (this.wx.storm < 0.5 || this.reducedMotion) return;
    if (t > this.nextFlash) {
      this.flash = 0.6 + Math.random() * 0.4;
      this.nextFlash = t + 7000 + Math.random() * 14000;
    }
    if (this.flash > 0.01) {
      // Diffuse sheet lightning behind the clouds, not a cartoon strobe.
      g.fillStyle = `rgba(220,226,245,${this.flash * 0.16})`;
      g.fillRect(0, 0, this.w, this.h);
      this.flash *= 0.82;
    }
  }

  drawCompass(g, s) {
    g.font = "600 11px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillStyle = s.colors.luminance > 0.55 ? "rgba(40,55,95,0.35)" : "rgba(255,255,255,0.4)";
    for (let i = 0; i < 8; i++) {
      const p = { x: this.bgX(bearingToX(i * 45)) };
      if (p.x < -20 || p.x > this.w + 20) continue;
      g.fillText(COMPASS[i], p.x, this.altToY(1.2));
    }
  }

  drawMessages(g, s, now, t) {
    const size = GLYPH * this.unit;
    const dots = size < LOD_GLYPH_PX;
    g.fillStyle = s.colors.luminance > 0.55 ? "rgba(40,55,95,0.6)" : "rgba(255,255,255,0.7)";
    for (const m of this.messages.values()) {
      const alpha = opacityAt(now + this.ageOffset - m.createdAt);
      if (alpha <= 0) continue;
      const p = this.toScreen(m.x, m.y);
      const e = extent(m.blocks);
      if (p.x + e.hw * this.unit < -20 || p.x - e.hw * this.unit > this.w + 20) continue;
      if (dots) {
        g.globalAlpha = alpha;
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        g.globalAlpha = 1;
        continue;
      }
      const bob = this.reducedMotion ? 0 : Math.sin(t / 2200 + (hashStr(m.id) % 628) / 100) * this.unit * 0.004;
      const sway = this.reducedMotion ? 0 : Math.sin(t / 3100 + (hashStr(m.id) % 314) / 100) * this.unit * 0.002;
      if (m.id === this.highlight) {
        const r = Math.max(e.hw, e.hh) * this.unit * 1.5;
        const halo = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        halo.addColorStop(0, "rgba(255,246,200,0.45)");
        halo.addColorStop(1, "rgba(255,246,200,0)");
        g.fillStyle = halo;
        g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
      for (const b of m.blocks) {
        drawGlyph(g, b.t, p.x + b.dx * size + sway, p.y + b.dy * size + bob, size, s.ink, alpha, this.dpr);
      }
    }
  }
}
