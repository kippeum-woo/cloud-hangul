import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withBase } from "./mount.js";
import { cityById } from "../src/cities.js";
import { compose, glyph } from "../src/hangul.js";
import { openMeteoUrl, parseOpenMeteo, simulatedSteps } from "../src/weather.js";
import { identify } from "./identity.js";
import { createStore, publicMessage } from "./store.js";
import { createSupply, SUPPLY } from "./supply.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// Static trees served under /v/<build>/... The build id changes with the
// client code, so cached scripts from an older visit are never reused.
const mounts = {
  client: path.join(root, "client"),
  src: path.join(root, "src"),
  three: path.join(root, "node_modules/three"),
};

const WEATHER_TTL_MS = 15 * 60 * 1000;
const MAX_PIECES_PER_BLOCK = 6;

export function buildId() {
  const hash = crypto.createHash("sha1");
  for (const dir of [mounts.client, mounts.src]) {
    for (const file of fs.readdirSync(dir).sort()) hash.update(file).update(fs.readFileSync(path.join(dir, file)));
  }
  return hash.digest("hex").slice(0, 10);
}

// dataDir: where messages.json and supply.json live. fetchWeather, now and
// supplyConfig are injectable for tests; weather defaults to Open-Meteo.
export function createApp({ dataDir = path.join(root, "data"), fetchWeather = fetchOpenMeteo, now = () => Date.now(), supplyConfig = SUPPLY } = {}) {
  const build = buildId();
  const index = fs.readFileSync(path.join(mounts.client, "index.html"), "utf8").replaceAll("{{BUILD}}", `./v/${build}`);
  const store = createStore({ dataDir, now });
  const supply = createSupply({
    dataDir,
    now,
    config: supplyConfig,
    onChange: (cityId, available) => store.emit(cityId, { type: "inventory", available }),
  });
  const weatherCache = new Map(); // cityId -> { at, body } or { pending }
  const streams = new Set();

  async function weatherFor(city) {
    const cached = weatherCache.get(city.id);
    if (cached?.body && now() - cached.at < WEATHER_TTL_MS) return cached.body;
    if (cached?.pending) return cached.pending;
    const pending = (async () => {
      try {
        const steps = await fetchWeather(city);
        const body = { source: "open-meteo", steps };
        weatherCache.set(city.id, { at: now(), body });
        return body;
      } catch (error) {
        // Not cached: the next visit tries the real API again.
        weatherCache.delete(city.id);
        return { source: "simulated", reason: String(error.message || error), steps: simulatedSteps(city.id, now()) };
      }
    })();
    weatherCache.set(city.id, { ...cached, pending });
    return pending;
  }

  // Publishing: blocks name reservation ids; the server composes each block
  // from the reserved letters itself instead of trusting the client's text.
  function buildBlocks(cityId, visitor, input) {
    if (!input || !Array.isArray(input.blocks)) return { error: "empty_message", status: 400 };
    const ids = [];
    for (const b of input.blocks) {
      if (!b || !Array.isArray(b.pieces) || !b.pieces.length || b.pieces.length > MAX_PIECES_PER_BLOCK) return { error: "invalid_block", status: 400 };
      ids.push(...b.pieces);
    }
    if (new Set(ids).size !== ids.length) return { error: "invalid_block", status: 400 };
    const checked = supply.check(cityId, visitor, ids);
    if (checked.missing) return { error: "reservation_missing", status: 409, missing: checked.missing };
    const blocks = [];
    for (const b of input.blocks) {
      const state = compose(b.pieces.map((rid) => checked.letters[rid]));
      if (!state) return { error: "invalid_block", status: 400 };
      blocks.push({ t: glyph(state), dx: b.dx, dy: b.dy });
    }
    return { blocks, ids };
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const p = url.pathname;
    try {
      if (req.method === "GET" && (p === "/" || p === "/index.html")) {
        res.writeHead(200, { "Content-Type": types[".html"], "Cache-Control": "no-cache" });
        return res.end(withBase(index, req));
      }
      if (p === "/health") return sendJson(res, 200, { ok: true, game: "cloud-hangul", build });

      let m;
      if (p === "/api/session" && req.method === "POST") {
        const who = identify(req, res, { create: true });
        return sendJson(res, 200, { now: now(), author: who.id });
      }
      if (p === "/api/me" && req.method === "GET") return sendJson(res, 200, { now: now(), author: identify(req, res)?.id || null });
      if (p === "/api/weather" && req.method === "GET") {
        const city = cityById(url.searchParams.get("city") || "");
        if (!city) return sendJson(res, 404, { error: "unknown_city" });
        return sendJson(res, 200, { now: now(), cityId: city.id, ...(await weatherFor(city)) });
      }
      if (p === "/api/words" && req.method === "GET") return sendJson(res, 200, { now: now(), cities: store.words() });
      if (p === "/api/events" && req.method === "GET") {
        return openStream(req, res, (send) => store.subscribeAll(send));
      }
      if (req.method === "GET" && (m = /^\/api\/messages\/([A-Za-z0-9_-]+)$/.exec(p))) {
        const message = store.get(m[1]);
        if (!message) return sendJson(res, 404, { error: "not_found", now: now() });
        return sendJson(res, 200, { now: now(), message: publicMessage(message) });
      }

      if ((m = /^\/api\/cities\/([a-z0-9-]+)\/([a-z]+)(?:\/([A-Za-z0-9_-]+))?$/.exec(p))) {
        const city = cityById(m[1]);
        if (!city) return sendJson(res, 404, { error: "unknown_city" });
        const [, , kind, sub] = m;

        if (kind === "events" && req.method === "GET" && !sub) {
          return openStream(req, res, (send) => store.subscribe(city.id, send), { inventory: supply.snapshot(city.id) });
        }
        if (kind === "messages" && req.method === "GET" && !sub) {
          if (url.searchParams.get("mine") === "latest") {
            const who = identify(req, res);
            const message = who ? store.latest(city.id, who.id) : null;
            return sendJson(res, 200, { now: now(), message: message ? publicMessage(message) : null });
          }
          const r = ["x0", "x1", "y0", "y1"].map((k) => Number(url.searchParams.get(k)));
          const range = url.searchParams.has("x0") && r.every(Number.isFinite) ? { x0: r[0], x1: r[1], y0: r[2], y1: r[3] } : null;
          return sendJson(res, 200, {
            now: now(),
            cityId: city.id,
            total: store.list(city.id).length,
            messages: store.list(city.id, range).map(publicMessage),
          });
        }
        if (kind === "inventory" && req.method === "GET" && !sub) {
          const who = identify(req, res);
          return sendJson(res, 200, { now: now(), available: supply.snapshot(city.id), mine: who ? supply.mine(city.id, who.id) : [] });
        }
        if (kind === "supply" && req.method === "GET" && !sub) return sendJson(res, 200, { now: now(), ...supply.debug(city.id) });

        // Everything below changes shared state and needs an identity.
        if (req.method !== "POST" && req.method !== "DELETE") return sendJson(res, 405, { error: "method_not_allowed" });
        const who = identify(req, res, { create: true });
        const body = req.method === "POST" ? await readJson(req) : null;

        if (kind === "visit" && !sub) {
          supply.touch(city.id, who.id);
          return sendJson(res, 200, { now: now(), available: supply.snapshot(city.id) });
        }
        if (kind === "reservations") {
          if (!sub) {
            const r = supply.reserve(city.id, who.id, body?.letter, body?.requestId);
            if (r.error) return sendJson(res, r.status, { error: r.error, available: supply.snapshot(city.id) });
            return sendJson(res, 201, { now: now(), reservation: r.reservation, available: supply.snapshot(city.id) });
          }
          const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === "string").slice(0, 400) : [];
          if (sub === "release") return sendJson(res, 200, { now: now(), ...supply.release(city.id, who.id, ids), available: supply.snapshot(city.id) });
          if (sub === "renew") return sendJson(res, 200, { now: now(), ...supply.renew(city.id, who.id, ids) });
          return sendJson(res, 404, { error: "not_found" });
        }
        if (kind === "messages" && req.method === "POST" && !sub) {
          const requestId = typeof body?.requestId === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(body.requestId) ? body.requestId : null;
          let spend = null;
          supply.touch(city.id, who.id);
          const result = store.publish(city.id, who.id, body, {
            requestId,
            buildBlocks: (input) => {
              const built = buildBlocks(city.id, who.id, input);
              if (!built.error) spend = built.ids;
              return built;
            },
            beforeCommit: () => {
              supply.consume(city.id, who.id, spend);
            },
          });
          if (result.error) return sendJson(res, result.status, { error: result.error, missing: result.missing });
          return sendJson(res, result.repeated ? 200 : 201, { now: now(), message: publicMessage(result.message) });
        }
        if (kind === "messages" && req.method === "DELETE" && sub) {
          supply.touch(city.id, who.id);
          const result = store.remove(city.id, sub, who.id);
          if (result.error) return sendJson(res, result.status, { error: result.error });
          return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 404, { error: "not_found" });
      }

      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method_not_allowed" });
      const sm = /^\/v\/[^/]+\/([a-z]+)\/(.+)$/.exec(p);
      const base = sm && mounts[sm[1]];
      const file = base && safeJoin(base, decodeURIComponent(sm[2]));
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return sendJson(res, 404, { error: "not_found" });
      res.writeHead(200, {
        "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : "server_error" });
      else res.end();
    }
  });

  // Server-sent events: changes are pushed the moment they happen. The
  // browser's EventSource reconnects by itself, and the client reloads what it
  // shows on every (re)connect.
  function openStream(req, res, subscribe, hello = {}) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ now: now(), ...hello })}\n\n`);
    const off = subscribe((event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
    streams.add(res);
    req.on("close", () => {
      off();
      streams.delete(res);
    });
  }

  server.on("close", () => {
    store.flush();
    supply.flush();
    for (const res of streams) res.end();
  });
  server.store = store;
  server.supply = supply;
  return server;
}

async function fetchOpenMeteo(city) {
  const response = await fetch(openMeteoUrl(city.lat, city.lon), { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`open-meteo ${response.status}`);
  return parseOpenMeteo(await response.json());
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 32 * 1024) {
        reject(Object.assign(new Error("too_large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        reject(Object.assign(new Error("invalid_json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function safeJoin(base, rel) {
  const full = path.resolve(base, rel);
  return full.startsWith(base + path.sep) ? full : null;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": types[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT || 3000);
  const dataDir = process.env.DATA_DIR || path.join(root, "data");
  createApp({ dataDir }).listen(port, host, () => console.log(`listening on ${host}:${port}`));
}
