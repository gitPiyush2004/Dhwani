import { API_BASE_URL, API_KEY } from "./config";

/** Thrown for any non-2xx response. `message` is safe to show in a toast. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* -------------------------------------------------------------------------
 * Session token from the login screen. Kept in localStorage so a refresh does
 * not sign the clinic out; every access is wrapped because storage can be
 * blocked (private windows, strict browser settings).
 * ---------------------------------------------------------------------- */

const TOKEN_KEY = "dhwani.token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the session lasts until the tab closes */
  }
}

/** Fired when the API says the session is no longer valid. */
export const AUTH_EXPIRED_EVENT = "dhwani:auth-expired";

function authHeaders(): Record<string, string> {
  const token = getToken() || API_KEY;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      "Could not reach the server. Check that the API is running and CORS is enabled.",
      0
    );
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      /* keep the default message */
    }
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      setToken("");
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(message, res.status);
  }
  return res;
}

/**
 * The single fetch wrapper used by src/lib/api.ts.
 * Backends should return JSON and use `{ "error": "..." }` for failures.
 */
export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await request(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Binary download (call recordings) with the same auth and errors. */
export async function httpBlob(path: string): Promise<Blob> {
  const res = await request(path, { headers: { "Content-Type": "" } });
  return res.blob();
}

/** Builds a query string, skipping empty values and the "all" sentinel. */
export function qs(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}
