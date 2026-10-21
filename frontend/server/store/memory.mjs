// In-memory store: nothing is persisted. Used by the contract tests.

import { config } from "../config.mjs";
import { seed } from "../data.mjs";
import { db, replaceDb } from "../state.mjs";

export function createMemoryStore({ demo = config.store.seedDemo || process.env.STORE === "memory" } = {}) {
  return {
    kind: "memory",
    async init() {
      replaceDb(seed({ demo }));
      db.meta = {};
    },
    saveRow() {},
    saveTable() {},
    async flush() {},
    status: () => ({ kind: "memory", ok: true, detail: "In memory. Restarting resets everything." }),
  };
}
