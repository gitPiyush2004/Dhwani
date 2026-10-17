// ---------------------------------------------------------------------------
// Contract test for the reference backend.
//
//   node server/test.mjs        or        npm run test:api
//
// Every assertion here maps to a line in docs/API-CONTRACT.md. Run it before
// and after changing the server, and keep it passing when you swap the store
// for Google Sheets.
// ---------------------------------------------------------------------------

import { createApiServer } from "./index.mjs";

const PORT = Number(process.env.TEST_PORT ?? 8788);
const base = `http://localhost:${PORT}`;
const server = createApiServer();
await new Promise((r) => server.listen(PORT, r));

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

const get = async (p) => {
  const r = await fetch(base + p);
  return { status: r.status, body: await r.json().catch(() => null) };
};

const send = async (method, p, body) => {
  const r = await fetch(base + p, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
};

/** Next Monday, so the doctor has hours and the slot is deterministic. */
const nextMonday = () => {
  const d = new Date();
  const delta = ((1 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};
const monday = nextMonday();

console.log("\n== read endpoints ==");
const health = await get("/health");
check("GET /health", health.status === 200 && health.body.ok === true);

const calls = await get("/api/calls");
check("GET /api/calls returns an array", Array.isArray(calls.body) && calls.body.length > 0);
check(
  "calls are newest first",
  new Date(calls.body[0].startedAt) >= new Date(calls.body[calls.body.length - 1].startedAt)
);

const filtered = await get("/api/calls?outcome=booked");
check(
  "GET /api/calls?outcome=booked filters",
  filtered.body.every((c) => c.outcome === "booked") && filtered.body.length > 0
);

const review = await get("/api/calls?needsReview=true");
check("GET /api/calls?needsReview=true returns only unresolved calls", review.body.every((c) => !c.resolved));

const doctors = await get("/api/doctors");
check("GET /api/doctors", doctors.body.length === 3);

const clinic = await get("/api/clinic");
check("GET /api/clinic has faqs and an agent block", clinic.body.faqs.length > 0 && !!clinic.body.agent);

const faqs = await get("/api/faqs");
check("GET /api/faqs is the agent's tool", Array.isArray(faqs.body) && faqs.body.length === 5);

const metrics = await get("/api/agent/metrics");
check(
  "GET /api/agent/metrics",
  typeof metrics.body.resolutionRate === "number" && Array.isArray(metrics.body.intents)
);

const stats = await get("/api/dashboard/stats");
check("GET /api/dashboard/stats", typeof stats.body.revenueRecovered === "number");

const perDay = await get("/api/dashboard/calls-per-day?days=7");
check("GET /api/dashboard/calls-per-day?days=7 returns 7 points", perDay.body.length === 7);

console.log("\n== slots, the tool that runs mid-call ==");
const day = await get(`/api/slots?doctorId=doc-sharma&date=${monday}`);
check(
  `GET /api/slots?doctorId&date=${monday} returns HH:mm`,
  Array.isArray(day.body.slots) && day.body.slots.every((s) => /^\d{2}:\d{2}$/.test(s))
);
const point = await get(
  `/api/slots?doctorId=doc-sharma&startsAt=${new Date(`${monday}T09:00:00`).toISOString()}`
);
check("GET /api/slots?doctorId&startsAt returns { available }", typeof point.body.available === "boolean");
const badDoctorSlots = await get("/api/slots?date=2026-01-01");
check("GET /api/slots without doctorId is 400", badDoctorSlots.status === 400);

console.log("\n== booking, and the double-booking guard ==");
const when = new Date(`${monday}T09:00:00`).toISOString();
const first = await send("POST", "/api/appointments", {
  patientName: "Test Patient",
  phone: "+91 90000 00001",
  doctorId: "doc-sharma",
  startsAt: when,
  reason: "Check-up",
  bookedBy: "ai",
});
check("POST /api/appointments books", first.status === 201 && first.body.status === "confirmed");

const second = await send("POST", "/api/appointments", {
  patientName: "Second Patient",
  phone: "+91 90000 00002",
  doctorId: "doc-sharma",
  startsAt: when,
  reason: "Check-up",
});
check("the same slot is rejected with 409", second.status === 409, `got ${second.status}`);

const unknownDoctor = await send("POST", "/api/appointments", {
  patientName: "X",
  phone: "+91 9",
  doctorId: "nope",
  startsAt: when,
});
check("an unknown doctor is 404", unknownDoctor.status === 404);

const missing = await send("POST", "/api/appointments", { patientName: "X" });
check("missing fields are 422", missing.status === 422);

const moved = await send("PATCH", `/api/appointments/${first.body.id}`, {
  startsAt: new Date(`${monday}T10:00:00`).toISOString(),
});
check("PATCH with a new time implies rescheduled", moved.status === 200 && moved.body.status === "rescheduled");

const back = await send("PATCH", `/api/appointments/${first.body.id}`, { startsAt: when });
check("PATCH back onto its own old slot is allowed", back.status === 200);

const cancelled = await send("PATCH", `/api/appointments/${first.body.id}`, { status: "cancelled" });
check("PATCH cancel clears whatsappSent", cancelled.body.status === "cancelled" && cancelled.body.whatsappSent === false);

console.log("\n== the Bolna post-call webhook ==");
const hook = await send("POST", "/api/calls/webhook", {
  callerName: "Webhook Tester",
  phone: "+91 90000 00003",
  durationSec: 74,
  language: "Hindi",
  outcome: "booked",
  intent: "New appointment",
  summary: "Booked a slot via the agent.",
  transcript: [
    { role: "agent", text: "Namaste!" },
    { role: "user", text: "Appointment chahiye" },
  ],
  extracted: { name: "Webhook Tester", slot: "Tomorrow, 10:30 AM" },
});
check("POST /api/calls/webhook saves the call", hook.status === 201 && hook.body.transcript.length === 2);
check(
  "speaker names are normalised to ai / patient",
  hook.body.transcript[0].speaker === "ai" && hook.body.transcript[1].speaker === "patient"
);
check("startSec is filled in when absent", hook.body.transcript.every((l) => typeof l.startSec === "number"));

const after = await get("/api/calls");
check("the new call appears in the log", after.body.some((c) => c.callerName === "Webhook Tester"));
check("and it sorts to the top", after.body[0].callerName === "Webhook Tester");

const emptyHook = await send("POST", "/api/calls/webhook");
check("a webhook with no body still saves the call", emptyHook.status === 201);

console.log("\n== writes from the dashboard ==");
const put = await send("PUT", "/api/clinic", { name: "API Wired Clinic" });
check("PUT /api/clinic", put.status === 200 && put.body.name === "API Wired Clinic");

const doctor = await send("POST", "/api/doctors", {
  name: "Dr. New",
  speciality: "Dentist",
  fee: 400,
  slotDurationMin: 20,
  availability: [],
});
check("POST /api/doctors", doctor.status === 201);
check("DELETE /api/doctors/:id returns 204", (await send("DELETE", `/api/doctors/${doctor.body.id}`)).status === 204);

const kb = await send("POST", "/api/knowledge", { title: "T", body: "B", source: "staff" });
check("POST /api/knowledge", kb.status === 201);
check("PATCH /api/knowledge/:id", (await send("PATCH", `/api/knowledge/${kb.body.id}`, { title: "T2" })).body.title === "T2");
check("DELETE /api/knowledge/:id returns 204", (await send("DELETE", `/api/knowledge/${kb.body.id}`)).status === 204);

check(
  "PATCH /api/campaigns/:id",
  (await send("PATCH", "/api/campaigns/camp-1", { status: "paused" })).body.status === "paused"
);
check(
  "PATCH /api/onboarding/:id",
  (await send("PATCH", "/api/onboarding/ob-4", { done: true })).body.done === true
);
check(
  "POST /api/agent/test escalates an emergency",
  (await send("POST", "/api/agent/test", { utterance: "Mere papa ko chest pain ho raha hai" })).body.verdict === "warn"
);

console.log("\n== error handling ==");
const missingCall = await get("/api/calls/nope");
check("an unknown call is 404 with { error }", missingCall.status === 404 && typeof missingCall.body.error === "string");
check("an unknown route is 404", (await get("/api/nothing-here")).status === 404);
const badJson = await fetch(`${base}/api/appointments`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{not json",
});
check("a malformed body is 400", badJson.status === 400);

console.log(`\n${pass} passed, ${fail} failed\n`);
server.close();
process.exit(fail ? 1 : 0);
