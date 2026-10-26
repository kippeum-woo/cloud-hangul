// Talks to the shared sky server. URLs are relative to <base href>, so the
// game works at / and under the site's /cloud-hangul mount. Identity is a
// server-issued HttpOnly cookie, sent automatically with every request.

// Before identities moved to the server, the browser made its own token. It
// is offered once when the session starts so earlier messages stay deletable.
const LEGACY_OWNER_KEY = "cloudHangul.owner";

let skew = 0; // server clock minus device clock, from the latest response
export const serverNow = () => Date.now() + skew;

export const requestId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function call(path, { method = "GET", body, headers = {}, signal } = {}) {
  const sent = Date.now();
  const res = await fetch(path, {
    method,
    signal,
    credentials: "same-origin",
    headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (data && Number.isFinite(data.now)) skew = data.now - (sent + Date.now()) / 2;
  if (!res.ok) throw Object.assign(new Error(data?.error || `http_${res.status}`), { status: res.status, code: data?.error, data });
  return data;
}

// Retries network failures (not refusals) a couple of times with backoff.
// Only used for requests the server treats idempotently.
async function retrying(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status || attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
}

export const api = {
  session() {
    const legacy = localStorage.getItem(LEGACY_OWNER_KEY);
    return call("api/session", { method: "POST", headers: legacy ? { "X-Cloud-Owner": legacy } : {} });
  },
  weather: (cityId) => call(`api/weather?city=${encodeURIComponent(cityId)}`),
  words: () => call("api/words"),
  messages: (cityId, r) =>
    call(`api/cities/${cityId}/messages?x0=${r.x0.toFixed(3)}&x1=${r.x1.toFixed(3)}&y0=${r.y0.toFixed(3)}&y1=${r.y1.toFixed(3)}`),
  latestMine: (cityId) => call(`api/cities/${cityId}/messages?mine=latest`),
  message: (id) => call(`api/messages/${encodeURIComponent(id)}`),
  inventory: (cityId) => call(`api/cities/${cityId}/inventory`),
  supply: (cityId) => call(`api/cities/${cityId}/supply`),
  visit: (cityId) => call(`api/cities/${cityId}/visit`, { method: "POST" }),
  reserve: (cityId, letter, id = requestId()) =>
    retrying(() => call(`api/cities/${cityId}/reservations`, { method: "POST", body: { letter, requestId: id } })),
  release: (cityId, ids) => retrying(() => call(`api/cities/${cityId}/reservations/release`, { method: "POST", body: { ids } })),
  renew: (cityId, ids) => call(`api/cities/${cityId}/reservations/renew`, { method: "POST", body: { ids } }),
  publish: (cityId, draft, id) => retrying(() => call(`api/cities/${cityId}/messages`, { method: "POST", body: { ...draft, requestId: id } })),
  remove: (cityId, id) => call(`api/cities/${cityId}/messages/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

function stream(path, handlers) {
  if (document.querySelector('meta[name="cloud-hangul-transport"]')?.content === "websocket") return socketStream(path, handlers);
  const es = new EventSource(path);
  es.addEventListener("hello", (e) => {
    const data = JSON.parse(e.data);
    if (Number.isFinite(data.now)) skew = data.now - Date.now();
    handlers.onOpen?.(data);
  });
  for (const [event, fn] of Object.entries(handlers.on || {})) es.addEventListener(event, (e) => fn(JSON.parse(e.data)));
  es.onerror = () => handlers.onError?.(es.readyState);
  return () => es.close();
}

function socketStream(path, handlers) {
  let socket, timer, stopped = false, attempts = 0;
  const url = new URL(path, document.baseURI);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  function connect() {
    if (stopped) return;
    socket = new WebSocket(url);
    socket.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === "hello") {
        attempts = 0;
        if (Number.isFinite(data.now)) skew = data.now - Date.now();
        handlers.onOpen?.(data);
      } else handlers.on?.[data.type]?.(data);
    };
    socket.onerror = () => handlers.onError?.(socket.readyState);
    socket.onclose = () => {
      if (!stopped) timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) + Math.random() * 500);
    };
  }
  connect();
  return () => { stopped = true; clearTimeout(timer); socket?.close(); };
}

// One city's sky: new and deleted messages and shared inventory changes.
export const subscribeCity = (cityId, { onOpen, onMessage, onDelete, onInventory, onError }) =>
  stream(`api/cities/${cityId}/events`, {
    onOpen,
    onError,
    on: { message: (d) => onMessage?.(d.message), delete: (d) => onDelete?.(d.id), inventory: (d) => onInventory?.(d.available) },
  });

// Word counts for every city, for the globe.
export const subscribeWords = ({ onOpen, onWords }) => stream("api/events", { onOpen, on: { words: onWords } });
