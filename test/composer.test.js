import assert from "node:assert/strict";
import test from "node:test";
import { createComposer, restoreComposer } from "../src/composer.js";
import { SKY_W } from "../src/messages.js";

let n = 0;
const r = () => `r${++n}`;

test("ㅎ + ㅏ + ㄴ dropped on one block writes 한, keeping each original piece", () => {
  const c = createComposer();
  const { block } = c.drop("ㅎ", r(), 5, 0.5);
  assert.equal(c.preview(block.id, "ㅏ"), "하");
  c.drop("ㅏ", r(), 5, 0.5, block.id);
  c.drop("ㄴ", r(), 5, 0.5, block.id);
  assert.equal(c.text(block), "한");
  assert.deepEqual(block.pieces.map((p) => p.l), ["ㅎ", "ㅏ", "ㄴ"]);
});

test("an incompatible piece starts its own block instead of snapping", () => {
  const c = createComposer();
  const { block } = c.drop("ㅎ", r(), 5, 0.5);
  c.drop("ㅏ", r(), 5, 0.5, block.id);
  c.drop("ㄴ", r(), 5, 0.5, block.id);
  assert.equal(c.preview(block.id, "ㅓ"), null);
  const res = c.drop("ㅓ", r(), 5.1, 0.5, block.id);
  assert.equal(res.joined, false);
  assert.equal(res.rejected, true);
  assert.equal(c.blocks.length, 2);
});

test("vowel joins keep both pieces, and undo releases exactly the last one", () => {
  const c = createComposer();
  const a = r(), b = r(), d = r();
  const { block } = c.drop("ㄱ", a, 5, 0.5);
  c.drop("ㅗ", b, 5, 0.5, block.id);
  c.drop("ㅏ", d, 5, 0.5, block.id);
  assert.equal(c.text(block), "과");
  assert.deepEqual(c.undo().release, [d]);
  assert.equal(c.text(block), "고");
  assert.deepEqual(c.undo().release, [b]);
  assert.deepEqual(c.undo().release, [a]);
  assert.equal(c.blocks.length, 0);
});

test("remove, pop and reset release reservations; undo asks to claim them again", () => {
  const c = createComposer();
  const ids = [r(), r(), r(), r()];
  const a = c.drop("ㅇ", ids[0], 5, 0.5).block;
  c.drop("ㅢ", ids[1], 5, 0.5, a.id);
  const b = c.drop("ㄱ", ids[2], 5.2, 0.5).block;
  c.drop("ㅔ", ids[3], 5.2, 0.5, b.id);
  assert.deepEqual(c.blocks.map((x) => c.text(x)), ["의", "게"]);
  assert.deepEqual(c.pop(b.id), [ids[3]]);
  let u = c.undo();
  assert.deepEqual(u.need, ["ㅔ"]);
  u.apply(["new-e"]);
  assert.equal(c.text(c.blocks[1]), "게");
  assert.deepEqual(c.remove(a.id), [ids[0], ids[1]]);
  u = c.undo();
  assert.deepEqual(u.need, ["ㅇ", "ㅢ"]);
  u.apply(["n1", "n2"]);
  assert.deepEqual(c.blocks.map((x) => c.text(x)), ["의", "게"]);
  assert.deepEqual(c.reset().sort(), ["n1", "n2", ids[2], "new-e"].sort());
  u = c.undo();
  assert.deepEqual(u.need, ["ㅇ", "ㅢ", "ㄱ", "ㅔ"]);
  u.apply(["m1", "m2", "m3", "m4"]);
  assert.deepEqual(c.rids(), ["m1", "m2", "m3", "m4"]);
});

test("toMessage names the reservations behind every block", () => {
  const c = createComposer();
  c.drop("ㅋ", "k1", SKY_W - 0.05, 0.5);
  c.drop("ㅋ", "k2", 0.05, 0.5);
  const m = c.toMessage();
  assert.ok(m.x < 0.01 || m.x > SKY_W - 0.01, "centered across the wrap seam");
  assert.deepEqual(m.blocks.map((b) => [Math.round(b.dx * 10) / 10, b.pieces]), [[-0.5, ["k1"]], [0.5, ["k2"]]]);
});

test("a reloaded draft keeps only live reservations and releases unusable ones", () => {
  const c = createComposer();
  const blk = c.drop("ㅎ", "h", 5, 0.5).block;
  c.drop("ㅏ", "a", 5, 0.5, blk.id);
  c.drop("ㄴ", "n", 5, 0.5, blk.id);
  const saved = JSON.parse(JSON.stringify(c.save()));
  // ㅏ expired on the server; an unrelated reservation is still held.
  const { composer, release } = restoreComposer(saved, [{ id: "h", letter: "ㅎ" }, { id: "n", letter: "ㄴ" }, { id: "x", letter: "ㅋ" }]);
  assert.deepEqual(composer.blocks.map((b) => composer.text(b)), ["ㅎ"], "ㅎ+ㄴ does not compose, so ㄴ goes back");
  assert.deepEqual(release.sort(), ["n", "x"]);
  const gone = createComposer({ blocks: composer.blocks });
  assert.deepEqual(gone.forget(["h"]), []);
  assert.equal(gone.blocks.length, 0);
});
