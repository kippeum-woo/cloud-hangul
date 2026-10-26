// Shared letter supply, one per city, owned by the server.
//
// Every visitor to a city draws from the same stock. Pieces move between
// three states: available, reserved (held by one visitor's draft, with an
// expiry), and consumed (spent by a published message, never refunded).
//
// Refills happen once per city on a fixed schedule of server time. They are
// applied lazily: before any read or write, settle() replays every refill tick
// since the last one, so time when nobody is looking still counts. Each tick
// uses the activity tier *at that tick*, from visitors seen in the window
// before it. That is exact because settle() always runs before a new
// interaction is recorded, so no recorded interaction is newer than a tick
// being replayed.
//
// All operations are synchronous inside one Node event-loop turn, so reserve,
// release and consume are atomic with respect to each other.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { LETTERS } from "../src/hangul.js";

// Prototype rules. Tune here (or pass `config` to createSupply).
export const SUPPLY = {
  startDecks: 10, // each city starts with 10 of every letter (350 pieces)
  refillMs: 6 * 60 * 1000,
  activeWindowMs: 30 * 60 * 1000, // "active visitor" = interacted within this window
  reservationTtlMs: 10 * 60 * 1000, // abandoned drafts return their pieces after this
  requestMemoryMs: 15 * 60 * 1000, // how long retried request ids are remembered
  // minVisitors ascending. capacity is a per-letter cap, in decks.
  tiers: [
    { minVisitors: 0, decks: 1, capacity: 10 },
    { minVisitors: 11, decks: 2, capacity: 20 },
    { minVisitors: 31, decks: 3, capacity: 30 },
    { minVisitors: 61, decks: 4, capacity: 40 },
  ],
};

export function tierFor(active, config = SUPPLY) {
  let tier = config.tiers[0];
  for (const t of config.tiers) if (active >= t.minVisitors) tier = t;
  return tier;
}

export function createSupply({ dataDir, now = () => Date.now(), config = SUPPLY, onChange = () => {} }) {
  const file = dataDir ? path.join(dataDir, "supply.json") : null;
  const cities = new Map();
  let saveTimer = null;

  if (file && fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const [id, c] of Object.entries(saved.cities || {})) cities.set(id, c);
    } catch (error) {
      process.stderr.write(`cloud-hangul: ignoring unreadable ${file}: ${error.message}\n`);
    }
  }

  function writeNow() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ cities: Object.fromEntries(cities) }));
    fs.renameSync(tmp, file);
  }
  function save() {
    if (!file || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeNow();
    }, 150);
    saveTimer.unref?.();
  }

  // Created once, on first access, with the starting stock.
  function city(id) {
    let c = cities.get(id);
    if (!c) {
      const available = {};
      for (const l of LETTERS) available[l] = config.startDecks;
      c = { available, reservations: [], anchor: now(), visitors: {}, done: {} };
      cities.set(id, c);
      save();
    }
    return c;
  }

  const reservedOf = (c, letter) => c.reservations.reduce((n, r) => n + (r.letter === letter ? 1 : 0), 0);
  const activeAt = (c, t) => Object.values(c.visitors).filter((seen) => seen <= t && seen > t - config.activeWindowMs).length;

  function expire(c, t) {
    const keep = [];
    let changed = false;
    for (const r of c.reservations) {
      if (r.expiresAt <= t) {
        c.available[r.letter] += 1;
        c.done[`${r.visitor}:${r.requestId}`] = t + config.requestMemoryMs;
        changed = true;
      } else keep.push(r);
    }
    c.reservations = keep;
    return changed;
  }

  // Replays refill ticks and reservation expiries up to now.
  function settle(id) {
    const c = city(id);
    const t = now();
    let changed = false;
    let tick = c.anchor + config.refillMs;
    while (tick <= t) {
      changed = expire(c, tick) || changed;
      const tier = tierFor(activeAt(c, tick), config);
      let full = true;
      for (const l of LETTERS) {
        const total = c.available[l] + reservedOf(c, l);
        // Above a lowered cap: keep what exists, add nothing.
        if (total < tier.capacity) {
          c.available[l] += Math.min(tier.decks, tier.capacity - total);
          changed = true;
        }
        if (c.available[l] + reservedOf(c, l) < tier.capacity) full = false;
      }
      c.anchor = tick;
      tick += config.refillMs;
      // Quiet and full: later ticks cannot change anything, skip ahead.
      if (full && !c.reservations.length && activeAt(c, tick) === 0 && tierFor(0, config) === tier) {
        c.anchor += Math.floor((t - c.anchor) / config.refillMs) * config.refillMs;
        break;
      }
    }
    changed = expire(c, t) || changed;
    for (const [v, seen] of Object.entries(c.visitors)) if (seen <= t - config.activeWindowMs) delete c.visitors[v];
    for (const [k, until] of Object.entries(c.done)) if (until <= t) delete c.done[k];
    if (changed) {
      save();
      onChange(id, { ...c.available });
    }
    return c;
  }

  // Records an interaction (deduplicated per visitor). Settles first.
  function touch(id, visitor) {
    const c = settle(id);
    if (visitor) {
      c.visitors[visitor] = now();
      save();
    }
    return c;
  }

  const view = (r) => ({ id: r.id, letter: r.letter, expiresAt: r.expiresAt });

  return {
    config,

    // What every client sees: available counts only.
    snapshot(id) {
      const c = settle(id);
      return { ...c.available };
    },

    touch(id, visitor) {
      touch(id, visitor);
    },

    // Claims one piece. Retrying the same requestId returns the same piece.
    reserve(id, visitor, letter, requestId) {
      if (!LETTERS.includes(letter)) return { error: "invalid_letter", status: 400 };
      if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(requestId)) return { error: "invalid_request", status: 400 };
      const c = touch(id, visitor);
      const same = c.reservations.find((r) => r.visitor === visitor && r.requestId === requestId);
      if (same) return { reservation: view(same) };
      if (c.done[`${visitor}:${requestId}`]) return { error: "request_finished", status: 409 };
      if (!(c.available[letter] > 0)) return { error: "unavailable", status: 409 };
      c.available[letter] -= 1;
      const r = { id: crypto.randomBytes(9).toString("base64url"), letter, visitor, requestId, expiresAt: now() + config.reservationTtlMs };
      c.reservations.push(r);
      save();
      onChange(id, { ...c.available });
      return { reservation: view(r) };
    },

    // Returns pieces to the shared stock. Unknown or foreign ids are ignored,
    // so a retry is harmless.
    release(id, visitor, ids) {
      const c = touch(id, visitor);
      const set = new Set(ids);
      let n = 0;
      c.reservations = c.reservations.filter((r) => {
        if (r.visitor !== visitor || !set.has(r.id)) return true;
        c.available[r.letter] += 1;
        c.done[`${visitor}:${r.requestId}`] = now() + config.requestMemoryMs;
        n++;
        return false;
      });
      if (n) {
        save();
        onChange(id, { ...c.available });
      }
      return { released: n };
    },

    // Extends this visitor's live reservations; reports ids that are gone.
    renew(id, visitor, ids) {
      const c = touch(id, visitor);
      const until = now() + config.reservationTtlMs;
      const live = new Set();
      for (const r of c.reservations) {
        if (r.visitor === visitor && ids.includes(r.id)) {
          r.expiresAt = until;
          live.add(r.id);
        }
      }
      save();
      return { renewed: [...live], missing: ids.filter((x) => !live.has(x)), expiresAt: until };
    },

    mine(id, visitor) {
      const c = settle(id);
      return c.reservations.filter((r) => r.visitor === visitor).map(view);
    },

    // Letters behind live reservations of this visitor, or { missing }.
    check(id, visitor, ids) {
      const c = settle(id);
      const letters = {};
      const missing = [];
      for (const rid of ids) {
        const r = c.reservations.find((x) => x.id === rid && x.visitor === visitor);
        if (r) letters[rid] = r.letter;
        else missing.push(rid);
      }
      return missing.length ? { missing } : { letters };
    },

    // Spends reservations for a published message. Not refundable.
    consume(id, visitor, ids) {
      const c = settle(id);
      const set = new Set(ids);
      c.reservations = c.reservations.filter((r) => !(r.visitor === visitor && set.has(r.id)));
      save();
      onChange(id, { ...c.available });
    },

    // Developer readout: never shown to players.
    debug(id) {
      const c = settle(id);
      const active = activeAt(c, now());
      const tier = tierFor(active, config);
      return { active, tier, reserved: c.reservations.length, nextRefillAt: c.anchor + config.refillMs };
    },

    flush() {
      if (!saveTimer) return;
      clearTimeout(saveTimer);
      saveTimer = null;
      writeNow();
    },
  };
}
