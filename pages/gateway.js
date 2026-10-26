// Keep API requests, cookies and WebSocket upgrades on the Pages origin.
// The existing Worker owns the same durable data; no new game world is made.
export default {
  fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/") || path === "/health") return env.GAME.fetch(request);
    return env.ASSETS.fetch(request);
  },
};
