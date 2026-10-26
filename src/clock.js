// A city's wall clock from its IANA timezone. Intl applies daylight saving
// rules, so the viewer's own device timezone never enters into it.

const cache = new Map();
function formatter(tz, options) {
  const key = `${tz}|${JSON.stringify(options)}`;
  if (!cache.has(key)) {
    let f;
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...options });
    } catch {
      f = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });
    }
    cache.set(key, f);
  }
  return cache.get(key);
}

export function localParts(now, tz) {
  const parts = {};
  for (const p of formatter(tz, {
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", weekday: "short",
  }).formatToParts(now)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

// Offset from UTC in minutes at this instant (DST included).
export function utcOffsetMinutes(now, tz) {
  const p = localParts(now, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(now / 1000) * 1000) / 60000);
}

export function offsetLabel(now, tz) {
  const m = utcOffsetMinutes(now, tz);
  const sign = m < 0 ? "−" : "+";
  const a = Math.abs(m);
  const h = Math.floor(a / 60);
  const mm = a % 60;
  return `UTC${sign}${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;
}

// "3:07 PM" (or "3:07:42 PM")
export function timeLabel(now, tz, seconds = false) {
  const p = localParts(now, tz);
  const ampm = p.hour < 12 ? "AM" : "PM";
  const h12 = p.hour % 12 || 12;
  const mm = String(p.minute).padStart(2, "0");
  return `${h12}:${mm}${seconds ? `:${String(p.second).padStart(2, "0")}` : ""} ${ampm}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Sun, Oct 25"
export function dateLabel(now, tz) {
  const p = localParts(now, tz);
  const weekday = DAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  return `${weekday}, ${MONTHS[p.month - 1]} ${p.day}`;
}

export function ageLabel(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min ` : ""}ago`;
}
