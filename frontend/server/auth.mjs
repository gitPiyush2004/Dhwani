// ---------------------------------------------------------------------------
// Dashboard login and request authentication.
//
//   * ADMIN_PASSWORD unset: the API is open (local development).
//   * ADMIN_PASSWORD set: the dashboard logs in with it and gets a signed,
//     expiring token; every /api route then needs `Authorization: Bearer`.
//   * Bolna's tools and webhook authenticate with BOLNA_SECRET instead.
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.mjs";

const sign = (payload) => createHmac("sha256", config.auth.secret).update(payload).digest("base64url");

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export const authRequired = () => Boolean(config.auth.adminPassword);

export function login(password) {
  if (!authRequired()) return { token: "", expiresAt: null };
  if (!safeEqual(password ?? "", config.auth.adminPassword)) return null;
  const expiresAt = Date.now() + config.auth.tokenTtlHours * 3600_000;
  const payload = Buffer.from(JSON.stringify({ sub: "admin", exp: expiresAt })).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expiresAt).toISOString() };
}

export function verifyToken(token) {
  const [payload, sig] = String(token ?? "").split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

const bearer = (req) => /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1]?.trim() ?? "";

/** Dashboard routes. */
export const isAdmin = (req) => !authRequired() || verifyToken(bearer(req));

/** Bolna tool calls (Bearer) and webhooks (?token=). Open when no secret is set. */
export function isBolna(req, url) {
  const secret = config.bolna.secret;
  if (!secret) return !authRequired();
  return safeEqual(bearer(req), secret) || safeEqual(url.searchParams.get("token") ?? "", secret);
}
