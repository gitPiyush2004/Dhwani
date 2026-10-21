// ---------------------------------------------------------------------------
// Google service-account auth without the googleapis package.
// Signs a JWT with the service account's private key and swaps it for an
// OAuth access token, cached until shortly before it expires.
// ---------------------------------------------------------------------------

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const b64url = (input) => Buffer.from(input).toString("base64url");

export function createGoogleAuth({ email, privateKey }, scopes) {
  let cached = null;

  return async function getAccessToken() {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
      JSON.stringify({ iss: email, scope: scopes.join(" "), aud: TOKEN_URL, iat: now, exp: now + 3600 })
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    const assertion = `${header}.${claims}.${signer.sign(privateKey).toString("base64url")}`;

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new Error(
        `Google auth failed (${res.status}): ${body.error_description ?? body.error ?? "no token"}`
      );
    }
    cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return cached.token;
  };
}
