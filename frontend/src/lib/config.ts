// ---------------------------------------------------------------------------
// Runtime configuration.
//
// The app ships on mock data. Set VITE_API_BASE_URL (see .env.example) and
// every function in src/lib/api.ts goes to the network instead. Nothing else
// in the UI changes, because the return types are identical.
// ---------------------------------------------------------------------------

/** Base URL of the backend API, without a trailing slash. Empty means "use mocks". */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/** True when a live backend is configured. */
export const USE_LIVE_API = API_BASE_URL.length > 0;

/** Optional bearer token, sent as `Authorization: Bearer <token>`. */
export const API_KEY = import.meta.env.VITE_API_KEY ?? "";

/** How long a query stays fresh before React Query refetches it. */
export const STALE_TIME_MS = 30_000;
