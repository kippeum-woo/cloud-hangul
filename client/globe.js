// The interactive globe. three.js draws a pastel Earth (land painted from
// Natural Earth polygons onto a canvas texture), a drifting cloud shell and a
// soft atmosphere. City markers are DOM buttons laid over it so they get
// real focus, labels and large touch targets; nearby markers merge into
// clusters at low zoom. Only catalog cities are selectable.
import * as THREE from "three";
import { bindZoomInput } from "./zoom-input.js";

const MIN_DIST = 1.45;
const MAX_DIST = 4.4;
const CELL = 46; // px: markers closer than this merge into a cluster

// Matches three's SphereGeometry UV layout, so texture and markers agree.
export function latLonToVec(lat, lon, r = 1) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const th = (lat * Math.PI) / 180;
  return new THREE.Vector3(-Math.cos(phi) * Math.cos(th) * r, Math.sin(th) * r, Math.sin(phi) * Math.cos(th) * r);
}

function landTexture(rings) {
  const W = 2048;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const sea = g.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, "#b9d4f4");
  sea.addColorStop(0.5, "#8fb8ea");
  sea.addColorStop(1, "#b9d4f4");
  g.fillStyle = sea;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.lineWidth = 1.5;
  for (let lon = -180; lon <= 180; lon += 30) {
    g.beginPath();
    g.moveTo(((lon + 180) / 360) * W, 0);
    g.lineTo(((lon + 180) / 360) * W, H);
    g.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    g.beginPath();
    g.moveTo(0, ((90 - lat) / 180) * H);
    g.lineTo(W, ((90 - lat) / 180) * H);
    g.stroke();
  }
  const path = new Path2D();
  for (const ring of rings) {
    let prev = null;
    for (let i = 0; i < ring.length; i += 2) {
      let x = ((ring[i] + 180) / 360) * W;
      const y = ((90 - ring[i + 1]) / 180) * H;
      if (prev !== null && Math.abs(x - prev) > W / 2) x += x < prev ? W : -W; // stay continuous across the seam
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
      prev = x;
    }
    path.closePath();
  }
  g.save();
  g.shadowColor = "rgba(255,255,255,0.9)";
  g.shadowBlur = 14;
  g.fillStyle = "#f3efe2";
  for (const dx of [-W, 0, W]) {
    g.setTransform(1, 0, 0, 1, dx, 0);
    g.fill(path);
  }
  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);
  // Gentle green-to-sand tint by latitude, kept inside the land.
  g.globalCompositeOperation = "source-atop";
  const tint = g.createLinearGradient(0, 0, 0, H);
  tint.addColorStop(0, "rgba(255,255,255,0.6)");
  tint.addColorStop(0.18, "rgba(196,222,190,0.55)");
  tint.addColorStop(0.42, "rgba(214,226,180,0.35)");
  tint.addColorStop(0.5, "rgba(236,214,170,0.3)");
  tint.addColorStop(0.62, "rgba(198,222,186,0.45)");
  tint.addColorStop(0.86, "rgba(255,255,255,0.6)");
  g.fillStyle = tint;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = "rgba(120,150,190,0.35)";
  g.lineWidth = 1.2;
  for (const dx of [-W, 0, W]) {
    g.setTransform(1, 0, 0, 1, dx, 0);
    g.stroke(path);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

function cloudShellTexture() {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  let s = 12345;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    const y = H * (0.12 + r() * 0.76);
    const rad = 8 + r() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    for (const dx of [-W, 0, W]) g.fillRect(x - rad + dx, y - rad, rad * 2, rad * 2);
  }
  return c;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grd.addColorStop(0, "rgba(170,200,255,0.55)");
  grd.addColorStop(0.5, "rgba(150,180,255,0.18)");
  grd.addColorStop(1, "rgba(150,180,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return c;
}

// Marker emphasis from live word counts: bounded steps, not raw scale.
export const heatOf = (words) => (words >= 20 ? 3 : words >= 5 ? 2 : words >= 1 ? 1 : 0);

export class Globe {
  constructor({ canvas, markerLayer, pickLayer, cities, reducedMotion, onSelect, onReady }) {
    this.canvas = canvas;
    this.layer = markerLayer;
    this.pick = pickLayer;
    this.words = {}; // cityId -> live word count
    this.cities = cities.map((c) => ({ ...c, vec: latLonToVec(c.lat, c.lon) }));
    this.reducedMotion = reducedMotion;
    this.onSelect = onSelect;
    this.view = { lat: 30, lon: 127, dist: 3.1 };
    this.vel = { lat: 0, lon: 0 };
    this.idleSince = performance.now();
    this.active = true;
    this.anim = null;
    this.pool = [];

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: /capture/.test(location.search) });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    this.sunLight = new THREE.DirectionalLight(0xfff6e8, 0.9);
    this.scene.add(this.sunLight);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowTexture()), depthWrite: false, transparent: true }));
    glow.scale.set(3.1, 3.1, 1);
    this.scene.add(glow);

    this.earthMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this.earthMat);
    this.scene.add(this.earth);
    const shell = new THREE.CanvasTexture(cloudShellTexture());
    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.02, 64, 48),
      new THREE.MeshLambertMaterial({ map: shell, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.scene.add(this.shell);

    fetch(new URL("./land.json", import.meta.url))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((land) => {
        const tex = new THREE.CanvasTexture(landTexture(land.rings));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        this.earthMat.map = tex;
        this.earthMat.needsUpdate = true;
        onReady?.(null);
      })
      .catch((error) => {
        this.earthMat.color.set(0x9cc0ea);
        onReady?.(error);
      });

    this.bindInput();
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole globe in view on narrow portrait screens.
    this.camera.fov = w < h ? 40 + Math.min(18, (h / w - 1) * 22) : 40;
    this.camera.updateProjectionMatrix();
  }

  bindInput() {
    const el = this.canvas;
    const pointers = new Map();
    let pinch = null;
    let last = null;
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.cancelFlight();
      this.closePick();
      this.vel = { lat: 0, lon: 0 };
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: this.view.dist };
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.idleSince = performance.now();
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0) this.view.dist = clamp(pinch.dist * (pinch.d / d), MIN_DIST, MAX_DIST);
        return;
      }
      if (!last) return;
      const k = (this.view.dist - 0.95) * 0.0042 * (600 / Math.min(this.w, this.h));
      const dLon = -(e.clientX - last.x) * k * 57;
      const dLat = (e.clientY - last.y) * k * 57;
      this.view.lon = wrapLon(this.view.lon + dLon);
      this.view.lat = clamp(this.view.lat + dLat, -80, 80);
      const dt = Math.max(1, performance.now() - last.t);
      this.vel = { lat: (dLat / dt) * 16, lon: (dLon / dt) * 16 };
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) last = null;
      else last = { ...[...pointers.values()][0], t: performance.now() };
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
    bindZoomInput(el.parentElement, {
      interrupt: () => {
        this.cancelFlight();
        this.closePick();
        this.idleSince = performance.now();
      },
      zoom: factor => { this.view.dist = clamp(this.view.dist / factor, MIN_DIST, MAX_DIST); },
      pan: (x, y) => {
        this.view.lon = wrapLon(this.view.lon - x * 0.08);
        this.view.lat = clamp(this.view.lat + y * 0.08, -80, 80);
      },
      pointersActive: () => pointers.size >= 2,
    });
    el.tabIndex = 0;
    el.setAttribute("aria-label", "Globe: arrow keys rotate, + and − zoom");
    el.addEventListener("keydown", (e) => {
      const step = 8 * (this.view.dist / 3);
      if (e.key === "ArrowLeft") this.view.lon = wrapLon(this.view.lon - step);
      else if (e.key === "ArrowRight") this.view.lon = wrapLon(this.view.lon + step);
      else if (e.key === "ArrowUp") this.view.lat = clamp(this.view.lat + step, -80, 80);
      else if (e.key === "ArrowDown") this.view.lat = clamp(this.view.lat - step, -80, 80);
      else if (e.key === "+" || e.key === "=") this.view.dist = clamp(this.view.dist * 0.85, MIN_DIST, MAX_DIST);
      else if (e.key === "-") this.view.dist = clamp(this.view.dist / 0.85, MIN_DIST, MAX_DIST);
      else return;
      e.preventDefault();
      this.cancelFlight();
      this.idleSince = performance.now();
    });
  }

  // A flight interrupted by touch, wheel or keys still resolves (with false),
  // so nothing waiting on it is left hanging.
  cancelFlight() {
    const a = this.anim;
    this.anim = null;
    a?.resolve(false);
  }

  // Animates the camera to a lat/lon/dist. Resolves true when it arrives.
  flyTo(lat, lon, dist, ms = 1100) {
    this.cancelFlight();
    const from = { ...this.view };
    let dLon = wrapLon(lon - from.lon);
    const to = { lat, lon: from.lon + dLon, dist };
    const duration = this.reducedMotion ? 1 : ms;
    return new Promise((resolve) => {
      this.anim = { from, to, start: performance.now(), duration, resolve };
    });
  }

  focus(lat, lon) {
    this.view.lat = clamp(lat, -80, 80);
    this.view.lon = wrapLon(lon);
  }

  frame(t, sunDir) {
    if (!this.active) return;
    if (this.anim) {
      const a = this.anim;
      const k = Math.min(1, (t - a.start) / a.duration);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.view.lat = a.from.lat + (a.to.lat - a.from.lat) * e;
      this.view.lon = wrapLon(a.from.lon + (a.to.lon - a.from.lon) * e);
      this.view.dist = a.from.dist + (a.to.dist - a.from.dist) * e;
      if (k >= 1) {
        this.anim = null;
        a.resolve(true);
      }
      this.idleSince = t;
    } else if (Math.abs(this.vel.lat) + Math.abs(this.vel.lon) > 0.01) {
      this.view.lon = wrapLon(this.view.lon + this.vel.lon);
      this.view.lat = clamp(this.view.lat + this.vel.lat, -80, 80);
      this.vel.lat *= 0.92;
      this.vel.lon *= 0.92;
    } else if (!this.reducedMotion && t - this.idleSince > 4000 && (!this.pick || this.pick.hidden)) {
      this.view.lon = wrapLon(this.view.lon + 0.025);
    }
    const cam = latLonToVec(this.view.lat, this.view.lon, this.view.dist);
    this.camera.position.copy(cam);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    if (sunDir) this.sunLight.position.copy(sunDir);
    else this.sunLight.position.copy(cam).add(new THREE.Vector3(0.8, 1.2, 0));
    if (!this.reducedMotion) this.shell.rotation.y = t * 0.000006;
    this.renderer.render(this.scene, this.camera);
    this.placeMarkers();
  }

  placeMarkers() {
    const camDir = this.camera.position.clone().normalize();
    const visible = [];
    for (const c of this.cities) {
      const facing = c.vec.dot(camDir);
      if (facing < 0.22) continue;
      const p = c.vec.clone().project(this.camera);
      const x = (p.x * 0.5 + 0.5) * this.w;
      const y = (-p.y * 0.5 + 0.5) * this.h;
      if (x < -20 || y < -20 || x > this.w + 20 || y > this.h + 20) continue;
      visible.push({ c, x, y, facing });
    }
    // Greedy clustering in screen space; capitals claim cells first.
    visible.sort((a, b) => (b.c.kind === "capital") - (a.c.kind === "capital") || b.facing - a.facing);
    const groups = [];
    for (const v of visible) {
      const g = groups.find((q) => Math.hypot(q.x - v.x, q.y - v.y) < CELL);
      if (g) g.items.push(v);
      else groups.push({ x: v.x, y: v.y, items: [v] });
    }
    let i = 0;
    for (const g of groups) {
      const el = this.pool[i] || this.makeMarker();
      this.pool[i++] = el;
      const single = g.items.length === 1;
      const lead = g.items[0].c;
      el.hidden = false;
      el.style.transform = `translate(${g.x}px, ${g.y}px) translate(-50%, -50%)`;
      el.style.opacity = String(Math.min(1, (g.items[0].facing - 0.22) * 5));
      el.className = `marker${single ? "" : " cluster"}${lead.kind === "capital" ? " capital" : ""}`;
      el._group = g;
      const showLabel = single && (this.view.dist < 2.4 || lead.kind === "capital" || lead.kind === "state");
      const words = g.items.reduce((n, v) => n + (this.words[v.c.id] || 0), 0);
      const key = `${single ? lead.id : `c${g.items.length}:${lead.id}`}|${showLabel}|${words}`;
      if (el._key !== key) {
        el._key = key;
        el.dataset.heat = String(heatOf(words));
        el.dot.textContent = String(words);
        el.label.textContent = showLabel ? lead.nameEn : "";
        const w = `${words} ${words === 1 ? "word" : "words"} in the sky`;
        el.setAttribute("aria-label", single ? `${lead.nameEn}, ${w}. Open its sky` : `${lead.nameEn} and ${g.items.length - 1} more cities, ${w}`);
        el.title = single ? `${lead.nameEn} · ${w}` : `${g.items.length} cities · ${w}`;
      }
    }
    for (; i < this.pool.length; i++) this.pool[i].hidden = true;
  }

  makeMarker() {
    const el = document.createElement("button");
    el.type = "button";
    el.dot = document.createElement("span");
    el.dot.className = "dot";
    el.label = document.createElement("span");
    el.label.className = "label";
    el.append(el.dot, el.label);
    el.addEventListener("click", () => {
      const g = el._group;
      if (!g) return;
      if (g.items.length === 1) return this.onSelect(g.items[0].c);
      // Zoom in if that will pull the markers apart; cities too close to
      // ever separate (Rome and Vatican City, 4 km) get a list instead.
      let spread = 0;
      for (const a of g.items) for (const b of g.items) spread = Math.max(spread, Math.hypot(a.x - b.x, a.y - b.y));
      const gain = (this.view.dist - 0.98) / (MIN_DIST - 0.98);
      if (spread * gain < CELL * 1.1 || g.items.length <= 4 && this.view.dist < 2.2) return this.openPick(g);
      const lat = g.items.reduce((s, v) => s + v.c.lat, 0) / g.items.length;
      const lon = circularMeanLon(g.items.map((v) => v.c.lon));
      this.flyTo(lat, lon, Math.max(MIN_DIST, this.view.dist * 0.6), 700);
    });
    this.layer.append(el);
    return el;
  }

  // A small list of the cities in a cluster, each opening its own sky.
  openPick(g) {
    const box = this.pick;
    box.replaceChildren();
    const h = document.createElement("h3");
    h.textContent = `${g.items.length} cities here`;
    box.append(h);
    for (const v of [...g.items].sort((a, b) => a.c.nameEn.localeCompare(b.c.nameEn))) {
      const b = document.createElement("button");
      b.type = "button";
      const words = this.words[v.c.id] || 0;
      b.innerHTML = '<span class="n"></span><span class="w"></span>';
      b.querySelector(".n").textContent = v.c.nameEn;
      b.querySelector(".w").textContent = `${words} ${words === 1 ? "word" : "words"}`;
      b.addEventListener("click", () => {
        this.closePick();
        this.onSelect(v.c);
      });
      box.append(b);
    }
    box.style.left = `${Math.max(130, Math.min(this.w - 130, g.x))}px`;
    box.style.top = `${Math.min(this.h - 220, g.y)}px`;
    box.hidden = false;
    box.querySelector("button")?.focus();
    this.pickOpenAt = performance.now();
  }

  closePick() {
    if (this.pick) this.pick.hidden = true;
  }

  setWords(words) {
    this.words = words;
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
function circularMeanLon(lons) {
  let x = 0;
  let y = 0;
  for (const l of lons) {
    x += Math.cos((l * Math.PI) / 180);
    y += Math.sin((l * Math.PI) / 180);
  }
  return (Math.atan2(y, x) * 180) / Math.PI;
}
