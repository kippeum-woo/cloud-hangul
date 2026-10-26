import assert from "node:assert/strict";
import test from "node:test";
import { LIFETIME_MS, isLive, normalizeDraft, opacityAt, overlaps, place, recenter, SKY_W, textOf } from "../src/messages.js";

test("messages fade with age and expire at exactly 24 hours", () => {
  assert.equal(opacityAt(0), 1);
  assert.ok(opacityAt(LIFETIME_MS / 2) < 1 && opacityAt(LIFETIME_MS / 2) > 0.6);
  assert.ok(opacityAt(LIFETIME_MS - 1) >= 0.3);
  assert.equal(opacityAt(LIFETIME_MS), 0);
  const m = { createdAt: 1000 };
  assert.equal(isLive(m, 1000 + LIFETIME_MS - 1), true);
  assert.equal(isLive(m, 1000 + LIFETIME_MS), false);
});

test("placement keeps readable spacing, including across the wrap seam", () => {
  const blocks = [{ t: "안", dx: -0.5, dy: 0 }, { t: "녕", dx: 0.5, dy: 0 }];
  const a = { x: 0.05, y: 0.5, blocks };
  const b = place({ x: SKY_W - 0.05, y: 0.5, blocks }, [a]);
  assert.equal(overlaps(a, b), false);
  const crowd = [a];
  for (let i = 0; i < 20; i++) crowd.push(place({ x: 0, y: 0.5, blocks }, crowd));
  for (let i = 0; i < crowd.length; i++) for (let j = i + 1; j < crowd.length; j++) assert.equal(overlaps(crowd[i], crowd[j]), false);
});

test("drafts are validated", () => {
  assert.equal(normalizeDraft({ x: 1, y: 0.5, blocks: [] }).error, "empty_message");
  assert.equal(normalizeDraft({ x: 1, y: 0.5, blocks: [{ t: "<b>", dx: 0, dy: 0 }] }).error, "invalid_block");
  assert.equal(normalizeDraft({ x: 1, y: 0.5, blocks: [{ t: "AB", dx: 0, dy: 0 }] }).error, "invalid_block");
  assert.ok(normalizeDraft({ x: 1, y: 0.5, blocks: [{ t: "ㅋ", dx: 0, dy: 0 }] }).value);
  assert.equal(normalizeDraft({ x: 13.5, y: 0.5, blocks: [{ t: "한", dx: 0, dy: 0 }] }).value.x, 1.5);
});

test("text reads row by row", () => {
  const { blocks } = recenter([
    { t: "구", dx: 4, dy: 1 }, { t: "름", dx: 5, dy: 1 }, { t: "한", dx: 4, dy: 0 }, { t: "글", dx: 5, dy: 0 },
  ]);
  assert.equal(textOf({ blocks }), "한글 구름");
});
