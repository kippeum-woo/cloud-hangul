import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LETTERS } from "../src/hangul.js";
import { createSupply, SUPPLY, tierFor } from "../server/supply.js";

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 25, 3);
const make = (dataDir = null) => {
  const clock = { t: T0 };
  return { clock, s: createSupply({ dataDir, now: () => clock.t }) };
};
let seq = 0;
const rid = () => `req-${++seq}-abcdef`;
const total = (s, city) => Object.values(s.snapshot(city)).reduce((a, b) => a + b, 0);
// Take n of a letter and spend them, as publishing would.
function spend(s, city, visitor, letter, n) {
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(s.reserve(city, visitor, letter, rid()).reservation.id);
  s.consume(city, visitor, ids);
}

test("each city starts once with 10 complete decks (400 pieces)", () => {
  const { s } = make();
  assert.equal(total(s, "kr-seoul"), 400);
  for (const l of LETTERS) assert.equal(s.snapshot("kr-seoul")[l], 10);
});

test("visitors share one city's stock; other cities are independent", () => {
  const { s } = make();
  s.reserve("kr-seoul", "alice", "ㅎ", rid());
  assert.equal(s.snapshot("kr-seoul")["ㅎ"], 9, "bob sees alice's claim");
  assert.equal(s.snapshot("jp-tokyo")["ㅎ"], 10);
});

test("the last piece can only be claimed once", () => {
  const { s } = make();
  for (let i = 0; i < 9; i++) s.reserve("kr-seoul", "alice", "ㅢ", rid());
  const a = s.reserve("kr-seoul", "bob", "ㅢ", rid());
  const b = s.reserve("kr-seoul", "carol", "ㅢ", rid());
  assert.ok(a.reservation);
  assert.equal(b.error, "unavailable");
  assert.equal(s.snapshot("kr-seoul")["ㅢ"], 0);
});

test("reserve and release are safe to retry", () => {
  const { s } = make();
  const id = rid();
  const a = s.reserve("kr-seoul", "alice", "ㄱ", id);
  const again = s.reserve("kr-seoul", "alice", "ㄱ", id);
  assert.equal(a.reservation.id, again.reservation.id);
  assert.equal(s.snapshot("kr-seoul")["ㄱ"], 9);
  assert.equal(s.release("kr-seoul", "bob", [a.reservation.id]).released, 0, "only the holder can release");
  assert.equal(s.release("kr-seoul", "alice", [a.reservation.id]).released, 1);
  assert.equal(s.release("kr-seoul", "alice", [a.reservation.id]).released, 0);
  assert.equal(s.reserve("kr-seoul", "alice", "ㄱ", id).error, "request_finished", "a late retry cannot claim again");
  assert.equal(s.snapshot("kr-seoul")["ㄱ"], 10);
});

test("abandoned reservations expire back to the city; renewing keeps them", () => {
  const { s, clock } = make();
  const keep = s.reserve("kr-seoul", "alice", "ㄴ", rid()).reservation.id;
  s.reserve("kr-seoul", "bob", "ㄴ", rid());
  clock.t += SUPPLY.reservationTtlMs - MIN;
  s.renew("kr-seoul", "alice", [keep]);
  clock.t += 2 * MIN;
  assert.equal(s.snapshot("kr-seoul")["ㄴ"], 9, "bob's expired, alice's renewed one is still held");
  assert.deepEqual(s.mine("kr-seoul", "alice").map((r) => r.id), [keep]);
  assert.deepEqual(s.renew("kr-seoul", "bob", ["gone"]).missing, ["gone"]);
});

test("one deck per 6 minutes when quiet, including time nobody is looking, capped at 10", () => {
  const { s, clock } = make();
  spend(s, "kr-seoul", "alice", "ㄱ", 6);
  assert.equal(s.snapshot("kr-seoul")["ㄱ"], 4);
  clock.t += 6 * MIN;
  assert.equal(s.snapshot("kr-seoul")["ㄱ"], 5);
  clock.t += 5 * 60 * MIN; // five hours away
  assert.equal(s.snapshot("kr-seoul")["ㄱ"], 10);
  assert.equal(total(s, "kr-seoul"), 400, "consumed pieces only come back through refills, up to the cap");
});

test("refills run once per city, not once per visitor or refresh", () => {
  const { s, clock } = make();
  spend(s, "kr-seoul", "alice", "ㅁ", 5);
  clock.t += 6 * MIN + 1000;
  for (const v of ["alice", "bob", "carol"]) for (let i = 0; i < 4; i++) s.touch("kr-seoul", v);
  s.snapshot("kr-seoul");
  assert.equal(s.snapshot("kr-seoul")["ㅁ"], 6);
});

test("busier cities refill faster and hold more, tier by tier", () => {
  assert.equal(tierFor(10).decks, 1);
  assert.equal(tierFor(11).decks, 2);
  assert.equal(tierFor(31).capacity, 30);
  assert.equal(tierFor(61).capacity, 40);
  const { s, clock } = make();
  for (let i = 0; i < 15; i++) s.touch("us-ny-new-york", `v${i}`);
  clock.t += 6 * MIN;
  assert.equal(s.snapshot("us-ny-new-york")["ㅏ"], 12, "two decks per tick with 15 visitors");
  clock.t += 6 * MIN;
  assert.equal(s.snapshot("us-ny-new-york")["ㅏ"], 14);
  assert.equal(s.debug("us-ny-new-york").tier.capacity, 20);
});

test("the current tier is not applied to past intervals", () => {
  const { s, clock } = make();
  spend(s, "kr-seoul", "alice", "ㅂ", 8);
  clock.t += 18 * MIN; // three quiet ticks nobody observed
  for (let i = 0; i < 40; i++) s.touch("kr-seoul", `v${i}`);
  assert.equal(s.snapshot("kr-seoul")["ㅂ"], 5, "2 + three tier-0 refills, not tier-3 ones");
});

test("a lower cap keeps existing pieces and pauses refills above it", () => {
  const { s, clock } = make();
  // Keep 15 visitors active for six ticks: ㅅ grows to 20.
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 15; i++) s.touch("kr-seoul", `v${i}`);
    clock.t += 6 * MIN;
  }
  assert.equal(s.snapshot("kr-seoul")["ㅅ"], 20);
  clock.t += 60 * MIN; // everyone left: back to capacity 10
  assert.equal(s.snapshot("kr-seoul")["ㅅ"], 20, "nothing is taken away");
  spend(s, "kr-seoul", "alice", "ㅅ", 12);
  clock.t += 6 * MIN;
  assert.equal(s.snapshot("kr-seoul")["ㅅ"], 9, "refills resume only below the new cap");
});

test("reserved pieces count toward the cap, so returning them adds nothing extra", () => {
  const { s, clock } = make();
  const r = s.reserve("kr-seoul", "alice", "ㅇ", rid()).reservation.id;
  clock.t += 30 * MIN;
  s.release("kr-seoul", "alice", [r]);
  assert.equal(s.snapshot("kr-seoul")["ㅇ"], 10);
});

test("stock and refill state survive a restart without extra refills", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "supply-"));
  const a = make(dir);
  spend(a.s, "kr-seoul", "alice", "ㅈ", 7);
  a.clock.t += 7 * MIN;
  assert.equal(a.s.snapshot("kr-seoul")["ㅈ"], 4);
  a.s.flush();
  const b = createSupply({ dataDir: dir, now: () => a.clock.t });
  assert.equal(b.snapshot("kr-seoul")["ㅈ"], 4);
  assert.equal(b.snapshot("kr-seoul")["ㅈ"], 4);
});
