// ---------------------------------------------------------------------------
// Contract test for the reference backend.
//
//   node server/test.mjs        or        npm run test:api
//
// Every assertion here maps to a line in docs/API-CONTRACT.md. Run it before
// and after changing the server, and keep it passing when you swap the store
// for Google Sheets.
// ---------------------------------------------------------------------------

// Never touch real services from the tests: no .env, in-memory demo data.
process.env.SKIP_DOTENV = "1";
process.env.STORE = "memory";
const { createApiServer } = await import("./index.mjs");

const PORT = Number(process.env.TEST_PORT ?? 8788);
const base = `http://localhost:${PORT}`;
const server = createApiServer();
await new Promise((r) => server.listen(PORT, r));
await server.ready;

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

/** Next Monday in clinic time (IST), so the doctor has hours and the slot is deterministic. */
const nextMonday = () => {
  const d = new Date(Date.now() + 330 * 60_000);
  const delta = ((1 - d.getUTCDay() + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
const monday = nextMonday();
/** A clinic-time instant, independent of the machine's time zone. */
const ist = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

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
  `/api/slots?doctorId=doc-sharma&startsAt=${ist(monday, "09:00")}`
);
check("GET /api/slots?doctorId&startsAt returns { available }", typeof point.body.available === "boolean");
const badDoctorSlots = await get("/api/slots?date=2026-01-01");
check("GET /api/slots without doctorId is 400", badDoctorSlots.status === 400);

console.log("\n== booking, and the double-booking guard ==");
const when = ist(monday, "09:00");
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
  startsAt: ist(monday, "10:00"),
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


/* ===================================================================== */
/* Beyond the original contract: what makes it work on a real phone line */
/* ===================================================================== */

const { config } = await import("./config.mjs");
const { resolveDate, resolveTime } = await import("./time.mjs");
const { formatAvailability, parseAvailability } = await import("./store/schema.mjs");
const sendAuth = async (method, p, body, headers = {}) => {
  const r = await fetch(base + p, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
};

console.log("\n== understanding spoken dates and times (clinic time) ==");
check("'kal' is tomorrow", resolveDate("kal", "2026-10-21") === "2026-10-22");
check("'parso' is the day after tomorrow", resolveDate("parso", "2026-10-21") === "2026-10-23");
check("'Monday' is the next Monday", resolveDate("Monday", "2026-10-21") === "2026-10-26");
check("'somvar' is Monday too", resolveDate("somvar ko", "2026-10-21") === "2026-10-26");
check("'22 Oct' resolves", resolveDate("22 Oct", "2026-10-21") === "2026-10-22");
check("'5/1' rolls into next year", resolveDate("5/1", "2026-10-21") === "2027-01-05");
check("'5:30 pm' is 17:30", resolveTime("5:30 pm") === "17:30");
check("'shaam 5 baje' is 17:00", resolveTime("shaam 5 baje") === "17:00");
check("'saade 10' is 10:30", resolveTime("saade 10") === "10:30");
check("a bare '3' is 3 PM", resolveTime("3") === "15:00");
check("'10:30 AM' stays morning", resolveTime("10:30 AM") === "10:30");

const sampleDoctors = (await get("/api/doctors")).body;
check(
  "weekly availability round-trips through the Sheet's human format",
  sampleDoctors.every((d) => JSON.stringify(parseAvailability(formatAvailability(d.availability))) ===
    JSON.stringify([...d.availability].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))))
);
check("the human format reads well", formatAvailability(sampleDoctors[0].availability) === "Mon-Sat 09:00-13:00, 17:00-20:00");

console.log("\n== Bolna tools (called mid-call) ==");
const slotsTool = await get(`/api/bolna/tools/check_slots?doctor=${encodeURIComponent("Dr. Sharma")}&date=${monday}`);
check("check_slots understands 'Dr. Sharma'", slotsTool.status === 200 && slotsTool.body.ok && slotsTool.body.available_times.length > 0);
const childDoc = await get(`/api/bolna/tools/check_slots?doctor=${encodeURIComponent("bachchon ke doctor")}&date=${monday}`);
check("check_slots maps 'bachchon ke doctor' to the paediatrician", childDoc.body.doctor === "Dr. Imran Khan");
check("Dr. Khan does not work Mondays, so the next day is offered", childDoc.body.available_times.length === 0 && !!childDoc.body.next_available_date);

const toolBook = await send("POST", "/api/bolna/tools/book_appointment", {
  patient_name: "Asha Verma", phone: "98765 43210", doctor: "sharma", date: monday, time: "11:00 AM", reason: "Fever",
});
check("book_appointment books from spoken values", toolBook.body.ok === true && /^apt-/.test(toolBook.body.appointment_id));
const toolAgain = await send("POST", "/api/bolna/tools/book_appointment", {
  patient_name: "Ravi", phone: "9876500000", doctor: "Dr. Anil Sharma", date: monday, time: "11:00", reason: "Cough",
});
check("a taken slot comes back with alternatives, not a booking", toolAgain.body.ok === false && toolAgain.body.alternatives.length > 0);
const offHours = await send("POST", "/api/bolna/tools/book_appointment", {
  patient_name: "Ravi", phone: "9876500000", doctor: "sharma", date: monday, time: "3 pm", reason: "Cough",
});
check("the AI cannot book outside the doctor's hours", offHours.body.ok === false);
const placeholder = await send("POST", "/api/bolna/tools/book_appointment", {
  patient_name: "Ravi", phone: "{from_number}", doctor: "sharma", date: monday, time: "12:00", reason: "Cough",
});
check("an unfilled {from_number} is refused, so the agent asks for the number", placeholder.body.ok === false);
const found = await get("/api/bolna/tools/find_appointments?phone=%2B919876543210");
check("find_appointments matches +91 and spaced numbers", found.body.appointments?.some((a) => a.appointment_id === toolBook.body.appointment_id));
const moveTool = await send("POST", "/api/bolna/tools/reschedule_appointment", {
  appointment_id: toolBook.body.appointment_id, date: monday, time: "11:30",
});
check("reschedule_appointment moves it", moveTool.body.ok === true);
const info = await get("/api/bolna/tools/get_clinic_info?question=consultation%20fee");
check("get_clinic_info returns the fee FAQ first", /fee/i.test(info.body.faqs[0].q));
const cancelTool = await send("POST", "/api/bolna/tools/cancel_appointment", { appointment_id: toolBook.body.appointment_id });
check("cancel_appointment cancels it", cancelTool.body.ok === true);
check("an unknown tool is 404", (await get("/api/bolna/tools/nope")).status === 404);

console.log("\n== Bolna's native webhook ==");
const caller = "+919123456780";
const booked = await send("POST", "/api/bolna/tools/book_appointment", {
  patient_name: "Meena Kapoor", phone: caller, doctor: "sharma", date: monday, time: "12:00", reason: "Back pain",
});
const execution = {
  id: "exec-test-1",
  agent_id: "agent-1",
  status: "completed",
  conversation_duration: 95,
  initiated_at: new Date(Date.now() - 120_000).toISOString().replace("Z", ""),
  transcript:
    "assistant: Namaste! Sharma Family Clinic mein aapka swagat hai.\nuser: Mujhe Dr. Sharma ko dikhana hai.\nassistant: Kaunsa din?\nuser: Monday 12 baje.\nassistant: Book ho gaya.\n",
  telephony_data: { call_type: "inbound", from_number: caller, to_number: "+918000000000", recording_url: "https://example.com/rec.mp3", duration: 95 },
  summary: "Caller booked with Dr. Sharma.",
};
const hookRes = await send("POST", "/api/calls/webhook", execution);
check("a Bolna payload on /api/calls/webhook is recognised", hookRes.status === 200 && hookRes.body.outcome === "booked");
const logged = (await get("/api/calls")).body.find((c) => c.executionId === "exec-test-1");
check("the call is logged as booked from the booking evidence", logged?.outcome === "booked" && logged.resolved === true);
check("the caller's name comes from the booking", logged?.callerName === "Meena Kapoor");
check("the transcript is split into lines with timings", logged?.transcript.length === 5 && logged.transcript[4].startSec > 0);
check("the recording is served through our proxy", logged?.recordingUrl === `/api/calls/${logged?.id}/recording`);
await send("POST", "/api/calls/webhook", execution);
check("a repeated webhook does not duplicate the call", (await get("/api/calls")).body.filter((c) => c.executionId === "exec-test-1").length === 1);
check("booking evidence was the real appointment", booked.body.ok === true);

await send("POST", "/api/calls/webhook", { id: "exec-live", agent_id: "a", status: "in-progress", telephony_data: { call_type: "inbound", from_number: "+919000011111" } });
check("an in-progress call shows on the live board", (await get("/api/live-calls")).body.some((c) => c.id === "exec-live"));
await send("POST", "/api/calls/webhook", { id: "exec-live", agent_id: "a", status: "no-answer", transcript: "", telephony_data: { call_type: "inbound", from_number: "+919000011111" } });
check("and leaves it when the call ends", !(await get("/api/live-calls")).body.some((c) => c.id === "exec-live"));
check("an unanswered call is logged as missed and needs follow-up",
  (await get("/api/calls")).body.some((c) => c.executionId === "exec-live" && c.outcome === "missed" && c.needsFollowUp));

console.log("\n== shared secret for Bolna ==");
config.bolna.secret = "s3cret";
check("a tool call without the secret is refused", (await get(`/api/bolna/tools/check_slots?doctor=sharma&date=${monday}`)).status === 401);
check("with the secret as Bearer it works",
  (await sendAuth("GET", `/api/bolna/tools/check_slots?doctor=sharma&date=${monday}`, undefined, { Authorization: "Bearer s3cret" })).status === 200);
check("the webhook accepts ?token=", (await send("POST", "/api/bolna/webhook?token=s3cret", { id: "exec-x", status: "queued" })).status === 200);
config.bolna.secret = "";

console.log("\n== dashboard login ==");
config.auth.adminPassword = "pw";
config.auth.secret = "pw";
check("without a token the API refuses", (await get("/api/calls")).status === 401);
check("auth status says login is required", (await get("/api/auth/status")).body.required === true);
check("a wrong password is 401", (await send("POST", "/api/auth/login", { password: "nope" })).status === 401);
const session = await send("POST", "/api/auth/login", { password: "pw" });
check("the right password returns a token", typeof session.body?.token === "string" && session.body.token.length > 20);
check("the token opens the API", (await sendAuth("GET", "/api/calls", undefined, { Authorization: `Bearer ${session.body.token}` })).status === 200);
check("a tampered token is refused", (await sendAuth("GET", "/api/calls", undefined, { Authorization: `Bearer ${session.body.token}x` })).status === 401);
check("health stays public", (await get("/health")).status === 200);
config.auth.adminPassword = "";
config.auth.secret = "";

console.log("\n== agent, analytics ==");
const chatRes = await send("POST", "/api/agent/simulate", { message: "Consultation fee kitni hai?" });
check("the chat agent answers from real clinic data", chatRes.status === 200 && /500/.test(chatRes.body.reply));
check("'Call me' explains when the phone agent is not connected", (await send("POST", "/api/agent/call", { phone: "9876543210" })).status === 503);
const st = (await get("/api/dashboard/stats")).body;
check("stats trends are real numbers", Object.values(st.trends).every((v) => Number.isFinite(v)));
check("today's AI booking counts", st.appointmentsBooked >= 1);
const ob = (await get("/api/onboarding")).body;
check("the go-live checklist ticks configured steps", ob.find((x) => x.id === "ob-2").done === true && ob.find((x) => x.id === "ob-5").done === true);

console.log("\n== file storage survives a restart ==");
{
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "dhwani-"));
  config.store.dataFile = join(dir, "db.json");
  const { createFileStore } = await import("./store/file.mjs");
  const { db } = await import("./state.mjs");
  const snapshot = structuredClone(db);
  const a = createFileStore();
  await a.init();
  db.clinic.name = "Persisted Clinic";
  a.saveTable("clinic");
  await a.flush();
  db.clinic.name = "changed in memory";
  const b = createFileStore();
  await b.init();
  check("data written to disk is loaded back", db.clinic.name === "Persisted Clinic");
  Object.assign(db, snapshot);
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
server.close();
process.exit(fail ? 1 : 0);
