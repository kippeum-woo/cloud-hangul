import { DurableObject } from "cloudflare:workers";
import { createHash, randomBytes } from "node:crypto";
import { createStore, publicMessage } from "../server/core/store.js";
import { createSupply } from "../server/core/supply.js";
import { cityById } from "../src/cities.js";
import { compose, glyph } from "../src/hangul.js";
import { LIFETIME_MS } from "../src/messages.js";
import { openMeteoUrl, parseOpenMeteo, simulatedSteps } from "../src/weather.js";

const json = (data, status = 200, headers = {}) => Response.json({ now: Date.now(), ...data }, {
  status, headers: { "Cache-Control": "no-store", ...headers },
});

function identity(request, create = false) {
  let token = /(?:^|;\s*)ch_vid=([A-Za-z0-9_-]{16,64})(?:;|$)/.exec(request.headers.get("Cookie") || "")?.[1];
  let cookie;
  if (!token && create) {
    token = randomBytes(24).toString("base64url");
    cookie = `ch_vid=${token}; Path=/; Max-Age=34560000; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  }
  return { author: token ? createHash("sha256").update(`cloud-hangul:${token}`).digest("hex").slice(0, 20) : null, cookie };
}

async function bodyOf(request) {
  if (request.method !== "POST") return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32768) { await reader.cancel(); throw Object.assign(new Error("too_large"), { status: 413 }); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes) || "null"); }
  catch { throw Object.assign(new Error("invalid_json"), { status: 400 }); }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, game: "cloud-hangul", platform: "cloudflare" });
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const mutating = !["GET", "HEAD"].includes(request.method);
    const origin = request.headers.get("Origin");
    if ((mutating || request.headers.get("Upgrade")) && origin && origin !== url.origin) return json({ error: "forbidden_origin" }, 403);
    if (url.pathname === "/api/session" && request.method === "POST") {
      const who = identity(request, true);
      return json({ author: who.author }, 200, who.cookie ? { "Set-Cookie": who.cookie } : {});
    }
    if (url.pathname === "/api/me" && request.method === "GET") return json({ author: identity(request).author });
    if (url.pathname === "/api/weather" && request.method === "GET") {
      const city = cityById(url.searchParams.get("city"));
      if (!city) return json({ error: "unknown_city" }, 404);
      const key = new Request(`${url.origin}/__weather-cache/${city.id}`);
      const cached = await caches.default.match(key);
      if (cached) return json(await cached.json());
      try {
        const response = await fetch(openMeteoUrl(city.lat, city.lon), { signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error("weather_unavailable");
        const data = { cityId: city.id, source: "open-meteo", steps: parseOpenMeteo(await response.json()) };
        ctx.waitUntil(caches.default.put(key, Response.json(data, { headers: { "Cache-Control": "public, max-age=900" } })));
        return json(data);
      } catch { return json({ cityId: city.id, source: "simulated", steps: simulatedSteps(city.id, Date.now()) }); }
    }
    return env.SKY.get(env.SKY.idFromName("shared-world-v1")).fetch(request);
  },
};

// A single prototype coordinator keeps message counts and city mutations atomic.
// Each city's inventory and messages remain separate SQL records. No timers or
// persistent in-memory state are required; WebSockets can hibernate safely.
export class SharedSky extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS cities (id TEXT PRIMARY KEY, state TEXT NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, city TEXT NOT NULL, expires INTEGER NOT NULL, words INTEGER NOT NULL, data TEXT NOT NULL)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS message_city_expiry ON messages(city, expires)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS message_expiry ON messages(expires)");
  }

  broadcast(tag, event) {
    for (const ws of this.ctx.getWebSockets(tag)) {
      try { ws.send(JSON.stringify(event)); } catch { try { ws.close(1011, "Reconnect"); } catch {} }
    }
  }

  socket(tag, hello) {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [tag]);
    pair[1].send(JSON.stringify({ type: "hello", now: Date.now(), ...hello }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(ws) { ws.close(1008, "Read-only stream"); }
  webSocketClose(ws, code) { ws.close(code === 1005 ? 1000 : code); }
  webSocketError(ws) { try { ws.close(1011, "Reconnect"); } catch {} }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const p = url.pathname;
      const t = Date.now();
      if (p === "/api/events" && request.method === "GET") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);
        return this.socket("global", {});
      }
      if (p === "/api/words" && request.method === "GET") {
        const cities = {};
        for (const row of this.sql.exec("SELECT id, city, expires, words FROM messages WHERE expires > ? AND words > 0", t)) {
          (cities[row.city] ||= []).push([row.id, row.expires, row.words]);
        }
        return json({ cities });
      }
      const messagePath = /^\/api\/messages\/([A-Za-z0-9_-]+)$/.exec(p);
      if (messagePath && request.method === "GET") {
        const row = this.sql.exec("SELECT data FROM messages WHERE id = ? AND expires > ?", messagePath[1], t).toArray()[0];
        return row ? json({ message: publicMessage(JSON.parse(row.data)) }) : json({ error: "not_found" }, 404);
      }
      const m = /^\/api\/cities\/([a-z0-9-]+)\/([a-z]+)(?:\/([A-Za-z0-9_-]+))?$/.exec(p);
      if (!m) return json({ error: "not_found" }, 404);
      const [, cityId, kind, sub] = m;
      if (!cityById(cityId)) return json({ error: "unknown_city" }, 404);
      if (kind === "events" && request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);
      const body = await bodyOf(request);
      const who = identity(request, ["POST", "DELETE"].includes(request.method));
      const queued = [];
      // No awaits inside this transaction: claim, spend and message insertion
      // commit together. Any storage failure rolls all changes back.
      const result = this.ctx.storage.transactionSync(() => {
        const row = this.sql.exec("SELECT state FROM cities WHERE id = ?", cityId).toArray()[0];
        const initial = row ? JSON.parse(row.state) : {};
        const supply = createSupply({ initial: initial.supply, now: () => t,
          onChange: (_, available) => queued.push([cityId, { type: "inventory", available }]),
        });
        const records = kind === "messages" ? this.sql.exec("SELECT data FROM messages WHERE city = ? AND expires > ?", cityId, t).toArray().map(r => JSON.parse(r.data)) : [];
        const store = createStore({ initial: { messages: records, lastPublish: initial.lastPublish }, now: () => t });
        store.subscribe(cityId, event => queued.push([cityId, event]));
        store.subscribeAll(event => queued.push(["global", event]));
        const response = this.route({ request, url, cityId, kind, sub, body, who, supply, store });
        const next = JSON.stringify({ supply: supply.exportState(), lastPublish: store.exportState().lastPublish });
        if (next !== row?.state) this.sql.exec("INSERT INTO cities(id, state) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state", cityId, next);
        for (const [tag, event] of queued) {
          if (tag === "global" && event.type === "words") {
            if (event.op === "add") {
              const message = store.get(event.entry[0]);
              this.sql.exec("INSERT INTO messages(id, city, expires, words, data) VALUES (?, ?, ?, ?, ?)", message.id, cityId, message.createdAt + LIFETIME_MS, message.words, JSON.stringify(message));
            } else this.sql.exec("DELETE FROM messages WHERE id = ?", event.id);
          }
        }
        return response;
      });
      for (const [tag, event] of queued) this.broadcast(tag, event);
      this.ctx.waitUntil(this.ctx.storage.getAlarm().then(alarm => alarm || this.ctx.storage.setAlarm(Date.now() + LIFETIME_MS)));
      if (result.socket) return this.socket(cityId, result.socket);
      return json(result.body, result.status, who.cookie ? { "Set-Cookie": who.cookie } : {});
    } catch (error) {
      console.error(error);
      return json({ error: error.status ? error.message : "server_error" }, error.status || 500);
    }
  }

  async alarm() {
    this.sql.exec("DELETE FROM messages WHERE expires <= ?", Date.now());
    if (this.sql.exec("SELECT id FROM messages LIMIT 1").toArray().length) await this.ctx.storage.setAlarm(Date.now() + LIFETIME_MS);
  }

  route({ request, url, cityId, kind, sub, body, who, supply, store }) {
    const ok = (body, status = 200) => ({ body, status });
    const fail = (error, status) => ok({ error }, status);
    if (request.method === "GET" && !sub) {
      if (kind === "events") return { socket: { inventory: supply.snapshot(cityId) } };
      if (kind === "inventory") return ok({ available: supply.snapshot(cityId), mine: who.author ? supply.mine(cityId, who.author) : [] });
      if (kind === "supply") return ok(supply.debug(cityId));
      if (kind === "messages") {
        if (url.searchParams.get("mine") === "latest") {
          const message = who.author ? store.latest(cityId, who.author) : null;
          return ok({ message: message ? publicMessage(message) : null });
        }
        const values = ["x0", "x1", "y0", "y1"].map(k => Number(url.searchParams.get(k)));
        const range = url.searchParams.has("x0") && values.every(Number.isFinite) ? Object.fromEntries(["x0", "x1", "y0", "y1"].map((k,i) => [k, values[i]])) : null;
        return ok({ cityId, total: store.list(cityId).length, messages: store.list(cityId, range).map(publicMessage) });
      }
    }
    if (kind === "visit" && !sub && request.method === "POST") {
      supply.touch(cityId, who.author);
      return ok({ available: supply.snapshot(cityId) });
    }
    if (kind === "reservations" && request.method === "POST") {
      if (!sub) {
        const r = supply.reserve(cityId, who.author, body?.letter, body?.requestId);
        return ok({ ...r, available: supply.snapshot(cityId) }, r.status || 201);
      }
      const ids = Array.isArray(body?.ids) ? body.ids.filter(x => typeof x === "string").slice(0, 400) : [];
      if (sub === "release") return ok({ ...supply.release(cityId, who.author, ids), available: supply.snapshot(cityId) });
      if (sub === "renew") return ok(supply.renew(cityId, who.author, ids));
    }
    if (kind === "messages" && !sub && request.method === "POST") {
      let spend;
      supply.touch(cityId, who.author);
      const requestId = typeof body?.requestId === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(body.requestId) ? body.requestId : null;
      if (!requestId) return fail("invalid_request", 400);
      const r = store.publish(cityId, who.author, body, { requestId,
        buildBlocks(input) {
          if (!Array.isArray(input?.blocks) || !input.blocks.length || input.blocks.length > 40) return { error: "invalid_block", status: 400 };
          const ids = [];
          for (const b of input.blocks) {
            if (!Array.isArray(b?.pieces) || !b.pieces.length || b.pieces.length > 6) return { error: "invalid_block", status: 400 };
            ids.push(...b.pieces);
          }
          if (new Set(ids).size !== ids.length) return { error: "invalid_block", status: 400 };
          const checked = supply.check(cityId, who.author, ids);
          if (checked.missing) return { error: "reservation_missing", status: 409, missing: checked.missing };
          const blocks = [];
          for (const b of input.blocks) {
            const state = compose(b.pieces.map(id => checked.letters[id]));
            if (!state) return { error: "invalid_block", status: 400 };
            blocks.push({ t: glyph(state), dx: b.dx, dy: b.dy });
          }
          spend = ids;
          return { blocks };
        },
        beforeCommit: () => supply.consume(cityId, who.author, spend),
      });
      return r.error ? ok(r, r.status) : ok({ message: publicMessage(r.message) }, r.repeated ? 200 : 201);
    }
    if (kind === "messages" && sub && request.method === "DELETE") {
      supply.touch(cityId, who.author);
      const r = store.remove(cityId, sub, who.author);
      return ok(r, r.status || 200);
    }
    return fail("method_not_allowed", 405);
  }
}
