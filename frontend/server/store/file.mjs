// ---------------------------------------------------------------------------
// JSON file store. The whole working copy is written to one file, debounced,
// atomically (write to a temp file, then rename). Good for local development
// and a single small clinic on a host with a persistent disk. On Render or
// Railway free tiers the disk is wiped on deploy, so use Google Sheets there.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.mjs";
import { seed } from "../data.mjs";
import { db, replaceDb } from "../state.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export function createFileStore() {
  const file = config.store.dataFile || join(here, "..", ".data", "db.json");
  let timer = null;
  let lastError = null;
  let lastSyncAt = null;

  const write = () => {
    timer = null;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const { liveCalls: _live, ...persisted } = db;
      writeFileSync(`${file}.tmp`, JSON.stringify(persisted, null, 2));
      renameSync(`${file}.tmp`, file);
      lastSyncAt = new Date().toISOString();
      lastError = null;
    } catch (err) {
      lastError = err.message;
      console.error("[store:file] write failed:", err);
    }
  };

  const schedule = () => {
    if (!timer) timer = setTimeout(write, 250);
  };

  return {
    kind: "file",
    async init() {
      if (existsSync(file)) {
        replaceDb({ ...JSON.parse(readFileSync(file, "utf8")), liveCalls: [] });
        console.log(`[store:file] loaded ${file}`);
      } else {
        replaceDb(seed({ demo: config.store.seedDemo }));
        write();
        console.log(`[store:file] created ${file}`);
      }
    },
    saveRow: schedule,
    saveTable: schedule,
    async flush() {
      if (timer) {
        clearTimeout(timer);
        write();
      }
    },
    status: () => ({
      kind: "file",
      ok: !lastError,
      detail: lastError ?? `Saved to ${file}`,
      lastSyncAt,
    }),
  };
}
