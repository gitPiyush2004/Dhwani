// ---------------------------------------------------------------------------
// AawazDoc / ClinicVaani reference backend
//
// A zero-dependency Node server that implements the API contract in
// docs/API-CONTRACT.md. It exists so the frontend and the Bolna voice agent can
// be pointed at something real on day 1, before Google Sheets is wired up.
//
//   node server/index.mjs              # http://localhost:8787
//   PORT=9000 node server/index.mjs
//
// Then, in the frontend, set VITE_API_BASE_URL=http://localhost:8787 and every
// screen runs on live data.
//
// Storage is in memory, seeded from ./data.mjs. Every place that must become a
// Google Sheets call is marked with  TODO(sheets):  so the backend team can
// find them with a search.
// ---------------------------------------------------------------------------

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { seed, makeId } from "./data.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim());

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

// TODO(sheets): replace this object with reads/writes against the Sheet tabs
// Appointments, Calls, Doctors, FAQs and Clinic.
const db = seed();

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
};

const noContent = (res) => {
  res.writeHead(204);
  res.end();
};

const fail = (res, status, error, extra = {}) => json(res, status, { error, ...extra });

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Minutes-from-midnight for "HH:mm". */
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

/**
 * The double-booking guard. A slot is taken when the same doctor already has a
 * live appointment at that exact instant. Everything that writes an appointment
 * must go through this.
 */
function slotTaken(doctorId, startsAt, ignoreId) {
  const t = new Date(startsAt).getTime();
  return db.appointments.some(
    (a) =>
      a.id !== ignoreId &&
      a.doctorId === doctorId &&
      a.status !== "cancelled" &&
      new Date(a.startsAt).getTime() === t
  );
}

/** Free "HH:mm" slots for a doctor on a calendar day, honouring their hours. */
function freeSlots(doctorId, date) {
  const doctor = db.doctors.find((d) => d.id === doctorId);
  if (!doctor) return null;
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const out = [];
  for (const block of doctor.availability.filter((b) => b.day === weekday)) {
    const end = toMinutes(block.end);
    let t = toMinutes(block.start);
    while (t + doctor.slotDurationMin <= end) {
      const hh = String(Math.floor(t / 60)).padStart(2, "0");
      const mm = String(t % 60).padStart(2, "0");
      const iso = new Date(`${date}T${hh}:${mm}:00`).toISOString();
      if (!slotTaken(doctorId, iso)) out.push(`${hh}:${mm}`);
      t += doctor.slotDurationMin;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Routes                                                             */
/* ------------------------------------------------------------------ */

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

/* --- health -------------------------------------------------------- */

route("GET", /^\/health$/, (_req, res) =>
  json(res, 200, { ok: true, service: "clinicvaani-api", time: new Date().toISOString() })
);

/* --- live calls ---------------------------------------------------- */

route("GET", /^\/api\/live-calls$/, (_req, res) => json(res, 200, db.liveCalls));

route("POST", /^\/api\/live-calls\/([^/]+)\/takeover$/, (req, res, [id]) => {
  db.liveCalls = db.liveCalls.filter((c) => c.id !== id);
  json(res, 200, { ok: true });
});

/* --- dashboard ----------------------------------------------------- */

route("GET", /^\/api\/dashboard\/stats$/, (_req, res) => {
  const today = todayISO();
  const isToday = (iso) => iso.slice(0, 10) === today;
  const callsToday = db.calls.filter((c) => isToday(c.startedAt));
  const booked = db.appointments.filter((a) => isToday(a.startsAt) && a.status !== "cancelled");
  const answered = db.calls.filter((c) => c.durationSec > 0);
  const avg = answered.reduce((s, c) => s + c.durationSec, 0) / Math.max(answered.length, 1);
  json(res, 200, {
    callsToday: callsToday.length,
    appointmentsBooked: booked.length,
    missedRecovered: db.calls.filter((c) => c.outcome === "missed" || c.outcome === "dropped").length,
    avgDurationSec: Math.round(avg),
    revenueRecovered: db.calls.filter((c) => c.outcome === "booked").length * 560 + 18400,
    bookedWhileClosed: 9,
    trends: {
      callsToday: 12,
      appointmentsBooked: 8,
      missedRecovered: 25,
      avgDurationSec: -4,
      revenueRecovered: 17,
    },
  });
});

route("GET", /^\/api\/dashboard\/calls-per-day$/, (req, res) => {
  const days = Number(new URL(req.url, "http://x").searchParams.get("days") ?? 7);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayCalls = db.calls.filter((c) => c.startedAt.slice(0, 10) === key);
    out.push({
      date: new Date(`${key}T00:00:00`).toISOString(),
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      answered: dayCalls.filter((c) => c.durationSec > 0).length,
      neededHuman: dayCalls.filter((c) => c.outcome === "human").length,
    });
  }
  json(res, 200, out);
});

route("GET", /^\/api\/dashboard\/call-outcomes$/, (_req, res) => {
  const labels = {
    booked: "Booked",
    faq: "FAQ answered",
    human: "Handed to human",
    dropped: "Dropped",
    missed: "Missed",
    rescheduled: "Rescheduled",
    cancelled: "Cancelled",
  };
  const counts = {};
  for (const c of db.calls) counts[c.outcome] = (counts[c.outcome] ?? 0) + 1;
  json(
    res,
    200,
    Object.keys(counts)
      .map((key) => ({ key, label: labels[key] ?? key, value: counts[key] }))
      .sort((a, b) => b.value - a.value)
  );
});

/* --- calls --------------------------------------------------------- */

route("GET", /^\/api\/calls$/, (req, res) => {
  const p = new URL(req.url, "http://x").searchParams;
  const search = (p.get("search") ?? "").toLowerCase();
  const outcome = p.get("outcome");
  const language = p.get("language");
  const from = p.get("from");
  const to = p.get("to");
  const needsReview = p.get("needsReview") === "true";

  const out = db.calls
    .filter((c) => {
      if (outcome && outcome !== "all" && c.outcome !== outcome) return false;
      if (language && language !== "all" && c.language !== language) return false;
      if (needsReview && c.resolved) return false;
      const t = new Date(c.startedAt).getTime();
      if (from && t < new Date(from).getTime()) return false;
      if (to && t > new Date(to).getTime()) return false;
      if (search) {
        const hay = `${c.callerName} ${c.phone} ${c.summary} ${c.intent}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  json(res, 200, out);
});

route("GET", /^\/api\/calls\/([^/]+)$/, (_req, res, [id]) => {
  const call = db.calls.find((c) => c.id === id);
  if (!call) return fail(res, 404, `Call ${id} not found`);
  json(res, 200, call);
});

route("PATCH", /^\/api\/calls\/([^/]+)$/, async (req, res, [id]) => {
  const call = db.calls.find((c) => c.id === id);
  if (!call) return fail(res, 404, `Call ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  Object.assign(call, body);
  // TODO(sheets): write the follow-up flag back to the Calls tab.
  json(res, 200, call);
});

/* --- the Bolna post-call webhook ----------------------------------- */

/**
 * POST /api/calls/webhook
 * Bolna calls this after every call ends. It is what fills the Calls table, so
 * the dashboard, the review queue and the agent metrics all depend on it.
 * See docs/VOICE-AGENT.md for the exact payload.
 */
route("POST", /^\/api\/calls\/webhook$/, async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");

  const transcript = Array.isArray(body.transcript)
    ? body.transcript.map((line, i) => ({
        speaker: line.speaker === "ai" || line.role === "agent" ? "ai" : "patient",
        text: String(line.text ?? ""),
        ts: line.ts ?? new Date().toISOString(),
        startSec: line.startSec ?? i * 6,
      }))
    : [];

  const call = {
    id: body.id ?? makeId("call"),
    callerName: body.callerName ?? body.caller_name ?? "Unknown caller",
    phone: body.phone ?? "",
    startedAt: body.startedAt ?? new Date().toISOString(),
    durationSec: Number(body.durationSec ?? 0),
    language: body.language ?? "Hinglish",
    outcome: body.outcome ?? "faq",
    sentiment: body.sentiment ?? "neutral",
    summary: body.summary ?? "",
    transcript,
    extracted: body.extracted ?? {},
    needsFollowUp: Boolean(body.needsFollowUp ?? false),
    recordingUrl: body.recordingUrl ?? "",
    intent: body.intent ?? "Clinic question",
    resolved: Boolean(body.resolved ?? true),
    confidence: Number(body.confidence ?? 0.9),
    tags: body.tags ?? [],
    aiActions: body.aiActions ?? [],
  };

  db.calls.unshift(call);
  // TODO(sheets): append a row to the Calls tab, and write any appointment the
  // agent booked during the call.
  json(res, 201, call);
});

route("GET", /^\/api\/saved-views$/, (_req, res) => json(res, 200, db.savedViews));

/* --- appointments and slots ---------------------------------------- */

route("GET", /^\/api\/appointments$/, (req, res) => {
  const p = new URL(req.url, "http://x").searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const status = p.get("status");
  const out = db.appointments
    .filter((a) => {
      if (status && status !== "all" && a.status !== status) return false;
      const t = new Date(a.startsAt).getTime();
      if (from && t < new Date(from).getTime()) return false;
      if (to && t > new Date(to).getTime()) return false;
      return true;
    })
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  json(res, 200, out);
});

route("GET", /^\/api\/appointments\/([^/]+)$/, (_req, res, [id]) => {
  const apt = db.appointments.find((a) => a.id === id);
  if (!apt) return fail(res, 404, `Appointment ${id} not found`);
  json(res, 200, apt);
});

/**
 * GET /api/slots?doctorId=&date=YYYY-MM-DD   -> { slots: ["09:00", ...] }   (agent)
 * GET /api/slots?doctorId=&startsAt=ISO      -> { available: true|false }   (dashboard)
 *
 * This is the Bolna tool that runs mid-call, so it must answer in well under a
 * second. Keep the Sheet read cached for the duration of a call.
 */
route("GET", /^\/api\/slots$/, (req, res) => {
  const p = new URL(req.url, "http://x").searchParams;
  const doctorId = p.get("doctorId") ?? p.get("doctor");
  if (!doctorId) return fail(res, 400, "doctorId is required");

  const startsAt = p.get("startsAt");
  if (startsAt) {
    return json(res, 200, {
      available: !slotTaken(doctorId, startsAt, p.get("ignoreId") ?? undefined),
    });
  }

  const date = p.get("date") ?? todayISO();
  const slots = freeSlots(doctorId, date);
  if (slots === null) return fail(res, 404, `Doctor ${doctorId} not found`);
  json(res, 200, { doctorId, date, slots });
});

route("POST", /^\/api\/appointments$/, async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  const { patientName, phone, doctorId, startsAt, reason } = body ?? {};
  if (!patientName || !phone || !doctorId || !startsAt) {
    return fail(res, 422, "patientName, phone, doctorId and startsAt are required");
  }
  if (!db.doctors.some((d) => d.id === doctorId)) {
    return fail(res, 404, `Doctor ${doctorId} not found`);
  }
  if (slotTaken(doctorId, startsAt)) {
    return fail(res, 409, "That slot is already taken. Please pick another time.");
  }
  const doctor = db.doctors.find((d) => d.id === doctorId);
  const appointment = {
    id: makeId("apt"),
    patientName,
    phone,
    doctorId,
    startsAt,
    durationMin: body.durationMin ?? doctor.slotDurationMin,
    reason: reason ?? "",
    status: "confirmed",
    bookedBy: body.bookedBy === "staff" ? "staff" : "ai",
    whatsappSent: true,
  };
  db.appointments.push(appointment);
  // TODO(sheets): append the row, then send the WhatsApp confirmation.
  json(res, 201, appointment);
});

route("PATCH", /^\/api\/appointments\/([^/]+)$/, async (req, res, [id]) => {
  const apt = db.appointments.find((a) => a.id === id);
  if (!apt) return fail(res, 404, `Appointment ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");

  if (body.startsAt && new Date(body.startsAt).getTime() !== new Date(apt.startsAt).getTime()) {
    if (slotTaken(apt.doctorId, body.startsAt, id)) {
      return fail(res, 409, "That slot is already taken. Please pick another time.");
    }
    apt.whatsappSent = true;
    // Moving an appointment implies "rescheduled" unless the caller says otherwise.
    // The voice agent often only sends the new time, so do not rely on it.
    if (!body.status) body.status = "rescheduled";
  }
  Object.assign(apt, body);
  if (body.status === "cancelled") apt.whatsappSent = false;
  // TODO(sheets): update the row in the Appointments tab.
  json(res, 200, apt);
});

/* --- doctors ------------------------------------------------------- */

route("GET", /^\/api\/doctors$/, (_req, res) => json(res, 200, db.doctors));

route("POST", /^\/api\/doctors$/, async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (!body.name) return fail(res, 422, "name is required");
  const doctor = {
    id: makeId("doc"),
    name: body.name,
    speciality: body.speciality ?? "General Physician",
    fee: Number(body.fee ?? 500),
    slotDurationMin: Number(body.slotDurationMin ?? 15),
    availability: body.availability ?? [],
  };
  db.doctors.push(doctor);
  json(res, 201, doctor);
});

route("PATCH", /^\/api\/doctors\/([^/]+)$/, async (req, res, [id]) => {
  const doctor = db.doctors.find((d) => d.id === id);
  if (!doctor) return fail(res, 404, `Doctor ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  Object.assign(doctor, body);
  json(res, 200, doctor);
});

route("DELETE", /^\/api\/doctors\/([^/]+)$/, (_req, res, [id]) => {
  const before = db.doctors.length;
  db.doctors = db.doctors.filter((d) => d.id !== id);
  if (db.doctors.length === before) return fail(res, 404, `Doctor ${id} not found`);
  noContent(res);
});

/* --- clinic, faqs, knowledge --------------------------------------- */

route("GET", /^\/api\/clinic$/, (_req, res) => json(res, 200, db.clinic));

route("PUT", /^\/api\/clinic$/, async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  db.clinic = { ...db.clinic, ...body };
  // TODO(sheets): write the Clinic tab and the FAQs tab.
  json(res, 200, db.clinic);
});

/** The Bolna FAQ tool reads this. Keep it tiny and fast. */
route("GET", /^\/api\/faqs$/, (_req, res) => json(res, 200, db.clinic.faqs));

route("GET", /^\/api\/knowledge$/, (_req, res) => json(res, 200, db.knowledge));

route("POST", /^\/api\/knowledge$/, async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (!body.title || !body.body) return fail(res, 422, "title and body are required");
  const item = {
    id: makeId("kb"),
    title: body.title,
    body: body.body,
    source: body.source ?? "staff",
    updatedAt: new Date().toISOString(),
  };
  db.knowledge.unshift(item);
  json(res, 201, item);
});

route("PATCH", /^\/api\/knowledge\/([^/]+)$/, async (req, res, [id]) => {
  const item = db.knowledge.find((k) => k.id === id);
  if (!item) return fail(res, 404, `Knowledge item ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  Object.assign(item, body, { updatedAt: new Date().toISOString() });
  json(res, 200, item);
});

route("DELETE", /^\/api\/knowledge\/([^/]+)$/, (_req, res, [id]) => {
  const before = db.knowledge.length;
  db.knowledge = db.knowledge.filter((k) => k.id !== id);
  if (db.knowledge.length === before) return fail(res, 404, `Knowledge item ${id} not found`);
  noContent(res);
});

/* --- agent --------------------------------------------------------- */

route("GET", /^\/api\/agent\/metrics$/, (_req, res) => {
  const total = db.calls.length || 1;
  const resolved = db.calls.filter((c) => c.resolved).length;
  const handoffs = db.calls.filter((c) => c.outcome === "human").length;
  const answered = db.calls.filter((c) => c.durationSec > 0);
  const byIntent = new Map();
  for (const c of db.calls) {
    const e = byIntent.get(c.intent) ?? { total: 0, resolved: 0 };
    e.total += 1;
    if (c.resolved) e.resolved += 1;
    byIntent.set(c.intent, e);
  }
  json(res, 200, {
    resolutionRate: resolved / total,
    containmentRate: (total - handoffs) / total,
    avgHandleSec: Math.round(
      answered.reduce((s, c) => s + c.durationSec, 0) / Math.max(answered.length, 1)
    ),
    humanHandoffs: handoffs,
    needsReview: db.calls.filter((c) => !c.resolved).length,
    reviewQueue: db.calls.filter((c) => !c.resolved).map((c) => c.id),
    accuracyTrend: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({
      label,
      value: [0.86, 0.88, 0.87, 0.9, 0.91, 0.93, 0.94][i],
    })),
    intents: [...byIntent.entries()]
      .map(([intent, v]) => ({
        intent,
        total: v.total,
        resolved: v.resolved,
        accuracy: v.resolved / v.total,
      }))
      .sort((a, b) => b.total - a.total),
  });
});

route("POST", /^\/api\/agent\/test$/, async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  const utterance = String(body.utterance ?? "").trim();
  if (!utterance) return fail(res, 422, "utterance is required");
  // TODO(voice): forward this to the Bolna agent in sandbox mode so the test
  // console exercises the same brain as the phone line.
  const escalates = /emergency|urgent|chest pain|human|staff/i.test(utterance);
  json(res, 200, {
    transcript: [
      { role: "user", text: utterance },
      {
        role: "ai",
        text: escalates
          ? "Main aapko clinic staff se connect kar rahi hoon."
          : "Yeh clinic ke knowledge base se answer kiya ja sakta hai.",
      },
    ],
    verdict: escalates ? "warn" : "pass",
    note: escalates
      ? "The agent escalated instead of answering. Add this to the knowledge base so it can handle it directly."
      : "Answered from the knowledge base with high confidence.",
  });
});

route("POST", /^\/api\/agent\/simulate$/, async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  json(res, 200, { reply: mockReply(String(body.message ?? "")) });
});

/* --- outbound, usage, onboarding ----------------------------------- */

route("GET", /^\/api\/campaigns$/, (_req, res) => json(res, 200, db.campaigns));

route("POST", /^\/api\/campaigns$/, async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (!body.name) return fail(res, 422, "name is required");
  const campaign = {
    id: makeId("camp"),
    status: "scheduled",
    contacted: 0,
    connected: 0,
    converted: 0,
    audience: 0,
    ...body,
  };
  db.campaigns.unshift(campaign);
  json(res, 201, campaign);
});

route("PATCH", /^\/api\/campaigns\/([^/]+)$/, async (req, res, [id]) => {
  const campaign = db.campaigns.find((c) => c.id === id);
  if (!campaign) return fail(res, 404, `Campaign ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  Object.assign(campaign, body);
  json(res, 200, campaign);
});

route("GET", /^\/api\/usage$/, (_req, res) => json(res, 200, db.usage));

route("GET", /^\/api\/onboarding$/, (_req, res) => json(res, 200, db.onboarding));

route("PATCH", /^\/api\/onboarding\/([^/]+)$/, async (req, res, [id]) => {
  const step = db.onboarding.find((s) => s.id === id);
  if (!step) return fail(res, 404, `Step ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (typeof body.done === "boolean") step.done = body.done;
  json(res, 200, step);
});

/* --- canned reply for the chat dock -------------------------------- */

function mockReply(message) {
  const m = message.toLowerCase();
  if (/(book|appoint|dikhana|slot|milna)/.test(m))
    return "Bilkul! Aap kis doctor se milna chahenge? Dr. Sharma, Dr. Verma ya Dr. Khan?";
  if (/(fee|charge|kitni|price)/.test(m))
    return "Dr. Sharma ₹500, Dr. Verma ₹700 aur Dr. Khan ₹600 charge karte hain.";
  if (/(timing|khulti|open|band|hours)/.test(m))
    return "Clinic Monday se Saturday, subah 9 se raat 8 baje tak khuli rehti hai.";
  if (/(emergency|urgent|chest pain|human)/.test(m))
    return "Yeh urgent lagta hai. Kripya 108 par call karein, main staff se connect kar rahi hoon.";
  return "Samajh gayi. Appointment book karna hai, fees jaanni hai, ya clinic ke timings?";
}

/* ------------------------------------------------------------------ */
/* Server                                                             */
/* ------------------------------------------------------------------ */

export function createApiServer() {
  return createServer(async (req, res) => {
    const origin = req.headers.origin ?? "";
    res.setHeader(
      "Access-Control-Allow-Origin",
      ALLOWED_ORIGINS.includes("*") ? "*" : ALLOWED_ORIGINS.includes(origin) ? origin : "null"
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const path = (req.url ?? "/").split("?")[0].replace(/\/+$/, "") || "/";

    for (const { method, pattern, handler } of routes) {
      if (method !== req.method) continue;
      const match = pattern.exec(path);
      if (!match) continue;
      try {
        return await handler(req, res, match.slice(1));
      } catch (err) {
        console.error(`${req.method} ${path} failed:`, err);
        return fail(res, 500, "Internal server error");
      }
    }

    fail(res, 404, `No route for ${req.method} ${path}`);
  });
}

// Only listen when run directly, so tests can import createApiServer().
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  createApiServer().listen(PORT, () => {
    console.log(`ClinicVaani API listening on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log("Storage is in memory. Restart to reset.");
  });
}
