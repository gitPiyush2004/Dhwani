// ---------------------------------------------------------------------------
// Google Sheets store test, against an in-process fake of the Sheets API.
//
//   node server/test.sheets.mjs        or        npm run test:sheets
//
// Covers what goes wrong in real life: seeding an empty sheet, upserting
// without duplicate rows, not clobbering a column the clinic added by hand,
// picking up a doctor's hours edited directly in the sheet, and giving ids to
// rows a human typed in.
// ---------------------------------------------------------------------------

import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.SKIP_DOTENV = "1";
process.env.SHEET_ID = "fake-sheet";
process.env.SHEETS_REFRESH_SEC = "0";
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "test@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});

/* --- a fake Sheets API ------------------------------------------------- */

const tabs = new Map(); // title -> string[][]
const calls = [];
const col = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function parseRange(a1) {
  const m = /^'?(.+?)'?!(.+)$/.exec(decodeURIComponent(a1));
  const [, tab, ref] = m;
  const [from, to] = ref.split(":");
  const cell = (s) => {
    const r = /^([A-Z]*)(\d*)$/.exec(s ?? "");
    return { c: r?.[1] ? col(r[1]) : null, r: r?.[2] ? Number(r[2]) - 1 : null };
  };
  return { tab, from: cell(from), to: cell(to ?? from) };
}

function read({ tab, from, to }) {
  const grid = tabs.get(tab) ?? [];
  const r0 = from.r ?? 0;
  const r1 = to.r ?? grid.length - 1;
  const c0 = from.c ?? 0;
  const c1 = to.c ?? 701;
  const out = [];
  for (let r = r0; r <= Math.min(r1, grid.length - 1); r++) {
    const row = (grid[r] ?? []).slice(c0, c1 + 1);
    while (row.length && (row[row.length - 1] === "" || row[row.length - 1] === undefined)) row.pop();
    out.push(row);
  }
  while (out.length && !out[out.length - 1].length) out.pop();
  return out;
}

function write({ tab, from }, values) {
  const grid = tabs.get(tab);
  values.forEach((row, i) => {
    const r = (from.r ?? 0) + i;
    grid[r] = grid[r] ?? [];
    row.forEach((v, j) => (grid[r][(from.c ?? 0) + j] = v));
  });
}

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method ?? "GET";
  const body = init.body && typeof init.body === "string" ? JSON.parse(init.body || "{}") : null;
  if (url.hostname === "oauth2.googleapis.com") return reply({ access_token: "tok", expires_in: 3600 });
  if (url.hostname !== "sheets.googleapis.com") return realFetch(input, init);
  calls.push(`${method} ${url.pathname.split("fake-sheet")[1]}`);

  const path = decodeURIComponent(url.pathname.split("/spreadsheets/fake-sheet")[1]);
  if (path === "" && method === "GET") return reply({ sheets: [...tabs.keys()].map((title) => ({ properties: { title } })) });
  if (path === ":batchUpdate") {
    for (const r of body.requests) tabs.set(r.addSheet.properties.title, []);
    return reply({});
  }
  if (path === "/values:batchGet") {
    return reply({ valueRanges: url.searchParams.getAll("ranges").map((r) => ({ values: read(parseRange(r)) })) });
  }
  if (path === "/values:batchUpdate") {
    for (const d of body.data) write(parseRange(d.range), d.values);
    return reply({});
  }
  const m = /^\/values\/(.+?)(:append|:clear)?$/.exec(path);
  if (m) {
    const range = parseRange(m[1]);
    const grid = tabs.get(range.tab);
    if (m[2] === ":append") {
      let last = grid.length - 1;
      while (last >= 0 && !(grid[last] ?? []).some((v) => v !== "" && v !== undefined)) last--;
      write({ tab: range.tab, from: { r: last + 1, c: 0 } }, body.values);
      return reply({});
    }
    if (m[2] === ":clear") {
      grid.length = Math.min(grid.length, range.from.r ?? 0);
      return reply({});
    }
    write(range, body.values);
    return reply({});
  }
  return reply({ error: { message: `fake: unhandled ${method} ${path}` } }, 400);
};

/* --- tests ----------------------------------------------------------- */

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) {
    pass += 1;
    console.log("  PASS", name);
  } else {
    fail += 1;
    console.log("  FAIL", name, extra);
  }
};

const { createSheetsStore } = await import("./store/sheets.mjs");
const { db } = await import("./state.mjs");
const domain = await import("./domain.mjs");
const header = (tab) => tabs.get(tab)[0];
const rowsOf = (tab) => tabs.get(tab).slice(1).filter((r) => r.some((v) => v !== "" && v !== undefined));
const cell = (tab, row, name) => row[header(tab).indexOf(name)];

console.log("\n== an empty spreadsheet is set up and seeded ==");
let store = createSheetsStore();
domain.useStore(store);
await store.init();
check("all eight tabs exist", ["Appointments", "Calls", "Doctors", "FAQs", "Clinic", "Knowledge", "Campaigns", "Settings"].every((t) => tabs.has(t)));
check("Appointments starts with the plan's columns", header("Appointments").slice(0, 8).join("|") === "id|patient|phone|doctor|start time|status|booked by|whatsapp sent");
check("Calls starts with the plan's columns", header("Calls").slice(0, 9).join("|") === "id|phone|time|duration|language|outcome|summary|transcript|follow-up flag");
check("three doctors were written", rowsOf("Doctors").length === 3);
check("hours are human readable in the sheet", cell("Doctors", rowsOf("Doctors")[0], "weekly availability") === "Mon-Sat 09:00-13:00, 17:00-20:00");
check("the clinic row was written", cell("Clinic", rowsOf("Clinic")[0], "name") === "Sharma Family Clinic");
check("no invented calls in a real clinic's sheet", rowsOf("Calls").length === 0);

console.log("\n== appointments are upserted, never duplicated ==");
const monday = (() => {
  const d = new Date(Date.now() + 330 * 60_000);
  d.setUTCDate(d.getUTCDate() + (((1 - d.getUTCDay() + 7) % 7) || 7));
  return d.toISOString().slice(0, 10);
})();
const res = domain.createAppointment({
  patientName: "Sheet Patient",
  phone: "+91 98765 43210",
  doctorId: "doc-sharma",
  startsAt: new Date(`${monday}T09:30:00+05:30`).toISOString(),
  reason: "Check-up",
  bookedBy: "ai",
});
await store.flush();
check("a booking appends one row", rowsOf("Appointments").length === 1 && cell("Appointments", rowsOf("Appointments")[0], "patient") === "Sheet Patient");
check("start time is stored as ISO text", cell("Appointments", rowsOf("Appointments")[0], "start time") === res.appointment.startsAt);

// The clinic adds its own column and writes in it.
const apts = tabs.get("Appointments");
apts[0].push("notes");
apts[1][apts[0].length - 1] = "VIP, call before";

domain.updateAppointment(res.appointment.id, { startsAt: new Date(`${monday}T10:00:00+05:30`).toISOString() });
await store.flush();
check("an update rewrites the same row", rowsOf("Appointments").length === 1);
check("the status changed to rescheduled", cell("Appointments", rowsOf("Appointments")[0], "status") === "rescheduled");
check("the clinic's own column survived", cell("Appointments", rowsOf("Appointments")[0], "notes") === "VIP, call before");

console.log("\n== edits made directly in Google Sheets reach the agent ==");
const doctorsGrid = tabs.get("Doctors");
const khanRow = doctorsGrid.findIndex((r) => r[header("Doctors").indexOf("id")] === "doc-khan");
doctorsGrid[khanRow][header("Doctors").indexOf("weekly availability")] = "Mon, Wed 10:00-12:00";
doctorsGrid[khanRow][header("Doctors").indexOf("fee")] = "₹750";
await store.refresh();
const khan = db.doctors.find((d) => d.id === "doc-khan");
check("new hours are picked up", JSON.stringify(khan.availability) === JSON.stringify([{ day: 1, start: "10:00", end: "12:00" }, { day: 3, start: "10:00", end: "12:00" }]));
check("a fee typed as ₹750 reads as 750", khan.fee === 750);

console.log("\n== rows a human typed in get ids ==");
const h = header("Appointments");
const typed = Array(h.length).fill("");
typed[h.indexOf("patient")] = "Walk In";
typed[h.indexOf("phone")] = "9811122233";
typed[h.indexOf("doctor")] = "doc-sharma";
typed[h.indexOf("start time")] = `${monday.split("-").reverse().join("/")} 11:00`;
typed[h.indexOf("status")] = "confirmed";
typed[h.indexOf("booked by")] = "staff";
tabs.get("Appointments").push(typed);

store = createSheetsStore();
domain.useStore(store);
await store.init();
await store.flush();
const walkIn = db.appointments.find((a) => a.patientName === "Walk In");
check("the typed row loads", Boolean(walkIn));
check("its dd/mm/yyyy time is read as IST", walkIn?.startsAt === new Date(`${monday}T11:00:00+05:30`).toISOString());
check("an id was written back to the sheet", rowsOf("Appointments").some((r) => cell("Appointments", r, "patient") === "Walk In" && /^apt-/.test(cell("Appointments", r, "id"))));
check("the double-booking guard sees it", domain.slotTaken("doc-sharma", walkIn?.startsAt));

console.log("\n== calls ==");
const { saveCall } = await import("./calls.mjs");
saveCall({
  id: "call-sheet-1",
  callerName: "Caller",
  phone: "+919811122233",
  startedAt: new Date().toISOString(),
  durationSec: 42,
  language: "Hinglish",
  outcome: "faq",
  sentiment: "neutral",
  summary: "Asked about timings.",
  transcript: [{ speaker: "ai", text: "Namaste", startSec: 0 }, { speaker: "patient", text: "Timing?", startSec: 3 }],
  extracted: {},
  needsFollowUp: false,
  recordingUrl: "",
  intent: "Clinic question",
  resolved: true,
  confidence: 0.9,
  tags: ["hinglish"],
  aiActions: ["Answered"],
});
await store.flush();
const callRow = rowsOf("Calls").find((r) => cell("Calls", r, "id") === "call-sheet-1");
check("a call is written with its duration in seconds", callRow && cell("Calls", callRow, "duration") === 42);
check("the transcript is a JSON cell", JSON.parse(cell("Calls", callRow, "transcript")).length === 2);
check("the store reports healthy", store.status().ok === true && store.status().pending === 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
