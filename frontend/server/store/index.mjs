// ---------------------------------------------------------------------------
// Storage. Picks a backend and exposes one tiny interface to the routes:
//
//   await store.init()            load (or seed) the working copy in state.mjs
//   store.saveRow(table, record)  appointments, calls: persist one record
//   store.saveTable(table)        everything else: persist the whole table
//   store.status()                for GET /api/integrations
//
// Writes are fire-and-forget from the route's point of view: the in-memory
// copy is already updated, and the store queues the write, retries it, and
// reports failures in status() rather than failing the request.
// ---------------------------------------------------------------------------

import { config, integrations } from "../config.mjs";
import { createMemoryStore } from "./memory.mjs";
import { createFileStore } from "./file.mjs";
import { createSheetsStore } from "./sheets.mjs";

function pickKind() {
  const k = config.store.kind.toLowerCase();
  if (k === "memory" || k === "file" || k === "sheets") return k;
  return integrations.sheets() ? "sheets" : "file";
}

export function createStore(kind = pickKind()) {
  if (kind === "sheets") {
    if (!integrations.sheets()) {
      throw new Error("STORE=sheets needs SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON (or EMAIL + PRIVATE_KEY)");
    }
    return createSheetsStore();
  }
  if (kind === "memory") return createMemoryStore();
  return createFileStore();
}
