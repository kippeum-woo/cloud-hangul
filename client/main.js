// 구름한글: globe → city → its live local sky → write cloud letters →
// release → share. Letters come from the city's shared supply on the server;
// this browser only ever holds reservations. Everything that changes over
// time is computed from UTC instants each frame (clock, sun, message age,
// word counts); remote data is requested when something happens: a city is
// chosen, a letter is picked up, the sky is panned to an unloaded area, the
// tab becomes visible again, or the network comes back. Live changes arrive
// over server-sent events.
import { CITIES, cityById, placeLabel } from "../src/cities.js";
import { ageLabel, dateLabel, offsetLabel, timeLabel } from "../src/clock.js";
import { createComposer, restoreComposer } from "../src/composer.js";
import { LETTERS } from "../src/hangul.js";
import { dxWrap, inRect, LIFETIME_MS, SKY_W, textOf, wrapX } from "../src/messages.js";
import { PHASE_LABELS } from "../src/sky.js";
import { condition, PRESETS, simulatedSteps, stepAt } from "../src/weather.js";
import { api, requestId, serverNow, subscribeCity, subscribeWords } from "./api.js";
import { setupBrowse, setupGps, setupSearch } from "./browse.js";
import { clearGlyphCache, FONT } from "./glyphs.js";
import { SkyView, ZOOM_MAX, ZOOM_MIN } from "./skyview.js";
import { Tray } from "./tray.js";
import { shareLink, showModal, toast } from "./ui.js";
import { Writing } from "./writing.js";

const $ = (id) => document.getElementById(id);
const app = $("app");
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
const SAVE_KEY = "cloudHangul.draft";
const MARGIN = 1; // world units loaded around the view
const EVICT_MARGIN = 3; // world units kept around the view before messages are dropped
const TWEEN_MS = 700;
const WEATHER_STALE_MS = 10 * 60 * 1000;
const RENEW_EVERY_MS = 60 * 1000; // renew reservations at most this often while composing

// Developer overrides (see dev.js). They never touch shared data.
export const dev = {
  timeOffset: 0, // ms added to the sky clock
  weather: null, // preset key or null for live weather
  ageOffset: 0, // ms added to message ages
  reducedMotion: null, // null follows the system setting
};

const state = {
  view: "globe",
  city: null,
  author: null,
  ready: null, // resolves once the server identity exists
  weather: null, // { source, steps, fetchedAt, cityId }
  counts: {}, // shared available pieces for the current city
  loaded: new Set(), // "tileX:tileY" keys of world tiles already requested
  tween: null,
  momentum: null,
  total: 0,
  loadingMessages: false,
  messagesError: null,
  unsubscribe: null,
  globe: null,
  words: new Map(), // cityId -> Map(messageId -> [expiresAt, words])
  publishId: null,
  lastRenew: 0,
};

const reducedMotion = () => dev.reducedMotion ?? motionQuery.matches;
const skyNow = () => serverNow() + dev.timeOffset;
const quality = new URLSearchParams(location.search).get("quality") === "low" ? "low" : "auto";

// ---------- sky, tray, writing ----------
let composer = createComposer();
let writing = null;
const sky = new SkyView($("sky-canvas"), { reducedMotion: reducedMotion(), quality });
const tray = new Tray({
  root: $("tray"),
  openButton: $("tray-open"),
  closeButton: $("tray-close"),
  app,
  onPress: (l, b, e) => writing.pressLetter(l, b, e),
  onToggle: () => writing?.position(),
});
writing = new Writing({
  layer: $("draft-layer"),
  ghost: $("drag-ghost"),
  sky,
  tray,
  composer,
  toast,
  reserve,
  release: releasePieces,
  onChange: () => {
    save();
    updateCompose();
    renewSoon();
  },
});

function setComposer(next) {
  composer = next;
  writing.composer = next;
  writing.selected = null;
  writing.render();
  updateCompose();
}

// The draft (reservation ids and layout) is cached per city in this browser
// so a reload can pick it back up. Stock itself is never stored here.
function save() {
  if (!state.city) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify({ cityId: state.city.id, ...composer.save() }));
}
function savedDraft(cityId) {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    return saved?.cityId === cityId ? saved : null;
  } catch {
    return null;
  }
}

function layout() {
  sky.resize(window.innerWidth, window.innerHeight);
  state.globe?.resize();
  writing.render();
}
window.addEventListener("resize", layout);
window.addEventListener("orientationchange", () => requestAnimationFrame(layout));

// ---------- shared supply ----------
function setCounts(available) {
  if (!available) return;
  state.counts = { ...available };
  tray.setCounts(state.counts);
}
const bump = (letter, n) => {
  state.counts[letter] = Math.max(0, (state.counts[letter] || 0) + n);
  tray.setCounts(state.counts);
};

// Claims one piece for this browser. Resolves to a reservation id or null.
async function reserve(letter) {
  const city = state.city;
  if (!city) return null;
  await state.ready;
  bump(letter, -1); // optimistic; the server's answer replaces it
  try {
    const res = await api.reserve(city.id, letter);
    if (state.city?.id !== city.id) {
      api.release(city.id, [res.reservation.id]).catch(() => {});
      return null;
    }
    setCounts(res.available);
    return res.reservation.id;
  } catch (error) {
    if (error.data?.available) setCounts(error.data.available);
    else bump(letter, 1);
    if (!error.status) toast("Couldn't reach the server. Try that letter again.");
    return null;
  }
}

function releasePieces(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length || !state.city) return;
  const cityId = state.city.id;
  api
    .release(cityId, list)
    .then((res) => state.city?.id === cityId && setCounts(res.available))
    // If this fails the reservations still expire on the server by themselves.
    .catch(() => {});
}

// Keeps this draft's reservations alive while the player is composing:
// triggered by composition changes and by returning to the tab.
function renewSoon(force = false) {
  const ids = composer.rids();
  if (!ids.length || !state.city) return;
  if (!force && Date.now() - state.lastRenew < RENEW_EVERY_MS) return;
  state.lastRenew = Date.now();
  const cityId = state.city.id;
  api
    .renew(cityId, ids)
    .then((res) => {
      if (state.city?.id !== cityId || !res.missing.length) return;
      releasePieces(composer.forget(res.missing));
      writing.changed();
      toast("Some letters you left idle went back to the city");
    })
    .catch(() => {});
}

async function syncInventory(city) {
  try {
    const res = await api.inventory(city.id);
    if (state.city?.id !== city.id) return;
    setCounts(res.available);
    const saved = savedDraft(city.id);
    if (saved && !composer.blocks.length) {
      const savedIds = new Set((saved.blocks || []).flatMap((b) => (b.pieces || []).map((p) => p.rid)));
      const { composer: restored, release } = restoreComposer(saved, res.mine);
      releasePieces(release.filter((id) => savedIds.has(id)));
      setComposer(restored);
      save();
    }
  } catch {
    // Messages and the sky still work; the tray stays as it was.
  }
}

// ---------- composing ----------
function updateCompose() {
  const has = composer.blocks.length > 0;
  $("compose-bar").hidden = !has && !composer.canUndo;
  $("btn-release").disabled = !has || Boolean(state.messagesError);
  $("btn-reset").disabled = !has;
  $("btn-undo").disabled = !composer.canUndo;
  $("btn-remove").disabled = !writing.selected;
  updateNote();
}

$("btn-undo").addEventListener("click", async () => {
  const step = composer.undo();
  if (step.release) {
    releasePieces(step.release);
    return writing.changed();
  }
  // Undoing a removal: those letters must be claimed again from the city.
  const rids = [];
  for (const l of step.need) {
    const rid = await reserve(l);
    if (!rid) {
      releasePieces(rids);
      toast("Those letters were taken by someone else in the meantime");
      return writing.changed();
    }
    rids.push(rid);
  }
  step.apply(rids);
  writing.changed();
});
$("btn-remove").addEventListener("click", () => {
  if (writing.selected) releasePieces(composer.remove(writing.selected));
  writing.changed();
});
$("btn-reset").addEventListener("click", () => {
  releasePieces(composer.reset());
  writing.changed();
  toast("All pieces went back to the city's letters");
});
$("btn-release").addEventListener("click", publish);

async function publish() {
  const draft = composer.toMessage();
  if (!draft || !state.city) return;
  const btn = $("btn-release");
  btn.disabled = true;
  // The same id is reused if this attempt is retried, so it cannot post twice.
  state.publishId ||= requestId();
  try {
    const { message } = await api.publish(state.city.id, draft, state.publishId);
    state.publishId = null;
    composer.spend();
    writing.floatAway();
    save();
    addMessage(message);
    sky.highlight = message.id;
    updateCompose();
    shareMessageDialog(message, true);
  } catch (error) {
    if (error.code === "reservation_missing") {
      state.publishId = null;
      releasePieces(composer.forget(error.data?.missing || []));
      writing.changed();
      toast("Some letters in your draft had expired. Add them again, then release.", 4200);
      return;
    }
    if (error.status) state.publishId = null;
    const text = {
      too_fast: "Wait a moment before releasing another message",
      sky_full: "This sky is full right now. Try again a little later",
      empty_message: "There's nothing to release yet",
      invalid_block: "One of the syllables isn't valid Hangul",
    }[error.code];
    toast(text || "Couldn't reach the message server. Your draft is still here.", 3600);
  } finally {
    updateCompose();
  }
}

// ---------- shared messages ----------
// Messages outside the loaded region are not kept; live pushes there are skipped.
function addMessage(m) {
  if (m.cityId !== state.city?.id) return;
  if (!inRect(m, sky.visibleRange(EVICT_MARGIN))) return;
  sky.messages.set(m.id, m);
  state.total = Math.max(state.total, sky.messages.size);
  updateNote();
}

// Loads 1×1 world tiles around the view, one request per tile row.
async function loadVisible() {
  if (!state.city) return;
  const v = sky.visibleRange(MARGIN);
  const ixFrom = Math.floor(v.x0);
  const ixTo = Math.min(Math.floor(v.x1), ixFrom + SKY_W - 1);
  const rows = new Map();
  const added = [];
  for (let iy = Math.floor(v.y0); iy <= Math.floor(v.y1); iy++) {
    for (let ix = ixFrom; ix <= ixTo; ix++) {
      const key = `${wrapX(ix)}:${iy}`;
      if (state.loaded.has(key)) continue;
      state.loaded.add(key);
      added.push(key);
      const row = rows.get(iy);
      if (row) row.hi = ix;
      else rows.set(iy, { lo: ix, hi: ix });
    }
  }
  if (!rows.size) return;
  const cityId = state.city.id;
  state.loadingMessages = true;
  updateNote();
  try {
    const results = await Promise.all(
      [...rows].map(([iy, r]) => api.messages(cityId, { x0: r.lo, x1: r.hi + 1, y0: iy, y1: iy + 1 })),
    );
    if (state.city?.id !== cityId) return;
    state.total = results[0].total;
    for (const res of results) for (const m of res.messages) addMessage(m);
    state.messagesError = null;
    evictFar();
  } catch (error) {
    for (const key of added) state.loaded.delete(key);
    state.messagesError = error;
  } finally {
    state.loadingMessages = false;
    updateNote();
    updateCompose();
  }
}

function evictFar() {
  const keep = sky.visibleRange(EVICT_MARGIN);
  const mid = (keep.x0 + keep.x1) / 2;
  const half = (keep.x1 - keep.x0) / 2;
  for (const key of state.loaded) {
    const [ix, iy] = key.split(":").map(Number);
    if (iy + 1 < keep.y0 || iy > keep.y1 || Math.abs(dxWrap(mid, ix + 0.5)) > half + 0.5) state.loaded.delete(key);
  }
  for (const m of sky.messages.values()) if (!inRect(m, keep)) sky.messages.delete(m.id);
}

function connect(city) {
  state.unsubscribe?.();
  let first = true;
  state.unsubscribe = subscribeCity(city.id, {
    onOpen: (hello) => {
      setCounts(hello.inventory);
      // On reconnect, anything may have changed while we were away.
      if (!first) {
        state.loaded.clear();
        loadVisible();
      }
      first = false;
    },
    onMessage: addMessage,
    onDelete: (id) => {
      sky.messages.delete(id);
      state.total = Math.max(0, state.total - 1);
      hidePopover();
      updateNote();
    },
    onInventory: setCounts,
  });
}

function updateNote() {
  const note = $("sky-note");
  if (state.view !== "sky") return;
  let html = "";
  let error = false;
  if (state.messagesError) {
    error = true;
    html = "Couldn't reach the message server.<br />Other people's clouds and releasing new ones are unavailable.<br /><button class=\"pill small\" id=\"retry\">Try again</button>";
  } else if (state.loadingMessages && !sky.messages.size) html = "Loading this sky…";
  else if (!state.total && !composer.blocks.length && !sky.messages.size)
    html = "No cloud messages in this sky yet.<br />Open <strong>Letters</strong> and drag letters up to write the first one.";
  note.hidden = !html;
  note.classList.toggle("error", error);
  if (note._html !== html) {
    note._html = html;
    note.innerHTML = html;
    note.querySelector("#retry")?.addEventListener("click", () => {
      state.messagesError = null;
      loadVisible();
    });
  }
}

// ---------- word counts for the globe ----------
async function loadWords() {
  try {
    const res = await api.words();
    state.words = new Map(Object.entries(res.cities).map(([cityId, list]) => [cityId, new Map(list.map(([id, exp, n]) => [id, [exp, n]]))]));
  } catch {
    /* markers show 0 until the next event */
  }
}
subscribeWords({
  onOpen: loadWords,
  onWords: (e) => {
    if (!state.words.has(e.cityId)) state.words.set(e.cityId, new Map());
    const map = state.words.get(e.cityId);
    if (e.op === "add") map.set(e.entry[0], [e.entry[1], e.entry[2]]);
    else map.delete(e.id);
  },
});
// Sums live words per city. Expiry is applied here against the server clock,
// so a count drops at exactly 24 hours without asking the server.
function liveWords() {
  const now = serverNow();
  const out = {};
  for (const [cityId, map] of state.words) {
    let n = 0;
    for (const [exp, w] of map.values()) if (exp > now) n += w;
    if (n) out[cityId] = n;
  }
  return out;
}

// ---------- weather ----------
async function loadWeather(city) {
  try {
    const res = await api.weather(city.id);
    if (state.city?.id !== city.id) return;
    state.weather = { source: res.source, steps: res.steps, fetchedAt: Date.now(), cityId: city.id };
  } catch {
    if (state.city?.id !== city.id) return;
    state.weather = { source: "simulated", steps: simulatedSteps(city.id, skyNow()), fetchedAt: Date.now(), cityId: city.id };
  }
  applyWeather();
}

let weatherStepAt = null;
function currentCondition() {
  if (dev.weather) return condition(PRESETS[dev.weather], false);
  if (!state.weather) return null;
  const step = stepAt(state.weather.steps, skyNow());
  return condition(step, state.weather.source !== "open-meteo");
}
function applyWeather() {
  const w = currentCondition();
  weatherStepAt = w ? dev.weather || stepAt(state.weather.steps, skyNow()).at : null;
  sky.setWeather(w, skyNow());
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !state.city) return;
  if (!state.weather || Date.now() - state.weather.fetchedAt > WEATHER_STALE_MS) loadWeather(state.city);
  renewSoon(true);
  syncInventory(state.city);
});
window.addEventListener("online", () => {
  if (!state.city) return;
  loadWeather(state.city);
  syncInventory(state.city);
  if (state.messagesError) {
    state.messagesError = null;
    loadVisible();
  }
});

// ---------- header ----------
const shown = {};
function setText(id, text) {
  if (shown[id] === text) return;
  shown[id] = text;
  $(id).textContent = text;
}
function updateHeader() {
  const c = state.city;
  if (!c) return;
  const now = skyNow();
  const s = sky.state;
  setText("place-clock", timeLabel(now, c.tz, true));
  setText("place-date", dateLabel(now, c.tz));
  setText("place-offset", offsetLabel(now, c.tz));
  if (s) {
    let phase = PHASE_LABELS[s.phase];
    if (s.polar === "day") phase += " · Midnight sun";
    else if (s.polar === "night") phase += " · Polar night";
    setText("place-phase", phase);
    setText("place-sun", s.times.sunrise && s.times.sunset ? `Sunrise ${timeLabel(s.times.sunrise, c.tz)} · Sunset ${timeLabel(s.times.sunset, c.tz)}` : "");
  }
  const w = sky.weather;
  setText("place-weather", w ? `${w.label}${Number.isFinite(w.temp) ? ` ${Math.round(w.temp)}°C` : ""}${w.wind >= 30 ? " · Windy" : ""}` : "Loading weather…");
  const badge = $("weather-badge");
  const simulated = dev.weather ? "Developer weather" : state.weather?.source === "simulated" ? "Simulated weather" : "";
  badge.hidden = !simulated;
  if (simulated) setText("weather-badge", simulated);
}

// ---------- popover for a tapped message ----------
const popover = $("popover");
function hidePopover() {
  popover.hidden = true;
}
function showPopover(m, px, py) {
  const age = serverNow() + dev.ageOffset - m.createdAt;
  const left = LIFETIME_MS - age;
  const mine = m.author && m.author === state.author;
  popover.innerHTML = '<div class="msg-text" lang="ko"></div><div class="meta"></div><div class="row"></div>';
  popover.querySelector(".msg-text").textContent = m.text ?? textOf(m);
  const hours = Math.max(1, Math.ceil(left / 3600000));
  popover.querySelector(".meta").textContent = `${mine ? "Your message" : "From another traveler"} · ${ageLabel(age)} · fades in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const row = popover.querySelector(".row");
  const share = document.createElement("button");
  share.className = "pill small";
  share.textContent = "🔗 Link";
  share.addEventListener("click", () => shareMessageDialog(m, false));
  row.append(share);
  if (mine) {
    const del = document.createElement("button");
    del.className = "pill small";
    del.textContent = "🗑 Delete";
    del.addEventListener("click", () => confirmDelete(m));
    row.append(del);
  }
  popover.hidden = false;
  const x = Math.max(150, Math.min(window.innerWidth - 150, px));
  popover.style.left = `${x}px`;
  popover.style.top = `${Math.max(150, py)}px`;
}

function quoted(m) {
  const span = document.createElement("p");
  span.lang = "ko";
  span.className = "quote";
  span.textContent = `“${m.text ?? textOf(m)}”`;
  return span;
}

function confirmDelete(m) {
  showModal({
    title: "Delete this message?",
    body: [quoted(m), "It disappears from this sky for everyone. Its letters don't come back."],
    actions: [
      { label: "Cancel" },
      {
        label: "Delete",
        primary: true,
        onClick: async () => {
          try {
            await api.remove(m.cityId, m.id);
            sky.messages.delete(m.id);
            hidePopover();
            toast("Message deleted");
          } catch (error) {
            toast(error.code === "not_owner" ? "You can only delete your own messages" : "Couldn't delete it. Please try again");
          }
        },
      },
    ],
  });
}

const cityUrl = (city, messageId) => {
  const u = new URL(document.baseURI);
  u.search = "";
  u.searchParams.set("city", city.id);
  if (messageId) u.searchParams.set("m", messageId);
  return u.toString();
};

function shareMessageDialog(m, fresh) {
  const city = cityById(m.cityId);
  const url = cityUrl(city, m.id);
  const input = Object.assign(document.createElement("input"), { className: "share-link", value: url, readOnly: true });
  input.addEventListener("focus", () => input.select());
  showModal({
    title: fresh ? "Released into the sky ☁️" : "Message link",
    body: [
      quoted(m),
      fresh ? `It's floating over ${city.nameEn} now. Everyone who opens this sky can see it for 24 hours.` : `In the sky over ${city.nameEn}.`,
      input,
    ],
    actions: [
      { label: "Close" },
      {
        label: "Share link",
        primary: true,
        onClick: async () => {
          const r = await shareLink(url, `구름한글 · ${city.nameEn}`);
          if (r === "copied") toast("Link copied");
          else if (r === "failed") {
            input.focus();
            toast("Press and hold the link to copy it");
            return false;
          }
        },
      },
    ],
  });
}

$("btn-share-city").addEventListener("click", async () => {
  if (!state.city) return;
  const r = await shareLink(cityUrl(state.city), `구름한글 · ${state.city.nameEn}`);
  if (r === "copied") toast(`Link to the ${state.city.nameEn} sky copied`);
  else if (r === "failed") toast("Couldn't copy the link");
});

// ---------- sky camera: drag or touch to pan, pinch or wheel to zoom ----------
{
  const canvas = $("sky-canvas");
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let velocity = { x: 0, y: 0 };
  const interrupt = () => {
    hidePopover();
    state.tween = null;
    state.momentum = null;
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    interrupt();
    velocity = { x: 0, y: 0 };
    if (pointers.size >= 2) {
      startPinch();
      return;
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() };
  });
  function startPinch() {
    drag = null;
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const prev = { x: p.x, y: p.y };
    p.x = e.clientX;
    p.y = e.clientY;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const next = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (pinch.dist > 0 && next.dist > 0) sky.zoomAt(next.dist / pinch.dist, pinch.mx, pinch.my);
      sky.panBy(next.mx - pinch.mx, next.my - pinch.my);
      pinch = next;
      onPan();
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 6) drag.moved = true;
    if (!drag.moved) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    sky.panBy(dx, dy);
    const t = performance.now();
    const dt = Math.max(1, t - drag.t);
    velocity = { x: dx / dt, y: dy / dt };
    drag.t = t;
    hidePopover();
    onPan();
  });
  const end = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pinch) {
      if (pointers.size === 1) {
        pinch = null;
        const [id, rest] = [...pointers.entries()][0];
        drag = { id, x: rest.x, y: rest.y, sx: rest.x, sy: rest.y, moved: true, t: performance.now() };
      } else if (!pointers.size) pinch = null;
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved) {
      const m = sky.hitMessage(e.clientX, e.clientY, serverNow());
      if (m) showPopover(m, e.clientX, e.clientY - 20);
      else {
        hidePopover();
        writing.select(null);
      }
    } else if (!reducedMotion()) state.momentum = { x: velocity.x * 16, y: velocity.y * 16 };
    drag = null;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      interrupt();
      const scale = [1, 16, window.innerHeight][e.deltaMode] ?? 1;
      const dx = e.deltaX * scale;
      const dy = e.deltaY * scale;
      if (e.ctrlKey || Math.abs(dy) >= Math.abs(dx)) sky.zoomAt(Math.exp(-dy * 0.0015), e.clientX, e.clientY);
      else sky.panBy(-dx, -dy);
      onPan();
    },
    { passive: false },
  );
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Sky: drag to look around, pinch or scroll to zoom, arrow keys to pan, plus and minus to zoom");
  canvas.addEventListener("keydown", (e) => {
    const pan = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    const zoom = { "+": 1.25, "=": 1.25, "-": 0.8 }[e.key];
    if (!pan && !zoom) return;
    e.preventDefault();
    interrupt();
    if (pan) sky.panBy(pan[0] * window.innerWidth * 0.25, pan[1] * window.innerHeight * 0.25);
    else sky.zoomAt(zoom, sky.w / 2, sky.h / 2);
    onPan();
  });
}

let panTimer = null;
function onPan() {
  writing.position();
  clearTimeout(panTimer);
  panTimer = setTimeout(() => {
    loadVisible();
    saveCamera();
  }, 120); // debounce: one request after the gesture settles
}

function saveCamera() {
  if (!state.city || !sky.city) return;
  try {
    localStorage.setItem(cameraKey(state.city), JSON.stringify({ x: sky.centerX, y: sky.centerY, z: sky.zoom }));
  } catch {
    /* storage can be full or disabled; the camera simply starts at home next time */
  }
}

const cameraKey = (city) => `cloudHangul.camera.${city.id}`;

function restoreCamera(city) {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(cameraKey(city)) || "null");
  } catch {
    saved = null;
  }
  if (saved && [saved.x, saved.y, saved.z].every(Number.isFinite)) sky.setCamera(saved.x, saved.y, saved.z);
  else goHomeNow();
}

const goHomeNow = () => sky.setCamera(sky.defaultCenter(), 0, 1);

// Eases the camera toward a target (shortest way round the ring; zoom in log scale).
function flyTo(x, y, zoom) {
  if (reducedMotion()) {
    sky.setCamera(x, y, zoom);
    onPan();
    return;
  }
  state.tween = { x0: sky.centerX, y0: sky.centerY, z0: sky.zoom, x1: x, y1: y, z1: zoom, t0: performance.now() };
}

function stepTween(now) {
  const tw = state.tween;
  if (!tw) return;
  const k = Math.min(1, (now - tw.t0) / TWEEN_MS);
  const e = 1 - (1 - k) ** 3;
  sky.setCamera(
    tw.x0 + dxWrap(tw.x0, tw.x1) * e,
    tw.y0 + (tw.y1 - tw.y0) * e,
    Math.exp(Math.log(tw.z0) + (Math.log(tw.z1) - Math.log(tw.z0)) * e),
  );
  onPan();
  if (k >= 1) state.tween = null;
}

function goHome() {
  if (state.city) history.replaceState(history.state, "", cityUrl(state.city));
  sky.highlight = null;
  flyTo(sky.defaultCenter(), 0, 1);
}

function zoomBy(factor) {
  flyTo(sky.centerX, sky.centerY, Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, sky.zoom * factor)));
}

$("zoom-in").addEventListener("click", () => zoomBy(1.6));
$("zoom-out").addEventListener("click", () => zoomBy(1 / 1.6));
$("cam-home").addEventListener("click", goHome);
$("cam-latest").addEventListener("click", async () => {
  if (!state.city) return;
  try {
    const { message } = await api.latestMine(state.city.id);
    if (!message) return toast("You haven't released a message in this sky yet");
    sky.messages.set(message.id, message);
    sky.highlight = message.id;
    flyTo(message.x, message.y, Math.max(sky.zoom, 1));
    loadVisible();
  } catch {
    toast("Couldn't find your latest message. Please try again");
  }
});

// ---------- views ----------
const wipe = $("wipe");
async function withWipe(fn) {
  if (reducedMotion()) return fn();
  wipe.classList.add("on");
  await new Promise((r) => setTimeout(r, 420));
  await fn();
  requestAnimationFrame(() => wipe.classList.remove("on"));
}

function setView(view) {
  state.view = view;
  app.dataset.view = view;
  if (state.globe) state.globe.active = view === "globe";
  hidePopover();
}

let choosing = false;
async function chooseCity(city) {
  if (!city || choosing) return;
  choosing = true;
  try {
    if (state.globe && state.view === "globe" && !reducedMotion()) {
      $("search-results").hidden = true;
      // Resolves even if the flight is interrupted, so this never hangs.
      await state.globe.flyTo(city.lat, city.lon, 1.6, 1000);
    }
    await withWipe(() => enterSky(city));
    history.pushState({ city: city.id }, "", cityUrl(city));
  } finally {
    choosing = false;
  }
}

function enterSky(city, focusMessage = null) {
  const changed = state.city?.id !== city.id;
  if (changed) saveCamera();
  if (changed && composer.blocks.length) {
    releasePieces(composer.reset());
    setComposer(createComposer());
    toast("You changed cities, so your draft's letters went back", 3200);
  }
  state.city = city;
  setView("sky");
  layout();
  if (changed || !sky.city) {
    setComposer(createComposer());
    state.loaded.clear();
    state.total = 0;
    state.messagesError = null;
    state.weather = null;
    state.publishId = null;
    setCounts(Object.fromEntries(LETTERS.map((l) => [l, 0])));
    sky.setWeather(null, skyNow());
    sky.setCity(city, skyNow());
    if (!focusMessage) restoreCamera(city);
    connect(city);
    loadWeather(city);
    state.ready.then(() => {
      api.visit(city.id).catch(() => {});
      syncInventory(city);
    });
  }
  const p = placeLabel(city);
  setText("place-city", p.city);
  setText("place-region", [p.region, p.country].filter(Boolean).join(" · "));
  document.title = `${city.nameEn} · 구름한글`;
  if (focusMessage) focusOn(focusMessage);
  writing.render();
  loadVisible();
  updateHeader();
  updateCompose();
}

async function focusOn(messageId) {
  try {
    const { message } = await api.message(messageId);
    if (message.cityId !== state.city?.id) return;
    sky.messages.set(message.id, message);
    sky.highlight = message.id;
    sky.setCamera(message.x, message.y, Math.max(sky.zoom, 1));
    writing.position();
    loadVisible();
  } catch {
    showModal({
      title: "This message has faded",
      body: ["Messages drift away 24 hours after they are released, so this one is no longer in the sky."],
      actions: [{ label: "Close" }, { label: "Return home", primary: true, onClick: goHome }],
    });
  }
}

async function enterGlobe(push = true) {
  await withWipe(async () => {
    setView("globe");
    await ensureGlobe();
    if (state.city) {
      state.globe.focus(state.city.lat, state.city.lon);
      state.globe.view.dist = 2.4;
    }
  });
  document.title = "구름한글";
  if (push) history.pushState({}, "", new URL(document.baseURI).pathname);
}
$("btn-globe").addEventListener("click", () => enterGlobe());
$("btn-missing-globe").addEventListener("click", () => enterGlobe());

window.addEventListener("popstate", () => route(false));

function route(initial) {
  const params = new URLSearchParams(location.search);
  const id = params.get("city");
  const city = id ? cityById(id) : null;
  if (id && !city) {
    // A link to a city the catalog doesn't have: say so, offer the globe.
    $("missing-detail").textContent = `“${id.slice(0, 60)}” isn't one of the supported city skies. Pick a city on the globe instead.`;
    setView("missing");
    document.title = "Sky not found · 구름한글";
    ensureGlobe();
    return;
  }
  if (city) {
    enterSky(city, params.get("m"));
    if (initial) ensureGlobe();
  } else if (initial) {
    setView("globe");
    ensureGlobe();
  } else enterGlobe(false);
}

async function ensureGlobe() {
  if (state.globe) return;
  try {
    const { Globe } = await import("./globe.js");
    state.globe = new Globe({
      canvas: $("globe-canvas"),
      markerLayer: $("globe-markers"),
      pickLayer: $("cluster-pick"),
      cities: CITIES,
      reducedMotion: reducedMotion(),
      onSelect: chooseCity,
      onReady: (error) => {
        $("globe-loading").hidden = true;
        if (error) toast("The map outlines didn't load, but every city marker still works", 4000);
      },
    });
    state.globe.active = state.view === "globe";
    if (state.city) state.globe.focus(state.city.lat, state.city.lon);
  } catch (error) {
    $("globe-loading").textContent = "The 3D globe isn't available here. Use search or Browse countries to pick a city.";
    console.error(error);
  }
}

setupSearch({ input: $("search"), list: $("search-results"), onPick: chooseCity });
setupBrowse({ sheet: $("browse"), openBtn: $("btn-browse"), onPick: chooseCity });
setupGps({
  button: $("btn-gps"),
  onPick: chooseCity,
  onPreview: (city) => state.globe?.flyTo(city.lat, city.lon, 1.9, 900),
});

// ---------- frame loop ----------
let lastInk = 0;
let lastHeader = 0;
let lastFrame = 0;
let lastWords = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const rm = reducedMotion();
  sky.reducedMotion = rm;
  if (state.globe) state.globe.reducedMotion = rm;
  if (state.view === "globe") {
    if (state.globe && t - lastWords > 500) {
      lastWords = t;
      state.globe.setWords(liveWords());
    }
    state.globe?.frame(t);
    return;
  }
  if (state.view !== "sky") return;
  // Reduced motion: still keep the clock and sky current, at a calm rate.
  if (rm && t - lastFrame < 250 && !writing.drag) return;
  lastFrame = t;
  if (state.momentum && Math.abs(state.momentum.x) + Math.abs(state.momentum.y) > 0.3) {
    sky.panBy(state.momentum.x, state.momentum.y);
    state.momentum = { x: state.momentum.x * 0.92, y: state.momentum.y * 0.92 };
    onPan();
  }
  if (state.tween) stepTween(performance.now());
  const now = skyNow();
  // Follow the hourly forecast as the clock moves, without new requests.
  if (state.weather && !dev.weather && stepAt(state.weather.steps, now).at !== weatherStepAt) applyWeather();
  sky.ageOffset = dev.ageOffset;
  sky.frame(now, t);
  if (t - lastInk > 1500 && sky.state) {
    lastInk = t;
    writing.setInk(sky.state.ink);
  }
  if (t - lastHeader > 200) {
    lastHeader = t;
    updateHeader();
  }
}

// ---------- boot ----------
async function boot() {
  state.ready = api
    .session()
    .then((me) => (state.author = me.author))
    .catch(() => toast("Couldn't reach the server. Letters and messages may not load.", 4000));
  // Wait briefly for the rounded font so cached glyphs use it.
  try {
    await Promise.race([document.fonts.load(`40px ${FONT}`, "가ㄱㅏ"), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* fall back to system fonts */
  }
  document.fonts?.addEventListener?.("loadingdone", () => {
    clearGlyphCache();
    tray.paintGlyphs();
    writing.inkKey = "";
  });
  tray.paintGlyphs();
  layout();
  route(true);
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has("dev") || localStorage.getItem("cloudHangul.dev") === "1") {
    const { setupDev } = await import("./dev.js");
    setupDev({
      dev,
      onChange: () => sky.setWeather(currentCondition(), skyNow()),
      goto: (id) => chooseCity(cityById(id)),
      sky,
      supply: () => (state.city ? api.supply(state.city.id) : Promise.reject(new Error("no city"))),
    });
  }
}
boot();

// For scripted checks and screenshots.
window.cloudHangul = {
  state,
  sky,
  dev,
  tray,
  get composer() {
    return composer;
  },
  writing,
  liveWords,
  chooseCity: (id) => chooseCity(cityById(id)),
  refresh: applyWeather,
  wrapX,
};
