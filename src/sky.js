// Sky state for a city at an instant: the phase of day from the real sun
// altitude, and the colors after weather is applied. Pure, so it is testable.
import { moonIllumination, moonPosition, sunPosition, sunTimes } from "./astro.js";

const DEG = 180 / Math.PI;

export const PHASE_LABELS = {
  predawn: "Dawn",
  sunrise: "Sunrise",
  day: "Daylight",
  sunset: "Sunset",
  twilight: "Twilight",
  night: "Night",
};

// Phase from the sun's altitude in degrees and whether it is climbing.
export function phaseOf(altDeg, rising) {
  if (altDeg >= 6) return "day";
  if (altDeg >= -0.833) return rising ? "sunrise" : "sunset";
  if (altDeg >= -12) return rising ? "predawn" : "twilight";
  return "night";
}

// Sky gradient stops [zenith, middle, horizon] by sun altitude. Morning and
// evening differ near the horizon: dawn is cooler and pinker, dusk warmer.
const STOPS = [
  [-90, ["#060a1c", "#0b1330", "#141d40"], ["#060a1c", "#0b1330", "#141d40"]],
  [-18, ["#070c22", "#0e1736", "#19244c"], ["#070c22", "#0e1736", "#19244c"]],
  [-12, ["#0b1432", "#1a2756", "#33407a"], ["#0b1432", "#1d2552", "#3a3a72"]],
  [-6, ["#1b2b62", "#4b5a9c", "#a38fbf"], ["#1c2658", "#56508f", "#c07f8f"]],
  [-2, ["#2d4a8c", "#7d86c4", "#f2b2a6"], ["#2b3f80", "#8a74b0", "#f39a72"]],
  [2, ["#4877c2", "#a5b4e0", "#ffd2b4"], ["#4469b4", "#b39ac6", "#ffb47a"]],
  [6, ["#5a94da", "#a2c8ee", "#ffe6c8"], ["#5a8ed4", "#b6bfe0", "#ffd2a0"]],
  [15, ["#4f96e0", "#8fc4f0", "#d9eefb"], ["#4f96e0", "#8fc4f0", "#e3ecf4"]],
  [40, ["#3c89de", "#7bbaf0", "#cde7fb"], ["#3c89de", "#7bbaf0", "#cde7fb"]],
  [90, ["#3484dc", "#76b6ee", "#c8e4fa"], ["#3484dc", "#76b6ee", "#c8e4fa"]],
];

export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(",")},${a})`;
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const luminance = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

function palette(altDeg, rising) {
  const k = rising ? 1 : 2;
  let i = 0;
  while (i < STOPS.length - 2 && altDeg > STOPS[i + 1][0]) i++;
  const [a0, a1] = [STOPS[i][0], STOPS[i + 1][0]];
  const t = Math.max(0, Math.min(1, (altDeg - a0) / (a1 - a0)));
  return [0, 1, 2].map((j) => mix(hexToRgb(STOPS[i][k][j]), hexToRgb(STOPS[i + 1][k][j]), t));
}

// Light on the scene: 0 at deep night, 1 in full day.
export const daylight = (altDeg) => smooth(-12, 10, altDeg);

export function skyColors(altDeg, rising, weather) {
  let cols = palette(altDeg, rising);
  const light = daylight(altDeg);
  const w = weather || { cloud: 0, rain: 0, snow: 0, fog: 0 };
  const overcast = smooth(0.35, 1, w.cloud) * 0.85 + w.rain * 0.15;
  // Clouds flatten the gradient to a gray of matching brightness.
  cols = cols.map((c) => {
    const l = luminance(c) * 255;
    const gray = [l * 0.95, l * 0.98, l * 1.04];
    return mix(c, gray, overcast * (0.55 + 0.35 * light));
  });
  const dim = 1 - w.rain * 0.32 - (w.kind === "storm" ? 0.15 : 0);
  cols = cols.map((c) => c.map((v) => v * dim));
  if (w.snow) cols = cols.map((c) => mix(c, [214, 222, 236].map((v) => v * (0.25 + 0.75 * light)), w.snow * 0.35));
  if (w.fog) {
    const haze = [200, 206, 214].map((v) => v * (0.18 + 0.82 * light));
    cols = cols.map((c, j) => mix(c, haze, w.fog * [0.45, 0.7, 0.9][j]));
  }
  const [zenith, middle, horizon] = cols;
  return { zenith, middle, horizon, light, luminance: luminance(middle) };
}

// Colors for cloud letters so they stay readable in any sky: bright fill,
// shadow tinted by the light, and an edge that grows when the sky is pale.
export function cloudInk(sky, altDeg, rising) {
  const warm = smooth(-6, 2, altDeg) * (1 - smooth(4, 14, altDeg));
  const night = 1 - sky.light;
  let fill = mix([255, 255, 255], [214, 224, 248], night * 0.55);
  if (warm > 0) fill = mix(fill, rising ? [255, 230, 236] : [255, 222, 206], warm * 0.6);
  const shade = mix([150, 172, 210], [70, 82, 130], night);
  const edge = Math.max(0.18, Math.min(0.7, (sky.luminance - 0.35) * 1.4));
  return { fill, shade, edge, glow: night * 0.55 };
}

// Everything the sky needs for one city at one instant.
export function skyState(city, now, weather) {
  const sun = sunPosition(now, city.lat, city.lon);
  const later = sunPosition(now + 600000, city.lat, city.lon);
  const altDeg = sun.altitude * DEG;
  const rising = later.altitude > sun.altitude;
  const times = sunTimes(now, city.lat, city.lon);
  const colors = skyColors(altDeg, rising, weather);
  return {
    phase: phaseOf(altDeg, rising),
    polar: times.polar,
    sun: { altDeg, bearingDeg: sun.bearing * DEG },
    moon: { ...degrees(moonPosition(now, city.lat, city.lon)), ...moonIllumination(now) },
    rising,
    times,
    colors,
    ink: cloudInk(colors, altDeg, rising),
  };
}

const degrees = (p) => ({ altDeg: p.altitude * DEG, bearingDeg: p.bearing * DEG });
