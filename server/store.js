// Shared city skies. Messages are kept per stable city id, persisted as JSON
// under the data directory, and pushed to open event streams as they change.
// Expiry is computed from UTC publish instants on every read and write, so no
// timer is needed to remove a message at exactly 24 hours.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inRect, isLive, LAYOUT, LIFETIME_MS, normalizeDraft, place, recenter, textOf, wordCount } from "../src/messages.js";

export const MAX_LIVE_PER_CITY = 3000;
export const PUBLISH_GAP_MS = 3000;

// author is the public visitor id (see identity.js), never the secret token.
export function createStore({ dataDir, now = () => Date.now() }) {
  const file = dataDir ? path.join(dataDir, "messages.json") : null;
  const cities = new Map(); // cityId -> message[]
  const lastPublish = new Map(); // author -> ms
  const listeners = new Map(); // cityId -> Set<fn>
  const globalListeners = new Set();
  let saveTimer = null;

  if (file && fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const m of saved.messages || []) {
        // Messages from before text was stored get it derived once.
        if (typeof m.text !== "string") m.text = textOf(m);
        m.words = wordCount(m.text);
        if (m.layout !== LAYOUT) {
          m.y = Math.round((m.y - 0.5) * 1e4) / 1e4;
          m.layout = LAYOUT;
        }
        if (!cities.has(m.cityId)) cities.set(m.cityId, []);
        cities.get(m.cityId).push(m);
      }
    } catch (error) {
      process.stderr.write(`cloud-hangul: ignoring unreadable ${file}: ${error.message}\n`);
    }
  }

  function live(cityId) {
    const t = now();
    const list = (cities.get(cityId) || []).filter((m) => isLive(m, t));
    if (list.length) cities.set(cityId, list);
    else cities.delete(cityId);
    return list;
  }

  function writeNow() {
    const t = now();
    const messages = [];
    for (const list of cities.values()) for (const m of list) if (isLive(m, t)) messages.push(m);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ messages }));
    fs.renameSync(tmp, file);
  }

  // Coalesces bursts of writes into one atomic file replace.
  function save() {
    if (!file || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeNow();
    }, 150);
    saveTimer.unref?.();
  }

  function emit(cityId, event) {
    for (const fn of listeners.get(cityId) || []) fn(event);
  }
  const wordEntry = (m) => [m.id, m.createdAt + LIFETIME_MS, m.words];
  const emitGlobal = (event) => {
    for (const fn of globalListeners) fn(event);
  };

  return {
    // Live messages whose box touches the range { x0, x1, y0, y1 } (x wraps); all if no range.
    list(cityId, range) {
      const all = live(cityId);
      if (!range) return all;
      return all.filter((m) => inRect(m, range));
    },

    latest(cityId, author) {
      let best = null;
      for (const m of live(cityId)) if (m.author === author && (!best || m.createdAt > best.createdAt)) best = m;
      return best;
    },

    get(id) {
      for (const cityId of [...cities.keys()]) {
        const m = live(cityId).find((x) => x.id === id);
        if (m) return m;
      }
      return null;
    },

    // Word entries per city: [id, expiresAt, words]. Clients sum the entries
    // whose expiry is still ahead, so counts drop at exactly 24 hours.
    words() {
      const out = {};
      for (const cityId of [...cities.keys()]) {
        const list = live(cityId).filter((m) => m.words > 0);
        if (list.length) out[cityId] = list.map(wordEntry);
      }
      return out;
    },

    // Validates and places a message, then runs beforeCommit (which spends the
    // letters) and stores it, all in one synchronous step. The same
    // requestId from the same author returns the first result again.
    publish(cityId, author, input, { requestId, buildBlocks, beforeCommit } = {}) {
      const t = now();
      const others = live(cityId);
      if (requestId) {
        const prior = others.find((m) => m.author === author && m.requestId === requestId);
        if (prior) return { message: prior, repeated: true };
      }
      if (t - (lastPublish.get(author) || 0) < PUBLISH_GAP_MS) return { error: "too_fast", status: 429 };
      let raw = input;
      if (buildBlocks) {
        const built = buildBlocks(input);
        if (built.error) return built;
        raw = { ...input, blocks: built.blocks };
      }
      const parsed = normalizeDraft(raw);
      if (parsed.error) return { error: parsed.error, status: 400 };
      if (others.length >= MAX_LIVE_PER_CITY) return { error: "sky_full", status: 503 };
      const { blocks } = recenter(parsed.value.blocks);
      const spot = place({ x: parsed.value.x, y: parsed.value.y, blocks }, others);
      const message = {
        id: crypto.randomBytes(9).toString("base64url"),
        cityId,
        author,
        createdAt: t,
        layout: LAYOUT,
        x: Math.round(spot.x * 1e4) / 1e4,
        y: Math.round(spot.y * 1e4) / 1e4,
        blocks,
      };
      message.text = textOf(message);
      message.words = wordCount(message.text);
      if (requestId) message.requestId = requestId;
      const veto = beforeCommit?.(message);
      if (veto?.error) return veto;
      cities.set(cityId, [...others, message]);
      lastPublish.set(author, t);
      save();
      emit(cityId, { type: "message", message: publicMessage(message) });
      emitGlobal({ type: "words", op: "add", cityId, entry: wordEntry(message) });
      return { message };
    },

    remove(cityId, id, author) {
      const list = live(cityId);
      const m = list.find((x) => x.id === id);
      if (!m) return { error: "not_found", status: 404 };
      if (m.author !== author) return { error: "not_owner", status: 403 };
      cities.set(cityId, list.filter((x) => x.id !== id));
      save();
      emit(cityId, { type: "delete", id });
      emitGlobal({ type: "words", op: "remove", cityId, id });
      return { ok: true };
    },

    subscribe(cityId, fn) {
      if (!listeners.has(cityId)) listeners.set(cityId, new Set());
      listeners.get(cityId).add(fn);
      return () => {
        const set = listeners.get(cityId);
        set?.delete(fn);
        if (set && !set.size) listeners.delete(cityId);
      };
    },

    subscribeAll(fn) {
      globalListeners.add(fn);
      return () => globalListeners.delete(fn);
    },

    emit,

    flush() {
      if (!saveTimer) return;
      clearTimeout(saveTimer);
      saveTimer = null;
      writeNow();
    },
  };
}

// What clients receive: no request ids.
export function publicMessage(m) {
  const { requestId, ...rest } = m;
  return rest;
}
