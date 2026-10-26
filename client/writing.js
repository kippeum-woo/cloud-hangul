// Writing in the sky: drag pieces out of the tray, see where they will snap
// before letting go, and arrange the resulting syllable blocks into words.
import { GLYPH, clampWorldY as clampY, dxWrap, wrapX } from "../src/messages.js";
import { glyphElement } from "./glyphs.js";

const DRAG_START_PX = 7;
const LIFT_TOUCH_PX = 46; // keep the dragged letter visible above a finger

// reserve(letter) claims one piece from the city's shared supply and resolves
// to its reservation id (or null if someone else got there first). release(ids)
// gives pieces back. Both are provided by main.js.
export class Writing {
  constructor({ layer, ghost, sky, tray, composer, onChange, toast, reserve, release }) {
    this.reserve = reserve;
    this.release = release;
    this.layer = layer;
    this.ghost = ghost;
    this.sky = sky;
    this.tray = tray;
    this.composer = composer;
    this.onChange = onChange;
    this.toast = toast;
    this.els = new Map(); // block id -> element
    this.selected = null;
    this.ink = null;
    this.inkKey = "";
    this.drag = null;
    this.guide = document.createElement("div");
    this.guide.className = "guide";
    this.guide.hidden = true;
    layer.append(this.guide);
    window.addEventListener("pointermove", (e) => this.move(e));
    window.addEventListener("pointerup", (e) => this.end(e, false));
    window.addEventListener("pointercancel", (e) => this.end(e, true));
  }

  get size() {
    return GLYPH * this.sky.unit;
  }

  setInk(ink) {
    const key = [...ink.fill, ...ink.shade].map((v) => Math.round(v / 16)).join(".") + Math.round(ink.glow * 4);
    if (key === this.inkKey) return;
    this.ink = ink;
    this.inkKey = key;
    for (const el of this.els.values()) el._text = null;
    this.render();
  }

  // Tray press: a drag if the pointer moves, a tap if it does not.
  pressLetter(letter, button, e) {
    if (!e) return this.tapLetter(letter);
    if (e.button !== 0 || this.drag) return;
    button.setPointerCapture?.(e.pointerId);
    this.drag = { kind: "piece", letter, id: e.pointerId, sx: e.clientX, sy: e.clientY, started: false, touch: e.pointerType === "touch", button };
  }

  pressBlock(block, el, e) {
    e.stopPropagation();
    if (e.button !== 0 || this.drag) return;
    this.select(block.id);
    this.drag = { kind: "block", block, el, id: e.pointerId, sx: e.clientX, sy: e.clientY, started: false, touch: e.pointerType === "touch" };
    el.setPointerCapture?.(e.pointerId);
  }

  // Keyboard or tap: join the selected block if possible, else start a block
  // next to the last one (or in the middle of the view).
  async tapLetter(letter) {
    const rid = await this.reserve(letter);
    if (!rid) return this.tray.nudge(letter);
    const sel = this.selected && this.composer.blocks.find((b) => b.id === this.selected);
    if (sel && this.composer.preview(sel.id, letter)) {
      this.composer.drop(letter, rid, sel.x, sel.y, sel.id);
      this.pulse(sel.id);
    } else {
      const last = sel || this.composer.blocks[this.composer.blocks.length - 1];
      const visible = last && Math.abs(this.sky.toScreen(last.x, last.y).x - this.sky.w / 2) < this.sky.w / 2 - this.size;
      const spot = last && visible ? { x: last.x + GLYPH * 1.04, y: last.y } : this.sky.toSky(this.sky.w / 2, this.sky.h * 0.45);
      const r = this.composer.drop(letter, rid, spot.x, spot.y, null);
      this.select(r.block.id);
    }
    this.changed();
  }

  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.started) {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.hypot(dx, dy) < DRAG_START_PX) return;
      // From the tray, a sideways touch swipe scrolls the row instead.
      if (d.kind === "piece" && d.touch && Math.abs(dx) > Math.abs(dy)) {
        this.drag = null;
        return;
      }
      d.started = true;
      if (d.kind === "piece") {
        // Claim the piece the moment it leaves the tray.
        d.claim = this.reserve(d.letter);
        this.ghost.replaceChildren(glyphElement(d.letter, this.size, this.ink || undefined));
        this.ghost.hidden = false;
      } else d.el.classList.add("dragging");
    }
    e.preventDefault();
    const lift = d.touch ? LIFT_TOUCH_PX : 0;
    const px = e.clientX;
    const py = e.clientY - lift;
    d.px = px;
    d.py = py;
    const overTray = e.clientY > window.innerHeight - this.tray.height;
    d.overTray = overTray;
    if (d.kind === "piece") {
      this.ghost.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%) scale(${overTray ? 0.7 : 1})`;
      this.ghost.style.opacity = overTray ? "0.6" : "1";
      const at = this.sky.toSky(px, py);
      const target = overTray ? null : this.joinTarget(at, b => this.composer.preview(b.id, d.letter));
      this.setTarget(target, target ? this.composer.preview(target.id, d.letter) : null);
      this.showGuide(!overTray && !target ? this.alignSpot(at.x, at.y, null) : null);
    } else {
      const el = d.el;
      el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%) scale(${overTray ? 0.7 : 1.06})`;
      el.style.opacity = overTray ? "0.5" : "";
      const at = this.sky.toSky(px, py);
      const target = overTray ? null : this.joinTarget(at, b => this.composer.previewMerge(d.block.id, b.id), d.block.id);
      this.setTarget(target, target ? this.composer.previewMerge(d.block.id, target.id) : null);
      this.showGuide(overTray || target ? null : this.alignSpot(at.x, at.y, d.block.id));
    }
  }

  async end(e, cancelled) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.ghost.hidden = true;
    this.showGuide(null);
    const target = this.target;
    this.setTarget(null);
    if (!d.started) {
      if (d.kind === "piece" && !cancelled) this.tapLetter(d.letter);
      return;
    }
    if (d.kind === "piece") {
      if (cancelled || d.overTray) {
        const rid = await d.claim;
        if (rid) this.release([rid]);
        return;
      }
      const rid = await d.claim;
      if (!rid) return this.tray.nudge(d.letter);
      const at = this.sky.toSky(d.px, d.py);
      const y = clampY(at.y);
      if (target && this.composer.blocks.includes(target)) {
        const r = this.composer.drop(d.letter, rid, at.x, y, target.id);
        if (r.joined) this.pulse(target.id);
        else {
          // Not composable here: place it as the next syllable instead.
          r.block.x = wrapX(target.x + GLYPH * 1.04 * (dxWrap(target.x, at.x) < 0 ? -1 : 1));
          r.block.y = target.y;
          this.toast(`${d.letter} can't join ${this.composer.text(target)}, so it was placed beside it`);
        }
        this.select(r.block.id);
      } else {
        const spot = this.alignSpot(at.x, y, null) || { x: at.x, y };
        const r = this.composer.drop(d.letter, rid, spot.x, spot.y, null);
        this.select(r.block.id);
      }
      this.changed();
      return;
    }
    d.el.classList.remove("dragging");
    d.el.style.opacity = "";
    if (!cancelled && d.overTray) {
      this.release(this.composer.remove(d.block.id));
      this.selected = null;
    } else if (!cancelled) {
      if (target && this.composer.merge(d.block.id, target.id)) {
        this.select(target.id);
        this.changed();
        this.pulse(target.id);
        return;
      }
      const at = this.sky.toSky(d.px, d.py);
      const spot = this.alignSpot(at.x, clampY(at.y), d.block.id) || { x: at.x, y: clampY(at.y) };
      this.composer.move(d.block.id, spot.x, spot.y);
    }
    this.changed();
  }

  // Accept a vowel beside a block or a final below it. Keep a minimum
  // screen-space hit area when zoomed out, and prefer compatible blocks.
  joinTarget(at, accepts, exclude = null) {
    let best = null;
    const reachX = Math.max(GLYPH * 0.9, 44 / this.sky.unit);
    const reachY = Math.max(GLYPH * 1.25, 56 / this.sky.unit);
    for (const b of this.composer.blocks) {
      if (b.id === exclude || !accepts(b)) continue;
      const dx = dxWrap(b.x, at.x), dy = at.y - b.y;
      const distance = (dx / reachX) ** 2 + (dy / reachY) ** 2;
      if (distance <= 1 && (!best || distance < best.distance)) best = { b, distance };
    }
    return best?.b || null;
  }

  // Lines a block up beside a neighbor so syllables read as a word.
  alignSpot(x, y, exclude) {
    let best = null;
    for (const b of this.composer.blocks) {
      if (b.id === exclude) continue;
      const dx = dxWrap(b.x, x);
      const dy = y - b.y;
      if (Math.abs(dy) < GLYPH * 0.6 && Math.abs(dx) > GLYPH * 0.45 && Math.abs(dx) < GLYPH * 1.7) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (!best || d < best.d) best = { d, x: wrapX(b.x + Math.sign(dx) * GLYPH * 1.04), y: b.y, from: b };
      }
    }
    return best;
  }

  showGuide(spot) {
    if (!spot) {
      this.guide.hidden = true;
      return;
    }
    const a = this.sky.toScreen(spot.from.x, spot.from.y);
    const b = this.sky.toScreen(spot.x, spot.y);
    const left = Math.min(a.x, b.x) - this.size * 0.4;
    this.guide.hidden = false;
    this.guide.style.transform = `translate(${left}px, ${a.y + this.size * 0.56}px)`;
    this.guide.style.width = `${Math.abs(b.x - a.x) + this.size * 0.8}px`;
  }

  setTarget(block, preview) {
    if (this.target && this.target.id !== block?.id) {
      const old = this.els.get(this.target.id);
      old?.classList.remove("target", "reject");
      old?.querySelector(".preview")?.remove();
    }
    this.target = block;
    if (!block) return;
    const el = this.els.get(block.id);
    if (!el) return;
    el.classList.toggle("target", Boolean(preview));
    el.classList.toggle("reject", !preview);
    let tip = el.querySelector(".preview");
    if (!tip) {
      tip = document.createElement("span");
      tip.className = "preview";
      el.append(tip);
    }
    tip.textContent = preview ? `→ ${preview}` : "✕ goes beside";
  }

  select(id) {
    this.selected = id;
    for (const [bid, el] of this.els) el.classList.toggle("selected", bid === id);
    this.onChange?.();
  }

  pulse(id) {
    const el = this.els.get(id);
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ scale: "1" }, { scale: "1.18" }, { scale: "1" }], { duration: 260, easing: "ease-out" });
  }

  changed() {
    this.render();
    this.onChange?.();
  }

  // Keeps one element per draft block, positioned from sky coordinates.
  render() {
    const live = new Set();
    for (const b of this.composer.blocks) {
      live.add(b.id);
      let el = this.els.get(b.id);
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "block";
        el.addEventListener("pointerdown", (e) => this.pressBlock(this.composer.blocks.find((x) => x.id === b.id), el, e));
        const pop = document.createElement("span");
        pop.className = "pop";
        pop.textContent = "−";
        pop.title = "Take out the last piece";
        pop.setAttribute("aria-label", "Take out the last piece");
        pop.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          this.release(this.composer.pop(b.id));
          this.changed();
        });
        el.append(pop);
        this.layer.append(el);
        this.els.set(b.id, el);
      }
      const text = this.composer.text(b);
      const size = Math.round(this.size);
      if (el._text !== text || el._size !== size) {
        el._text = text;
        el._size = size;
        el.querySelector("canvas")?.remove();
        el.prepend(glyphElement(text, size, this.ink || undefined));
        el.style.width = `${size * 1.1}px`;
        el.style.height = `${size * 1.1}px`;
        el.setAttribute("aria-label", `Draft syllable ${text}, pieces ${b.pieces.map((p) => p.l).join(" ")}`);
      }
      el.classList.toggle("selected", b.id === this.selected);
      el.querySelector(".pop").hidden = b.id !== this.selected;
    }
    for (const [id, el] of this.els) {
      if (!live.has(id)) {
        el.remove();
        this.els.delete(id);
      }
    }
    if (this.selected && !live.has(this.selected)) this.selected = null;
    this.position();
  }

  position() {
    for (const b of this.composer.blocks) {
      const el = this.els.get(b.id);
      if (!el || (this.drag?.kind === "block" && this.drag.block.id === b.id && this.drag.started)) continue;
      const p = this.sky.toScreen(b.x, b.y);
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
  }

  // Replace editable blocks immediately with the anchored canvas message.
  finishRelease() {
    this.drag = null;
    this.selected = null;
    this.guide.hidden = true;
    this.ghost.hidden = true;
    for (const el of this.els.values()) el.remove();
    this.els.clear();
  }
}

