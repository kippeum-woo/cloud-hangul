import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

for (const usePages of [false, true]) test(`Cloudflare ${usePages ? "Pages gateway" : "Worker"}: shared inventory, atomic publication, realtime, restart, isolation and assets`, { timeout: 90000 }, async () => {
  const bundle = await build({ entryPoints: ["cloudflare/worker.js"], bundle: true, write: false, format: "esm", platform: "node", external: ["cloudflare:workers"], target: "es2022" });
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-hangul-cf-"));
  const backend = {
    name: "backend",
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-10-01", compatibilityFlags: ["nodejs_compat"],
    durableObjects: { SKY: { className: "SharedSky", useSQLite: true } },
    durableObjectsPersist: persist,
    assets: { directory: "dist", binding: "ASSETS", run_worker_first: ["/api/*", "/health"], routerConfig: { has_user_worker: true } },
  };
  const options = convertV4MiniflareOptions(usePages ? { workers: [
    { name: "pages", modules: true, script: fs.readFileSync("pages/gateway.js", "utf8"),
      compatibilityDate: "2026-10-01", serviceBindings: { GAME: "backend" },
      assets: backend.assets }, backend,
  ] } : backend);
  options.resourcePersistencePath = persist;
  options.isolatedResourcePersistencePath = persist;
  let mf = new Miniflare(options);
  const sockets = [];
  const dispatch = (p, init) => mf.dispatchFetch(`https://game.test${p}`, init);
  async function browser() {
    const response = await dispatch("/api/session", { method: "POST" });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    let n = 0;
    return async (p, method = "GET", body) => {
      const response = await dispatch(p, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body ? JSON.stringify({ requestId: `request-${++n}-${crypto.randomUUID()}`, ...body }) : undefined });
      return { status: response.status, ...(await response.json()) };
    };
  }
  try {
    const health = await dispatch("/health");
    assert.equal(health.status, 200, await health.text());
    const html = await (await dispatch("/")).text();
    assert.match(html, /cloud-hangul-transport/);
    assert.doesNotMatch(html, /\{\{BUILD\}\}/);
    const js = /src="\.([^\"]+main\.js)"/.exec(html)[1];
    assert.equal((await dispatch(js)).status, 200);
    assert.equal((await dispatch("/api/session", { method: "POST", headers: { Origin: "https://evil.test" } })).status, 403);
    assert.equal((await dispatch("/api/cities/not-a-city/inventory")).status, 404);
    const a = await browser();
    const b = await browser();
    const city = "/api/cities/kr-seoul";
    const original = await a(`${city}/inventory`);
    assert.equal(original.status, 200);
    assert.equal(original.available["ㄱ"], 10);
    const claims = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b)(`${city}/reservations`, "POST", { letter: "ㄱ" })));
    assert.equal(claims.filter(c => c.status === 201).length, 10);
    assert.equal(claims.filter(c => c.status === 409).length, 2);
    assert.equal((await b(`${city}/inventory`)).available["ㄱ"], 0);
    const other = await b("/api/cities/jp-tokyo/inventory");
    assert.equal(other.available["ㄱ"], 10);

    const stream = await dispatch(`${city}/events`, { headers: { Upgrade: "websocket" } });
    assert.equal(stream.status, 101);
    const ws = stream.webSocket;
    sockets.push(ws);
    const events = [];
    ws.addEventListener("message", e => events.push(JSON.parse(e.data)));
    ws.accept();
    const pieces = [];
    for (const letter of ["ㅎ", "ㅏ", "ㄴ"]) pieces.push((await a(`${city}/reservations`, "POST", { letter })).reservation.id);
    const payload = { requestId: "publish-stable-123", x: 2, y: 0, blocks: [{ pieces, dx: 0, dy: 0 }] };
    const pub = await a(`${city}/messages`, "POST", payload);
    assert.equal(pub.status, 201);
    assert.equal(pub.message.text, "한");
    const again = await a(`${city}/messages`, "POST", payload);
    assert.equal(again.status, 200);
    assert.equal(again.message.id, pub.message.id);
    assert.equal((await b(`/api/messages/${pub.message.id}`)).message.text, "한");
    assert.equal((await b(`${city}/messages/${pub.message.id}`, "DELETE")).status, 403);
    assert.equal((await a("/api/words")).cities["kr-seoul"].length, 1);
    assert.ok(events.some(e => e.type === "inventory"));
    await new Promise(r => setTimeout(r, 30));
    assert.ok(events.some(e => e.type === "message" && e.message.id === pub.message.id));
    const invalid = await a(`${city}/messages`, "POST", { ...payload, requestId: "invalid-publish-123", blocks: [{ pieces: ["foreign-reservation"], dx: 0, dy: 0 }] });
    assert.notEqual(invalid.status, 201);
    const held = await b(`${city}/reservations`, "POST", { letter: "ㅔ" });
    ws.close();
    await mf.dispose();
    mf = new Miniflare(options);
    assert.equal((await b(`${city}/inventory`)).available["ㄱ"], 0);
    assert.equal((await a(`/api/messages/${pub.message.id}`)).message.text, "한");
    assert.equal((await b(`${city}/inventory`)).available["ㅔ"], 9);
    assert.equal((await b(`${city}/reservations/release`, "POST", { ids: [held.reservation.id] })).released, 1);
    assert.equal((await b(`${city}/inventory`)).available["ㅔ"], 10);
    assert.equal((await a(`${city}/messages/${pub.message.id}`, "DELETE")).status, 200);
    assert.equal((await a(`/api/messages/${pub.message.id}`)).status, 404);
    assert.equal((await a("/api/words")).cities["kr-seoul"], undefined);
  } finally {
    for (const socket of sockets) try { socket.close(); } catch {}
    await mf.dispose();
    // Only remove the exact temporary directory created by this test.
    fs.rmSync(persist, { recursive: true, force: true });
  }
});
