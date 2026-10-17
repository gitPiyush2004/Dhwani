/// <reference types="vite/client" />

/**
 * Environment variables the app understands. See .env.example.
 * Anything starting with VITE_ is embedded in the client bundle, so never put
 * a secret here.
 */
interface ImportMetaEnv {
  /** Base URL of the backend API. Empty or unset means "use mock data". */
  readonly VITE_API_BASE_URL?: string;
  /** Optional bearer token sent as `Authorization: Bearer <token>`. */
  readonly VITE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
