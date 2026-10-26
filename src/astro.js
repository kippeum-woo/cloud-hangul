// Sun and moon positions for a coordinate and UTC instant. Low-precision
// formulas (accurate to about a minute for sunrise and sunset), after
// "Astronomy Answers" by Aphrodite Teamwork and SunCalc's derivation.
// Angles are radians. Bearings are compass bearings: 0 = north, π/2 = east.

const rad = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // obliquity of the Earth

const toJulian = (ms) => ms / DAY_MS - 0.5 + J1970;
const fromJulian = (j) => (j + 0.5 - J1970) * DAY_MS;
const toDays = (ms) => toJulian(ms) - J2000;

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
function sunCoords(d) {
  const L = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

// Converts the south-based azimuth of the formulas to a compass bearing.
const bearing = (az) => (az + Math.PI + 2 * Math.PI) % (2 * Math.PI);

export function sunPosition(ms, lat, lon) {
  const lw = rad * -lon;
  const phi = rad * lat;
  const d = toDays(ms);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { altitude: altitude(H, phi, c.dec), bearing: bearing(azimuth(H, phi, c.dec)) };
}

const J0 = 0.0009;
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

// Sun event times around the given instant, as UTC ms. An event is null when
// the sun never crosses that altitude on this day (polar day or polar night).
export function sunTimes(ms, lat, lon) {
  const lw = rad * -lon;
  const phi = rad * lat;
  const d = toDays(ms);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const at = (deg) => {
    const w = hourAngle(deg * rad, phi, dec);
    if (Number.isNaN(w)) return [null, null];
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    return [fromJulian(Jnoon - (Jset - Jnoon)), fromJulian(Jset)];
  };
  const [sunrise, sunset] = at(-0.833);
  const [dawn, dusk] = at(-6);
  const noon = fromJulian(Jnoon);
  const noonAlt = sunPosition(noon, lat, lon).altitude;
  const midnightAlt = sunPosition(noon + DAY_MS / 2, lat, lon).altitude;
  let polar = null;
  if (sunrise === null) polar = noonAlt > 0 ? "day" : "night";
  return { sunrise, sunset, dawn, dusk, noon, polar, noonAltitude: noonAlt, midnightAltitude: midnightAlt };
}

function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  const dt = 385001 - 20905 * Math.cos(M);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
}

export function moonPosition(ms, lat, lon) {
  const lw = rad * -lon;
  const phi = rad * lat;
  const d = toDays(ms);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  h += (rad * 0.017) / Math.tan(h + (rad * 10.26) / (h + rad * 5.1)); // refraction
  return { altitude: h, bearing: bearing(azimuth(H, phi, c.dec)) };
}

// fraction: lit share of the disc. phase: 0 new, 0.25 first quarter, 0.5 full.
export function moonIllumination(ms) {
  const d = toDays(ms);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI };
}

export const DEG = rad;
