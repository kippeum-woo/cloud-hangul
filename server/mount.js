// The site gateway mounts each game at /<game-name>, strips that prefix from
// req.url, and sends it as X-Forwarded-Prefix. Games render it into <base href>
// so their relative URLs resolve under the mount and still work standalone.
export function mountPrefix(req) {
  const prefix = String(req.headers["x-forwarded-prefix"] || "");
  return /^(\/[a-z0-9-]+)+$/.test(prefix) ? prefix : "";
}

export function withBase(html, req) {
  return html.replace('<base href="/" />', `<base href="${mountPrefix(req)}/" />`);
}
