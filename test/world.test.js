import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createStore } from "../server/store.js";
import { inRect, LAYOUT, normalizeDraft, SKY_W, WORLD_Y } from "../src/messages.js";

const blocks = [{ t: "안", dx: 0, dy: 0 }];

test("a rectangle matches messages touching it in both axes, across the bearing seam", () => {
  const near = { x: SKY_W - 0.2, y: 3, blocks };
  assert.ok(inRect(near, { x0: -1, x1: 1, y0: 2, y1: 4 }));
  assert.ok(!inRect(near, { x0: 1, x1: 5, y0: 2, y1: 4 }));
  assert.ok(!inRect(near, { x0: -1, x1: 1, y0: 6, y1: 8 }));
});

test("world y is unbounded within ±WORLD_Y and x wraps", () => {
  assert.equal(normalizeDraft({ x: 13.5, y: WORLD_Y * 2, blocks: [{ t: "한", dx: 0, dy: 0 }] }).value.y, WORLD_Y);
  assert.equal(normalizeDraft({ x: 1, y: -2.5, blocks: [{ t: "한", dx: 0, dy: 0 }] }).value.y, -2.5);
});

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cloud-hangul-world-"));
}

test("stored messages from the screen-height layout move onto the centred origin once", () => {
  const dir = tempDir();
  const legacy = { id: "old1", cityId: "c", author: "a", createdAt: Date.now(), x: 2, y: 0.25, blocks, text: "안", words: 1 };
  fs.writeFileSync(path.join(dir, "messages.json"), JSON.stringify({ messages: [legacy] }));
  const store = createStore({ dataDir: dir });
  const [m] = store.list("c");
  assert.equal(m.y, -0.25);
  assert.equal(m.x, 2);
  assert.equal(m.layout, LAYOUT);
  store.flush();
  const again = createStore({ dataDir: dir });
  assert.equal(again.list("c")[0].y, -0.25);
});

test("range listing returns only messages inside the region, including y", () => {
  const store = createStore({ dataDir: tempDir() });
  const a = store.publish("c", "u1", { x: 1, y: 1, blocks }).message;
  store.publish("c", "u2", { x: 1, y: 40, blocks });
  const inside = store.list("c", { x0: 0, x1: 2, y0: 0, y1: 2 });
  assert.equal(inside.length, 1);
  assert.equal(inside[0].id, a.id);
});

test("latest returns the newest live message of one author in a city", () => {
  const dir = tempDir();
  const store = createStore({ dataDir: dir });
  assert.equal(store.latest("c", "nobody"), null);
  const first = store.publish("c", "me", { x: 1, y: 1, blocks: [{ t: "안", dx: 0, dy: 0 }] }).message;
  assert.equal(store.latest("c", "me").id, first.id);
});
