import assert from "node:assert/strict";
import test from "node:test";
import { sunTimes } from "../src/astro.js";
import { cityById } from "../src/cities.js";
import { dateLabel, localParts, offsetLabel, timeLabel } from "../src/clock.js";
import { phaseOf, skyState } from "../src/sky.js";
import { condition, PRESETS } from "../src/weather.js";

const seoul = cityById("kr-seoul");
const newYork = cityById("us-ny-new-york");

test("the clock follows the city's timezone, not the device", () => {
  const at = Date.UTC(2026, 9, 25, 3, 0, 0); // 03:00 UTC
  assert.equal(localParts(at, seoul.tz).hour, 12);
  assert.equal(timeLabel(at, seoul.tz), "12:00 PM");
  assert.equal(dateLabel(at, seoul.tz), "Sun, Oct 25");
  assert.equal(localParts(at, newYork.tz).hour, 23);
  assert.equal(localParts(at, newYork.tz).day, 24);
});

test("daylight saving time is applied per city", () => {
  const summer = Date.UTC(2026, 6, 1, 12);
  const winter = Date.UTC(2026, 11, 1, 12);
  assert.equal(offsetLabel(summer, newYork.tz), "UTC−4");
  assert.equal(offsetLabel(winter, newYork.tz), "UTC−5");
  assert.equal(offsetLabel(summer, seoul.tz), "UTC+9");
  assert.equal(offsetLabel(winter, seoul.tz), "UTC+9");
  assert.equal(offsetLabel(summer, cityById("us-az-phoenix").tz), "UTC−7");
  assert.equal(offsetLabel(summer, cityById("np-kathmandu").tz), "UTC+5:45");
});

test("switching cities at the same instant changes the sky phase", () => {
  const at = Date.UTC(2026, 9, 25, 3, 0, 0); // noon in Seoul, 23:00 in New York
  assert.equal(skyState(seoul, at, null).phase, "day");
  assert.equal(skyState(newYork, at, null).phase, "night");
});

test("sunrise and sunset come from the city's coordinates", () => {
  const at = Date.UTC(2026, 5, 21, 3);
  const t = sunTimes(at, seoul.lat, seoul.lon);
  const rise = localParts(t.sunrise, seoul.tz);
  const set = localParts(t.sunset, seoul.tz);
  // Seoul on the June solstice: about 05:11 and 19:57.
  assert.equal(rise.hour, 5);
  assert.ok(Math.abs(rise.minute - 11) <= 3, `sunrise ${rise.hour}:${rise.minute}`);
  assert.equal(set.hour, 19);
  assert.ok(Math.abs(set.minute - 57) <= 3, `sunset ${set.hour}:${set.minute}`);
});

test("polar day and polar night are detected", () => {
  const svalbard = cityById("no-longyearbyen");
  assert.equal(sunTimes(Date.UTC(2026, 5, 21, 12), svalbard.lat, svalbard.lon).polar, "day");
  assert.equal(sunTimes(Date.UTC(2026, 11, 21, 12), svalbard.lat, svalbard.lon).polar, "night");
  assert.equal(sunTimes(Date.UTC(2026, 2, 20, 12), seoul.lat, seoul.lon).polar, null);
  assert.equal(skyState(svalbard, Date.UTC(2026, 11, 21, 11), null).phase === "day", false);
});

test("phases follow sun altitude and direction", () => {
  assert.equal(phaseOf(-20, true), "night");
  assert.equal(phaseOf(-8, true), "predawn");
  assert.equal(phaseOf(2, true), "sunrise");
  assert.equal(phaseOf(30, false), "day");
  assert.equal(phaseOf(2, false), "sunset");
  assert.equal(phaseOf(-8, false), "twilight");
});

test("a rainy night looks different from a rainy afternoon, and both from clear", () => {
  const rain = condition(PRESETS.rain);
  const day = skyState(seoul, Date.UTC(2026, 9, 25, 5), rain).colors;
  const night = skyState(seoul, Date.UTC(2026, 9, 25, 15), rain).colors;
  const clear = skyState(seoul, Date.UTC(2026, 9, 25, 5), condition(PRESETS.clear)).colors;
  assert.ok(day.luminance > night.luminance + 0.15);
  assert.notDeepEqual(day.zenith, clear.zenith);
  assert.ok(clear.zenith[2] - clear.zenith[0] > day.zenith[2] - day.zenith[0], "rain grays the blue");
});
