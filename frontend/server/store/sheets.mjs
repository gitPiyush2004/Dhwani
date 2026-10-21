// ---------------------------------------------------------------------------
// Google Sheets store: the clinic's spreadsheet is the system of record.
//
//   * On startup the tabs are created if missing, headers are written or
//     extended, and everything is loaded into the working copy (state.mjs).
//     An empty spreadsheet is seeded with the clinic's starting configuration.
//   * Writes are queued and applied in order. Appointments and calls are
//     upserted row by row, touching only our own columns, so a column the
//     clinic added by hand is never overwritten. Small tabs (doctors, FAQs,
//     clinic, knowledge, campaigns, settings) are rewritten whole.
//   * Every SHEETS_REFRESH_SEC the sheet is re-read so edits made directly in
//     Google Sheets (a doctor's new hours, say) reach the agent. A refresh is
//     discarded if any write happened while it was in flight.
//
// Concurrency: this process is the only writer and the double-booking guard
// runs on the in-memory copy, so run exactly one instance of the API.
// ---------------------------------------------------------------------------

import { config } from "../config.mjs";
import { makeId, seed } from "../data.mjs";
import { db, replaceDb } from "../state.mjs";
import { createGoogleAuth } from "./google-auth.mjs";
import { TABS } from "./schema.mjs";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const META_TABLES = new Set(["meta", "onboarding", "savedViews", "usage"]);

const colLetter = (i) => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
const range = (tab, a1) => `'${tab}'!${a1}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSheetsStore() {
  const { id: sheetId, credentials, refreshSec } = config.sheets;
  const getToken = createGoogleAuth(credentials, SCOPES);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

  /** Actual header order per tab, as found in the sheet. */
  const headers = {};
  /** Last raw row per id, to preserve columns we do not own on rewrite. */
  const rawById = {};
  /** Pending writes, keyed so repeated saves of one record coalesce. */
  const queue = new Map();
  let running = false;
  let writeGeneration = 0;
  let lastError = null;
  let lastSyncAt = null;
  let refreshTimer = null;

  async function api(path, init = {}, attempt = 0) {
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${await getToken()}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      if (attempt < 3) {
        await sleep(1000 * 3 ** attempt);
        return api(path, init, attempt + 1);
      }
      throw err;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1000 * 3 ** attempt);
      return api(path, init, attempt + 1);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(
        res.status === 403 || res.status === 404
          ? `Google Sheets refused access (${msg}). Share the sheet with ${credentials.email} as an Editor and check SHEET_ID.`
          : `Google Sheets error: ${msg}`
      );
    }
    return body;
  }

  const batchGet = (ranges, extra = "") =>
    api(
      `/values:batchGet?${ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&")}` +
        `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING${extra}`
    );

  const putValues = (a1, values) =>
    api(`/values/${encodeURIComponent(a1)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values }),
    });

  /* --- schema ---------------------------------------------------------- */

  async function ensureTabs() {
    const meta = await api(`?fields=sheets.properties.title`);
    const existing = new Set((meta.sheets ?? []).map((s) => s.properties.title));
    const missing = Object.keys(TABS).filter((t) => !existing.has(t));
    if (missing.length) {
      await api(":batchUpdate", {
        method: "POST",
        body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }),
      });
      console.log(`[store:sheets] created tabs: ${missing.join(", ")}`);
    }

    const tabs = Object.keys(TABS);
    const res = await batchGet(tabs.map((t) => range(t, "1:1")));
    for (const [i, tab] of tabs.entries()) {
      const found = (res.valueRanges?.[i]?.values?.[0] ?? []).map((h) => String(h).trim().toLowerCase());
      const wanted = TABS[tab].headers;
      if (!found.length) {
        headers[tab] = [...wanted];
        await putValues(range(tab, "A1"), [wanted]);
        continue;
      }
      const add = wanted.filter((h) => !found.includes(h));
      headers[tab] = [...found, ...add];
      if (add.length) {
        await putValues(range(tab, `${colLetter(found.length)}1`), [add]);
        console.log(`[store:sheets] added columns to ${tab}: ${add.join(", ")}`);
      }
    }
  }

  /* --- reading --------------------------------------------------------- */

  async function readAll() {
    const tabs = Object.keys(TABS);
    const res = await batchGet(tabs.map((t) => range(t, "A1:ZZ")));
    const out = {};
    for (const [i, tab] of tabs.entries()) {
      const [head = [], ...rows] = res.valueRanges?.[i]?.values ?? [];
      const keys = head.map((h) => String(h).trim().toLowerCase());
      if (keys.length) headers[tab] = keys;
      out[tab] = rows
        .map((cells, idx) => {
          const obj = {};
          keys.forEach((k, c) => (obj[k] = cells[c] ?? ""));
          return { rowNumber: idx + 2, obj };
        })
        .filter(({ obj }) => Object.values(obj).some((v) => String(v).trim() !== ""));
    }
    return out;
  }

  /** Builds the working copy from sheet rows. Returns fixes to write back. */
  function toData(sheet) {
    const fixes = [];
    const rows = (tab) => sheet[tab] ?? [];

    for (const tab of Object.keys(TABS)) rawById[tab] = new Map();

    const rowTable = (tab, prefix) =>
      rows(tab).map(({ rowNumber, obj }) => {
        const rec = TABS[tab].fromRow(obj);
        if (!rec.id) {
          rec.id = makeId(prefix);
          fixes.push({ tab, rowNumber, id: rec.id });
        }
        rawById[tab].set(rec.id, obj);
        return rec;
      });

    const appointments = rowTable("Appointments", "apt")
      .filter((a) => a.startsAt && a.doctorId)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    const calls = rowTable("Calls", "call").sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

    const smallTable = (tab, prefix) => {
      let dirty = false;
      const out = rows(tab).map(({ obj }) => {
        const rec = TABS[tab].fromRow(obj);
        if (!rec.id) {
          rec.id = makeId(prefix);
          dirty = true;
        }
        rawById[tab].set(rec.id, obj);
        return rec;
      });
      if (dirty) fixes.push({ table: TABS[tab].table });
      return out;
    };

    const doctors = smallTable("Doctors", "doc").filter((d) => d.name);
    const faqs = smallTable("FAQs", "faq").filter((f) => f.question);
    const knowledge = smallTable("Knowledge", "kb").filter((k) => k.title);
    const campaigns = smallTable("Campaigns", "camp").filter((c) => c.name);

    const meta = {};
    for (const { obj } of rows("Settings")) {
      const key = String(obj.key ?? "").trim();
      if (!key) continue;
      try {
        meta[key] = JSON.parse(obj.value);
      } catch {
        meta[key] = obj.value;
      }
    }

    const clinicRow = rows("Clinic")[0];
    const defaults = seed({ demo: false });
    let clinic = null;
    if (clinicRow) {
      const c = TABS.Clinic.fromRow(clinicRow.obj);
      clinic = {
        ...defaults.clinic,
        ...c,
        languages: c.languages.length ? c.languages : defaults.clinic.languages,
        escalation: {
          phone: c.escalation.phone,
          triggers: c.escalation.triggers.length ? c.escalation.triggers : defaults.clinic.escalation.triggers,
        },
        agent: { ...defaults.clinic.agent, ...(c.agent ?? {}) },
        faqs,
      };
    }

    const { onboarding, savedViews, usage, ...rest } = meta;
    return {
      fixes,
      data: {
        clinic,
        doctors,
        faqs,
        appointments,
        calls,
        knowledge,
        campaigns,
        onboarding: Array.isArray(onboarding) ? onboarding : defaults.onboarding,
        savedViews: Array.isArray(savedViews) ? savedViews : defaults.savedViews,
        usage: usage && typeof usage === "object" ? usage : defaults.usage,
        meta: rest,
      },
    };
  }

  function apply(data) {
    replaceDb({
      clinic: data.clinic,
      doctors: data.doctors,
      appointments: data.appointments,
      calls: data.calls,
      knowledge: data.knowledge,
      campaigns: data.campaigns,
      onboarding: data.onboarding,
      savedViews: data.savedViews,
      usage: data.usage,
      meta: data.meta,
      liveCalls: db.liveCalls,
    });
  }

  /* --- writing --------------------------------------------------------- */

  const align = (tab, row, raw = {}) => headers[tab].map((h) => (h in row ? row[h] ?? "" : raw[h] ?? ""));

  function recordsFor(tab) {
    switch (tab) {
      case "Doctors":
        return db.doctors;
      case "FAQs":
        return db.clinic?.faqs ?? [];
      case "Knowledge":
        return db.knowledge;
      case "Campaigns":
        return db.campaigns;
      case "Clinic":
        return db.clinic ? [db.clinic] : [];
      case "Appointments":
        return db.appointments;
      case "Calls":
        return db.calls;
      default:
        return [];
    }
  }

  async function writeTable(tab) {
    let rows;
    if (tab === "Settings") {
      const meta = { ...db.meta, onboarding: db.onboarding, savedViews: db.savedViews, usage: db.usage };
      rows = Object.entries(meta).map(([key, value]) => align(tab, { key, value: JSON.stringify(value) }));
    } else {
      const spec = TABS[tab];
      rows = recordsFor(tab).map((r) => align(tab, spec.toRow(r), rawById[tab]?.get(r.id)));
    }
    await putValues(range(tab, "A1"), [headers[tab], ...rows]);
    await api(`/values/${encodeURIComponent(range(tab, `A${rows.length + 2}:ZZ`))}:clear`, {
      method: "POST",
      body: "{}",
    });
  }

  async function upsertRow(tab, record) {
    const spec = TABS[tab];
    const row = spec.toRow(record);
    const idCol = colLetter(headers[tab].indexOf("id"));
    const ids = await batchGet([range(tab, `${idCol}:${idCol}`)]);
    const column = ids.valueRanges?.[0]?.values ?? [];
    const index = column.findIndex((cells, i) => i > 0 && String(cells?.[0] ?? "") === record.id);

    if (index === -1) {
      await api(
        `/values/${encodeURIComponent(range(tab, "A1"))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: [align(tab, row)] }) }
      );
      return;
    }
    // Update only the columns we own, one cell range each, in one request.
    const rowNumber = index + 1;
    const data = Object.entries(row)
      .map(([h, v]) => [headers[tab].indexOf(h), v])
      .filter(([c]) => c >= 0)
      .map(([c, v]) => ({ range: range(tab, `${colLetter(c)}${rowNumber}`), values: [[v ?? ""]] }));
    await api("/values:batchUpdate", {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.size) {
        const [key, task] = queue.entries().next().value;
        queue.delete(key);
        try {
          await task();
          lastSyncAt = new Date().toISOString();
          lastError = null;
        } catch (err) {
          lastError = err.message;
          console.error(`[store:sheets] ${key} failed:`, err.message);
        }
      }
    } finally {
      running = false;
    }
  }

  function enqueue(key, task) {
    writeGeneration += 1;
    queue.set(key, task);
    void drain();
  }

  function saveTable(table) {
    if (META_TABLES.has(table)) return enqueue("Settings:*", () => writeTable("Settings"));
    if (table === "clinic") {
      enqueue("Clinic:*", () => writeTable("Clinic"));
      enqueue("FAQs:*", () => writeTable("FAQs"));
      return;
    }
    const tab = Object.keys(TABS).find((t) => TABS[t].table === table);
    if (tab) enqueue(`${tab}:*`, () => writeTable(tab));
  }

  function saveRow(table, record) {
    const tab = table === "appointments" ? "Appointments" : table === "calls" ? "Calls" : null;
    if (!tab) return saveTable(table);
    enqueue(`${tab}:${record.id}`, () => upsertRow(tab, record));
  }

  async function refresh() {
    if (running || queue.size) return;
    const generation = writeGeneration;
    try {
      const { data } = toData(await readAll());
      if (generation !== writeGeneration || running || queue.size) return;
      if (data.clinic) apply(data);
      lastSyncAt = new Date().toISOString();
      lastError = null;
    } catch (err) {
      lastError = err.message;
      console.error("[store:sheets] refresh failed:", err.message);
    }
  }

  return {
    kind: "sheets",
    async init() {
      await ensureTabs();
      const { data, fixes } = toData(await readAll());

      if (!data.clinic) {
        // A fresh spreadsheet: seed the clinic's starting configuration.
        const seeded = seed({ demo: config.store.seedDemo });
        replaceDb({ ...seeded, meta: data.meta, liveCalls: [] });
        for (const tab of Object.keys(TABS)) await writeTable(tab);
        console.log("[store:sheets] seeded an empty spreadsheet");
      } else {
        apply(data);
        for (const fix of fixes) {
          if (fix.table) saveTable(fix.table);
          else {
            const col = colLetter(headers[fix.tab].indexOf("id"));
            enqueue(`${fix.tab}:fix:${fix.rowNumber}`, () =>
              putValues(range(fix.tab, `${col}${fix.rowNumber}`), [[fix.id]])
            );
          }
        }
        console.log(
          `[store:sheets] loaded ${db.doctors.length} doctors, ${db.appointments.length} appointments, ${db.calls.length} calls`
        );
      }
      lastSyncAt = new Date().toISOString();

      if (refreshSec > 0) {
        refreshTimer = setInterval(() => void refresh(), refreshSec * 1000);
        refreshTimer.unref?.();
      }
    },
    saveRow,
    saveTable,
    refresh,
    async flush() {
      await drain();
      while (running) await sleep(50);
    },
    status: () => ({
      kind: "sheets",
      ok: !lastError,
      detail: lastError ?? "Connected to Google Sheets",
      lastSyncAt,
      pending: queue.size,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      serviceAccount: credentials.email,
    }),
  };
}
