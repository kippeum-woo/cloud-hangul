import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../server/start.js";
import { LIFETIME_MS } from "../src/messages.js";

async function start(options = {}) {
  const dataDir = options.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), "cloud-hangul-"));
  const clock = options.clock || { t: Date.UTC(2026, 9, 25, 3) };
  const app = createApp({ dataDir, now: () => clock.t, fetchWeather: options.fetchWeather || (async () => { throw new Error("offline"); }) });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  return {
    app, base, clock, dataDir,
    async close() {
      app.closeAllConnections();
      await new Promise((r) => app.close(r));
    },
  };
}

// A browser session: keeps the server-issued cookie.
async function browser(s) {
  let cookie = "";
  const call = async (p, { method = "GET", body } = {}) => {
    const res = await fetch(s.base + p, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
  const me = await (await call("/api/session", { method: "POST" })).json();
  let n = 0;
  const reserve = async (city, letter) => {
    const res = await call(`/api/cities/${city}/reservations`, { method: "POST", body: { letter, requestId: `req-${me.author}-${++n}` } });
    return { status: res.status, ...(await res.json()) };
  };
  const inventory = async (city) => (await (await call(`/api/cities/${city}/inventory`)).json());
  return { call, me, reserve, inventory, get cookie() { return cookie; } };
}

// Reserves pieces for each syllable and returns publishable blocks.
async function draft(b, city, syllables) {
  const blocks = [];
  let dx = -(syllables.length - 1) / 2;
  for (const pieces of syllables) {
    const ids = [];
    for (const l of pieces) ids.push((await b.reserve(city, l)).reservation.id);
    blocks.push({ dx: dx++, dy: 0, pieces: ids });
  }
  return blocks;
}

test("serves the page, health and build-versioned assets", async () => {
  const s = await start();
  try {
    const html = await (await fetch(s.base + "/")).text();
    assert.match(html, /구름한글/);
    const asset = /src="(\.\/v\/[^"]+\/client\/main\.js)"/.exec(html)[1];
    assert.equal((await fetch(s.base + asset.slice(1))).status, 200);
    assert.equal((await (await fetch(s.base + "/health")).json()).game, "cloud-hangul");
  } finally {
    await s.close();
  }
});

test("identities are issued by the server and stable across requests", async () => {
  const s = await start();
  try {
    const a = await browser(s);
    assert.match(a.cookie, /^ch_vid=/);
    const again = await (await a.call("/api/me")).json();
    assert.equal(again.author, a.me.author);
    const b = await browser(s);
    assert.notEqual(b.me.author, a.me.author);
  } finally {
    await s.close();
  }
});

test("two sessions share one city's inventory; another city is unaffected", async () => {
  const s = await start();
  try {
    const a = await browser(s);
    const b = await browser(s);
    assert.equal((await b.inventory("kr-seoul")).available["ㅎ"], 10);
    await a.reserve("kr-seoul", "ㅎ");
    assert.equal((await b.inventory("kr-seoul")).available["ㅎ"], 9);
    assert.equal((await b.inventory("jp-tokyo")).available["ㅎ"], 10);
    assert.equal((await a.inventory("kr-seoul")).mine.length, 1);
    assert.equal((await b.inventory("kr-seoul")).mine.length, 0);
  } finally {
    await s.close();
  }
});

test("simultaneous claims on the last letter: exactly one succeeds", async () => {
  const s = await start();
  try {
    const a = await browser(s);
    for (let i = 0; i < 9; i++) await a.reserve("kr-seoul", "ㅖ");
    const others = await Promise.all([browser(s), browser(s), browser(s)]);
    const results = await Promise.all(others.map((o) => o.reserve("kr-seoul", "ㅖ")));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 2);
    assert.equal((await a.inventory("kr-seoul")).available["ㅖ"], 0);
  } finally {
    await s.close();
  }
});

test("cancelling returns pieces; refresh neither resets stock nor adds refills", async () => {
  const s = await start();
  try {
    const a = await browser(s);
    const ids = [(await a.reserve("kr-seoul", "ㄱ")).reservation.id, (await a.reserve("kr-seoul", "ㅏ")).reservation.id];
    const res = await a.call("/api/cities/kr-seoul/reservations/release", { method: "POST", body: { ids } });
    assert.equal((await res.json()).released, 2);
    const again = await (await a.call("/api/cities/kr-seoul/reservations/release", { method: "POST", body: { ids } })).json();
    assert.equal(again.released, 0, "retrying a release is harmless");
    await a.reserve("kr-seoul", "ㄱ");
    for (let i = 0; i < 3; i++) {
      await a.call("/api/cities/kr-seoul/visit", { method: "POST" });
      assert.equal((await a.inventory("kr-seoul")).available["ㄱ"], 9);
    }
  } finally {
    await s.close();
  }
});

test("publishing spends reserved letters, composes on the server, and is safe to retry", async () => {
  const s = await start();
  try {
    const a = await browser(s);
    const blocks = await draft(a, "kr-seoul", [["ㅂ", "ㅗ"], ["ㄱ", "ㅗ"], ["ㅅ", "ㅣ", "ㅍ"]]);
    blocks[2].dx += 1.5; // a gap: "보고 싶"
    // Wrong order cannot be passed off as another syllable.
    const body = { x: 3, y: 0.4, blocks, requestId: "publish-abc123" };
    const res = await a.call("/api/cities/kr-seoul/messages", { method: "POST", body });
    assert.equal(res.status, 201);
    const { message } = await res.json();
    assert.equal(message.text, "보고 싶");
    assert.equal(message.words, 2);
    const retry = await a.call("/api/cities/kr-seoul/messages", { method: "POST", body });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).message.id, message.id);
    const inv = await a.inventory("kr-seoul");
    assert.equal(inv.available["ㅗ"], 8);
    assert.equal(inv.mine.length, 0, "reservations were consumed");
    // Someone else's reservation ids are refused.
    const b = await browser(s);
    const stolen = await b.call("/api/cities/kr-seoul/messages", { method: "POST", body: { x: 1, y: 0.4, blocks: [{ dx: 0, dy: 0, pieces: ["nope"] }] } });
    assert.equal(stolen.status, 409);
  } finally {
    await s.close();
  }
});

test("word counts follow publish, delete and the 24-hour expiry; deleting does not refund", async () => {
  const s = await start();
  try {
    const a = await browser(s);
    const b = await browser(s);
    const one = (await (await a.call("/api/cities/kr-seoul/messages", { method: "POST", body: { x: 1, y: 0.4, blocks: await draft(a, "kr-seoul", [["ㅎ", "ㅏ", "ㄴ"]]) } })).json()).message;
    s.clock.t += 5000;
    const two = (await (await b.call("/api/cities/kr-seoul/messages", { method: "POST", body: { x: 6, y: 0.4, blocks: await draft(b, "kr-seoul", [["ㄱ", "ㅡ", "ㄹ"]]) } })).json()).message;
    let words = (await (await fetch(s.base + "/api/words")).json()).cities;
    assert.deepEqual(words["kr-seoul"].map((e) => e[2]), [1, 1]);
    assert.equal(words["kr-seoul"][0][1], one.createdAt + LIFETIME_MS);

    assert.equal((await b.call(`/api/cities/kr-seoul/messages/${one.id}`, { method: "DELETE" })).status, 403);
    assert.equal((await a.call(`/api/cities/kr-seoul/messages/${one.id}`, { method: "DELETE" })).status, 200);
    words = (await (await fetch(s.base + "/api/words")).json()).cities;
    assert.deepEqual(words["kr-seoul"].map((e) => e[0]), [two.id]);
    assert.equal((await a.inventory("kr-seoul")).available["ㅎ"], 9, "deleting does not return letters");

    s.clock.t = two.createdAt + LIFETIME_MS;
    words = (await (await fetch(s.base + "/api/words")).json()).cities;
    assert.equal(words["kr-seoul"], undefined);
    assert.equal((await (await fetch(s.base + "/api/cities/kr-seoul/messages")).json()).messages.length, 0);
  } finally {
    await s.close();
  }
});

test("messages and inventory survive a restart", async () => {
  const a = await start();
  const x = await browser(a);
  await x.call("/api/cities/us-wa-seattle/messages", { method: "POST", body: { x: 1, y: 0.4, blocks: await draft(x, "us-wa-seattle", [["ㅇ", "ㅖ"]]) } });
  await a.close();
  const b = await start({ dataDir: a.dataDir, clock: a.clock });
  try {
    assert.equal((await (await fetch(b.base + "/api/cities/us-wa-seattle/messages")).json()).messages.length, 1);
    assert.equal((await (await fetch(b.base + "/api/cities/us-wa-seattle/inventory")).json()).available["ㅖ"], 9);
  } finally {
    await b.close();
  }
});

test("inventory and word changes are pushed to open streams", async () => {
  const s = await start();
  try {
    const read = async (p, until, act) => {
      const stream = await fetch(s.base + p);
      const reader = stream.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (!text.includes("event: hello")) text += decoder.decode((await reader.read()).value);
      await act();
      while (!text.includes(until)) text += decoder.decode((await reader.read()).value);
      await reader.cancel();
      return text;
    };
    const a = await browser(s);
    const inv = await read("/api/cities/kr-seoul/events", "event: inventory", () => a.reserve("kr-seoul", "ㅋ"));
    assert.match(inv, /"ㅋ":9/);
    const words = await read("/api/events", "event: words", async () =>
      a.call("/api/cities/kr-seoul/messages", { method: "POST", body: { x: 1, y: 0.4, blocks: await draft(a, "kr-seoul", [["ㅋ"]]) } }));
    assert.match(words, /"op":"add","cityId":"kr-seoul"/);
  } finally {
    await s.close();
  }
});

test("unknown cities are refused and weather falls back to a labeled simulation", async () => {
  const s = await start();
  try {
    assert.equal((await fetch(s.base + "/api/cities/nowhere/messages")).status, 404);
    assert.equal((await fetch(s.base + "/api/cities/nowhere/inventory")).status, 404);
    const w = await (await fetch(s.base + "/api/weather?city=kr-seoul")).json();
    assert.equal(w.source, "simulated");
    assert.ok(w.steps.length > 0);
  } finally {
    await s.close();
  }
});

test("every catalog city has a working sky: messages, inventory and weather", async () => {
  const { CITIES } = await import("../src/cities.js");
  const s = await start();
  try {
    for (const c of CITIES) {
      for (const p of [`/api/cities/${c.id}/messages`, `/api/cities/${c.id}/inventory`, `/api/weather?city=${c.id}`]) {
        const res = await fetch(s.base + p);
        assert.equal(res.status, 200, `${c.id} ${p}`);
        await res.arrayBuffer();
      }
    }
  } finally {
    await s.close();
  }
});
