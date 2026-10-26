import assert from "node:assert/strict";
import test from "node:test";
import { CITIES, cityById, countryList, nearestCity, searchCities, US_STATES } from "../src/cities.js";

test("exactly one city per US state, 50 in total", () => {
  const us = CITIES.filter((c) => c.country === "US");
  assert.equal(us.length, 50);
  assert.deepEqual(new Set(us.map((c) => c.state)), new Set(US_STATES.map(([code]) => code)));
});

test("every city has a stable unique id, coordinates and a valid IANA timezone", () => {
  assert.equal(new Set(CITIES.map((c) => c.id)).size, CITIES.length);
  for (const c of CITIES) {
    assert.match(c.id, /^[a-z]{2}-[a-z0-9-]+$/);
    assert.ok(c.name && c.nameEn && c.country, c.id);
    assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180, c.id);
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en", { timeZone: c.tz }), c.id);
  }
});

test("every other listed country has its capital", () => {
  for (const { code } of countryList()) {
    if (code === "US") continue;
    assert.ok(CITIES.some((c) => c.country === code && c.kind === "capital"), code);
  }
});

test("search matches Korean and English names", () => {
  assert.equal(searchCities("서울")[0].id, "kr-seoul");
  assert.equal(searchCities("seattle")[0].id, "us-wa-seattle");
  assert.ok(searchCities("텍사스").some((c) => c.id === "us-tx-houston"));
  assert.ok(searchCities("포틀랜드").length === 2);
});

test("GPS suggests the nearest supported city", () => {
  assert.equal(nearestCity(37.4, 127.1).city.id, "kr-seoul");
  assert.equal(nearestCity(47.7, -122.2).city.id, "us-wa-seattle");
  assert.equal(cityById("nope"), null);
});
