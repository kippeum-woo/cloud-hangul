// Weather as the sky renderer needs it, from Open-Meteo or a simulation.
// A condition is { kind, label, cloud, rain, snow, fog, wind, windDir, temp,
// simulated }, where cloud/rain/snow/fog are 0..1 and wind is km/h.

const KINDS = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloudy: "Overcast",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  storm: "Thunderstorm",
};

export const WEATHER_LABELS = KINDS;

// WMO weather interpretation codes, as Open-Meteo reports them.
export function kindFromCode(code) {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "partly";
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function condition({ code, cloudCover, precipitation = 0, snowfall = 0, wind = 0, windDir = 270, visibility, temp = null }, simulated = false) {
  const kind = kindFromCode(code);
  let cloud = clamp01((cloudCover ?? { clear: 10, partly: 45, cloudy: 95 }[kind] ?? 85) / 100);
  if (kind === "rain" || kind === "storm" || kind === "snow" || kind === "drizzle") cloud = Math.max(cloud, 0.75);
  const wet = kind === "drizzle" ? 0.25 : kind === "rain" ? 0.55 : kind === "storm" ? 0.9 : 0;
  const rain = kind === "snow" ? 0 : clamp01(Math.max(wet, precipitation / 6));
  const snow = kind === "snow" ? clamp01(Math.max(0.45, snowfall / 2)) : 0;
  let fog = kind === "fog" ? 0.75 : 0;
  if (Number.isFinite(visibility) && visibility < 5000) fog = Math.max(fog, clamp01(1 - visibility / 5000) * 0.85);
  return { kind, label: KINDS[kind], cloud, rain, snow, fog, wind, windDir, temp, simulated };
}

// Open-Meteo forecast URL for one coordinate. Times come back in UTC.
export function openMeteoUrl(lat, lon) {
  const vars = "weather_code,cloud_cover,precipitation,snowfall,wind_speed_10m,wind_direction_10m,visibility,temperature_2m";
  const q = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: vars,
    hourly: vars,
    forecast_hours: "48",
    timezone: "GMT",
    wind_speed_unit: "kmh",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

// Reads the current block, plus hourly steps so the sky can follow the
// forecast forward without asking the API again.
export function parseOpenMeteo(json) {
  const steps = [];
  const c = json?.current;
  if (c && c.time) steps.push({ at: Date.parse(`${c.time}Z`), ...pick(c, 0, true) });
  const h = json?.hourly;
  if (h && Array.isArray(h.time)) {
    h.time.forEach((t, i) => {
      const at = Date.parse(`${t}Z`);
      if (!steps.length || at > steps[0].at) steps.push({ at, ...pick(h, i, false) });
    });
  }
  if (!steps.length || steps.some((s) => !Number.isFinite(s.at) || !Number.isFinite(s.code))) throw new Error("bad weather payload");
  return steps;
}

function pick(src, i, scalar) {
  const v = (k) => (scalar ? src[k] : src[k]?.[i]);
  return {
    code: v("weather_code"),
    cloudCover: v("cloud_cover"),
    precipitation: v("precipitation") ?? 0,
    snowfall: v("snowfall") ?? 0,
    wind: v("wind_speed_10m") ?? 0,
    windDir: v("wind_direction_10m") ?? 270,
    visibility: v("visibility"),
    temp: v("temperature_2m"),
  };
}

// The latest step at or before now (the first step if now is earlier).
export function stepAt(steps, now) {
  let best = steps[0];
  for (const s of steps) if (s.at <= now) best = s;
  return best;
}

// Deterministic simulated weather, labeled as such, for when the API is out
// of reach. It changes every three hours and differs between cities.
export function simulatedSteps(cityId, now) {
  const kinds = [0, 1, 2, 2, 3, 3, 45, 61, 63, 71, 80, 95];
  const steps = [];
  const start = Math.floor(now / 10800000) * 10800000;
  for (let i = 0; i < 16; i++) {
    const at = start + i * 10800000;
    const r = hash(`${cityId}:${at}`);
    steps.push({ at, code: kinds[r % kinds.length], cloudCover: null, wind: 5 + (r % 30), windDir: (r * 7) % 360, temp: null });
  }
  return steps;
}

export const PRESETS = {
  clear: { code: 0, cloudCover: 5, wind: 6 },
  partly: { code: 2, cloudCover: 45, wind: 10 },
  cloudy: { code: 3, cloudCover: 100, wind: 12 },
  rain: { code: 63, cloudCover: 100, precipitation: 3, wind: 18 },
  snow: { code: 73, cloudCover: 100, snowfall: 1.2, wind: 8 },
  fog: { code: 45, cloudCover: 90, visibility: 400, wind: 3 },
  windy: { code: 2, cloudCover: 55, wind: 55 },
  storm: { code: 95, cloudCover: 100, precipitation: 8, wind: 40 },
};

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
