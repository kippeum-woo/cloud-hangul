// Who is asking. The site has no sign-in yet, so every visitor gets a stable
// anonymous identity issued by the server: a random secret in an HttpOnly
// cookie. Messages and activity only ever see the public id derived from it.
//
// Limits of anonymous deduplication (prototype): one person with two browsers,
// a private window, or cleared cookies counts as two visitors; several people
// sharing one browser profile count as one. Tabs and refreshes in the same
// browser share the cookie, so they never multiply the count. When real
// sign-in exists, resolve the account id first in identify() and derive the
// visitor id from it, so ownership follows the account across devices.
import crypto from "node:crypto";
import { mountPrefix } from "./mount.js";

const COOKIE = "ch_vid";
const MAX_AGE_S = 400 * 24 * 3600;

export const publicId = (token) => crypto.createHash("sha256").update(`cloud-hangul:${token}`).digest("hex").slice(0, 20);
export const validToken = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(t);

function readCookie(req) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) {
      const v = decodeURIComponent(part.slice(i + 1).trim());
      return validToken(v) ? v : null;
    }
  }
  return null;
}

// Returns { token, id } or null. With create, issues a new identity (or adopts
// the token a browser generated before identities moved to the server, so
// messages it already published stay deletable) and sets the cookie on res.
export function identify(req, res, { create = false } = {}) {
  let token = readCookie(req);
  if (!token && create) {
    const legacy = req.headers["x-cloud-owner"];
    token = validToken(legacy) ? legacy : crypto.randomBytes(18).toString("base64url");
    const secure = req.headers["x-forwarded-proto"] === "https" || req.socket?.encrypted;
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${token}; Path=${mountPrefix(req) || ""}/; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
    );
  }
  return token ? { token, id: publicId(token) } : null;
}
