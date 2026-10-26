// The letter tray: one card per letter (never one per piece) showing the
// city's shared availability. It opens and closes without touching the draft,
// and starts closed so the sky is unobstructed.
import { CONSONANTS, VOWELS } from "../src/hangul.js";
import { glyphElement } from "./glyphs.js";

const OPEN_KEY = "cloudHangul.trayOpen";

export class Tray {
  constructor({ root, openButton, closeButton, app, onPress, onToggle }) {
    this.root = root;
    this.openButton = openButton;
    this.app = app;
    this.onToggle = onToggle;
    this.buttons = new Map();
    this.shown = new Map();
    this.counts = {};
    root.dataset.tab = "c";
    for (const tab of root.querySelectorAll(".tray-tabs button")) {
      tab.addEventListener("click", () => {
        root.dataset.tab = tab.dataset.tab;
        for (const t of root.querySelectorAll(".tray-tabs button")) t.setAttribute("aria-selected", String(t === tab));
      });
    }
    const rows = { c: root.querySelector("#row-c"), v: root.querySelector("#row-v") };
    for (const [group, letters] of [["c", CONSONANTS], ["v", VOWELS]]) {
      for (const l of letters) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "letter";
        b.dataset.letter = l;
        b.innerHTML = '<span class="pile"></span><span class="count"></span>';
        b.addEventListener("pointerdown", (e) => onPress(l, b, e));
        b.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPress(l, b, null);
          }
        });
        rows[group].append(b);
        this.buttons.set(l, b);
      }
    }
    openButton.addEventListener("click", () => this.setOpen(true));
    closeButton.addEventListener("click", () => this.setOpen(false));
    this.paintGlyphs();
    // Collapsed unless this browser chose to keep it open.
    this.setOpen(localStorage.getItem(OPEN_KEY) === "1", false);
  }

  get open() {
    return !this.root.hidden;
  }

  setOpen(open, remember = true) {
    this.root.hidden = !open;
    this.openButton.hidden = open;
    this.openButton.setAttribute("aria-expanded", String(open));
    this.app.dataset.tray = open ? "open" : "closed";
    if (remember) localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    if (open) this.root.querySelector(".letter")?.focus({ preventScroll: true });
    this.onToggle?.(open);
  }

  paintGlyphs() {
    for (const [l, b] of this.buttons) {
      b.querySelector("canvas")?.remove();
      b.prepend(glyphElement(l, 38));
    }
  }

  // counts: the city's shared available pieces per letter.
  setCounts(counts) {
    this.counts = { ...counts };
    for (const [l, b] of this.buttons) {
      const n = this.counts[l] ?? 0;
      if (this.shown.get(l) === n) continue;
      this.shown.set(l, n);
      b.querySelector(".count").textContent = String(n);
      b.dataset.pile = n >= 20 ? "3" : n >= 6 ? "2" : n > 0 ? "1" : "0";
      // Out of stock looks quietly inactive; it can still be pressed, which
      // asks the server again (a refill may have landed since).
      b.classList.toggle("out", n <= 0);
      b.setAttribute("aria-label", n > 0 ? `${l}, ${n} available` : `${l}, none right now`);
    }
  }

  nudge(letter) {
    const b = this.buttons.get(letter);
    if (!b || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    b.classList.remove("nudge");
    void b.offsetWidth;
    b.classList.add("nudge");
  }

  get height() {
    return this.open ? this.root.offsetHeight : 0;
  }
}
