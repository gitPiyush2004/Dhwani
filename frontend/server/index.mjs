// ---------------------------------------------------------------------------
// Dhwani API
//
// The one service that both the phone agent (Bolna) and the dashboard call.
// It owns the data and is the only writer, so the two always agree.
//
//   node server/index.mjs              # http://localhost:8787
//
// Configuration is in server/.env (see server/.env.example). Each integration
// switches on when its variables are present:
//   storage    Google Sheets (SHEET_ID + service account), else a JSON file
//   phone      Bolna, with Sarvam speech and Gemini (BOLNA_API_KEY)
//   messages   WhatsApp / SMS (META_WA_* or TWILIO_*)
//   chat agent Gemini (GEMINI_API_KEY), else rule-based answers
//   login      ADMIN_PASSWORD
//
// Zero dependencies. The contract is docs/API-CONTRACT.md; the tests are
// server/test.mjs.
// ---------------------------------------------------------------------------

import { createServer } from "node:http";
import { chat } from "./agent/brain.mjs";
import { TOOLS } from "./agent/tools.mjs";
import {
  agentMetrics,
  callOutcomes,
  callsPerDay,
  dashboardStats,
  onboarding,
  usage,
} from "./analytics.mjs";
import { authRequired, isAdmin, isBolna, login } from "./auth.mjs";
import { buildAgentPayload } from "./bolna/agent-config.mjs";
import {
  agentId,
  fetchRecording,
  getMe,
  lastSyncStatus,
  linkInboundNumber,
  scheduleAgentSync,
  startCall,
  syncAgent,
} from "./bolna/client.mjs";
import {
  callFromGenericWebhook,
  currentLiveCalls,
  handleBolnaWebhook,
  isBolnaPayload,
  removeLiveCall,
  saveCall,
} from "./calls.mjs";
import { config, integrations } from "./config.mjs";
import { makeId } from "./data.mjs";
import {
  createAppointment,
  events,
  findDoctor,
  freeSlots,
  knowledgeChanged,
  persistRow,
  persistTable,
  recordConfirmation,
  samePhone,
  slotTaken,
  updateAppointment,
  useStore,
} from "./domain.mjs";
import { messagingStatus, notifyPatient } from "./messaging.mjs";
import { runReminders, startReminderSchedule } from "./reminders.mjs";
import { db } from "./state.mjs";
import { createStore } from "./store/index.mjs";
import { clinicDate, resolveDate } from "./time.mjs";
import { llmModel, llmProvider } from "./agent/llm.mjs";

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

const MAX_BODY = 2 * 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return null;
  }
}

/** What the dashboard sees of a call: internal fields out, recordings proxied. */
function publicCall(c) {
  const { sourceRecordingUrl, ...rest } = c;
  const src = sourceRecordingUrl ?? c.recordingUrl ?? "";
  return { ...rest, recordingUrl: /^https?:\/\//.test(src) ? `/api/calls/${c.id}/recording` : "" };
}

/* ------------------------------------------------------------------ */
/* Routes                                                             */
/* ------------------------------------------------------------------ */

const routes = [];
/** access: "public" | "admin" | "bolna" | "admin-or-bolna" */
const route = (method, pattern, access, handler) => routes.push({ method, pattern, access, handler });

/* --- health, auth, public config ------------------------------------ */

route("GET", /^\/health$/, "public", (_req, res) =>
  json(res, 200, { ok: true, service: "dhwani-api", time: new Date().toISOString() })
);

route("GET", /^\/api\/auth\/status$/, "public", (req, res) =>
  json(res, 200, { required: authRequired(), authenticated: isAdmin(req) })
);

route("POST", /^\/api\/auth\/login$/, "public", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  // A small fixed delay makes password guessing slow.
  await new Promise((r) => setTimeout(r, 400));
  const session = login(body.password);
  if (!session) return fail(res, 401, "That password is not right.");
  json(res, 200, session);
});

/** What the public landing page may show: the real number to call. */
route("GET", /^\/api\/public\/config$/, "public", (_req, res) =>
  json(res, 200, {
    clinicName: db.clinic?.name ?? "",
    agentName: db.clinic?.agent?.name ?? "",
    demoPhone: config.bolna.phoneNumber || null,
    voiceEnabled: Boolean(integrations.bolna() && agentId()),
  })
);

/* --- integrations ------------------------------------------------------ */

route("GET", /^\/api\/integrations$/, "admin", async (_req, res, _m, ctx) => {
  let wallet = null;
  if (integrations.bolna()) {
    try {
      const me = await getMe();
      wallet = me.wallet ?? me.balance ?? null;
    } catch {
      wallet = null;
    }
  }
  json(res, 200, {
    storage: ctx.store.status(),
    bolna: {
      configured: integrations.bolna(),
      agentId: agentId() || null,
      phoneNumber: config.bolna.phoneNumber || null,
      publicUrl: config.publicUrl || null,
      secretSet: Boolean(config.bolna.secret),
      llm: `${config.bolna.llmProvider}/${config.bolna.llmModel}`,
      voice: `sarvam ${config.bolna.ttsModel} ${config.bolna.ttsVoice}`,
      transcriber: `sarvam ${config.bolna.sttModel}`,
      lastSync: lastSyncStatus(),
      wallet,
    },
    messaging: messagingStatus(),
    llm: { configured: integrations.llm(), provider: llmProvider(), model: llmModel() },
    auth: { required: authRequired() },
  });
});

route("POST", /^\/api\/integrations\/bolna\/sync$/, "admin", async (_req, res) => {
  try {
    json(res, 200, await syncAgent());
  } catch (err) {
    fail(res, 502, err.message);
  }
});

route("POST", /^\/api\/integrations\/bolna\/link-number$/, "admin", async (req, res) => {
  const body = await readBody(req);
  try {
    json(res, 200, await linkInboundNumber(body?.phone || config.bolna.phoneNumber));
  } catch (err) {
    fail(res, 502, err.message);
  }
});

route("GET", /^\/api\/integrations\/bolna\/agent-config$/, "admin", (_req, res) => {
  const payload = JSON.parse(JSON.stringify(buildAgentPayload()).replaceAll(config.bolna.secret || "\u0000", "<BOLNA_SECRET>"));
  json(res, 200, payload);
});

route("POST", /^\/api\/integrations\/sheets\/refresh$/, "admin", async (_req, res, _m, ctx) => {
  if (!ctx.store.refresh) return fail(res, 400, "Google Sheets is not the storage backend");
  await ctx.store.refresh();
  json(res, 200, ctx.store.status());
});

route("POST", /^\/api\/reminders\/run$/, "admin", async (_req, res) => json(res, 200, await runReminders({ force: true })));

/* --- live calls ---------------------------------------------------- */

route("GET", /^\/api\/live-calls$/, "admin", (_req, res) => json(res, 200, currentLiveCalls()));

/**
 * Bolna cannot hand a live call to a browser, so "take over" flags the caller
 * for an immediate staff call-back and removes the card.
 */
route("POST", /^\/api\/live-calls\/([^/]+)\/takeover$/, "admin", (_req, res, [id]) => {
  const live = db.liveCalls.find((c) => c.id === id);
  removeLiveCall(id);
  if (live) {
    const call = db.calls.find((c) => c.executionId === id);
    if (call) {
      call.needsFollowUp = true;
      persistRow("calls", call);
    } else {
      db.meta.takeovers = { ...(db.meta.takeovers ?? {}), [id]: new Date().toISOString() };
    }
  }
  json(res, 200, { ok: true });
});

/* --- dashboard ----------------------------------------------------- */

route("GET", /^\/api\/dashboard\/stats$/, "admin", (_req, res) => json(res, 200, dashboardStats()));

route("GET", /^\/api\/dashboard\/calls-per-day$/, "admin", (_req, res, _m, { url }) => {
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 7) || 7, 1), 90);
  json(res, 200, callsPerDay(days));
});

route("GET", /^\/api\/dashboard\/call-outcomes$/, "admin", (_req, res) => json(res, 200, callOutcomes()));

/* --- calls --------------------------------------------------------- */

route("GET", /^\/api\/calls$/, "admin", (_req, res, _m, { url }) => {
  const p = url.searchParams;
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
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .map(publicCall);

  json(res, 200, out);
});

route("GET", /^\/api\/calls\/([^/]+)\/recording$/, "admin", async (_req, res, [id]) => {
  const call = db.calls.find((c) => c.id === id);
  const src = call?.sourceRecordingUrl ?? call?.recordingUrl;
  if (!call || !/^https?:\/\//.test(src ?? "")) return fail(res, 404, "No recording for this call");
  try {
    const upstream = await fetchRecording(src);
    if (!upstream.ok) return fail(res, 502, `The recording could not be fetched (${upstream.status})`);
    res.writeHead(200, {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length") } : {}),
    });
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (err) {
    if (!res.headersSent) fail(res, 502, `The recording could not be fetched: ${err.message}`);
    else res.end();
  }
});

route("GET", /^\/api\/calls\/([^/]+)$/, "admin", (_req, res, [id]) => {
  const call = db.calls.find((c) => c.id === id);
  if (!call) return fail(res, 404, `Call ${id} not found`);
  json(res, 200, publicCall(call));
});

route("PATCH", /^\/api\/calls\/([^/]+)$/, "admin", async (req, res, [id]) => {
  const call = db.calls.find((c) => c.id === id);
  if (!call) return fail(res, 404, `Call ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  for (const k of ["needsFollowUp", "resolved", "outcome", "intent", "summary", "callerName", "tags"]) {
    if (body[k] !== undefined) call[k] = body[k];
  }
  if (body.resolved === true) call.needsFollowUp = false;
  persistRow("calls", call);
  json(res, 200, publicCall(call));
});

/* --- post-call webhooks -------------------------------------------- */

/**
 * POST /api/calls/webhook: our documented payload (docs/VOICE-AGENT.md), or
 * Bolna's native execution payload, which is detected and handled below.
 */
route("POST", /^\/api\/calls\/webhook$/, "admin-or-bolna", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (isBolnaPayload(body)) return json(res, 200, await handleBolnaWebhook(body));
  const call = callFromGenericWebhook(body);
  json(res, 201, publicCall(saveCall(call)));
});

/**
 * POST /api/bolna/webhook?token=BOLNA_SECRET: set as the agent's webhook_url.
 * Bolna posts here on every status change. We answer at once and process
 * afterwards, so Bolna never times out waiting for the call analysis.
 */
route("POST", /^\/api\/bolna\/webhook$/, "bolna", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  json(res, 200, { ok: true });
  handleBolnaWebhook(body).catch((err) => console.error("[bolna] webhook processing failed:", err));
});

/* --- Bolna tools, called mid-call ---------------------------------- */

route(/^(GET|POST)$/, /^\/api\/bolna\/tools\/([a-z_]+)$/, "bolna", async (req, res, [name], { url }) => {
  const tool = TOOLS[name];
  if (!tool) return fail(res, 404, `Unknown tool ${name}`);
  const body = req.method === "POST" ? await readBody(req) : {};
  const args = { ...Object.fromEntries(url.searchParams), ...(body ?? {}) };
  delete args.token;
  const started = Date.now();
  let result;
  try {
    result = tool.run(args);
  } catch (err) {
    console.error(`[bolna] tool ${name} failed:`, err);
    result = { ok: false, message: "Something went wrong on our side. Apologise and offer a call back from the clinic." };
  }
  console.log(`[bolna] ${name} ${JSON.stringify(args)} -> ${result.ok ? "ok" : "no"} in ${Date.now() - started} ms`);
  // Always 200: Bolna hands the body to the LLM and ignores the status code.
  json(res, 200, result);
});

route("GET", /^\/api\/saved-views$/, "admin", (_req, res) => json(res, 200, db.savedViews));

/* --- appointments and slots ---------------------------------------- */

route("GET", /^\/api\/appointments$/, "admin", (_req, res, _m, { url }) => {
  const p = url.searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const status = p.get("status");
  const phone = p.get("phone");
  const out = db.appointments
    .filter((a) => {
      if (status && status !== "all" && a.status !== status) return false;
      if (phone && !samePhone(a.phone, phone)) return false;
      const t = new Date(a.startsAt).getTime();
      if (from && t < new Date(from).getTime()) return false;
      if (to && t > new Date(to).getTime()) return false;
      return true;
    })
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  json(res, 200, out);
});

route("GET", /^\/api\/appointments\/([^/]+)$/, "admin", (_req, res, [id]) => {
  const apt = db.appointments.find((a) => a.id === id);
  if (!apt) return fail(res, 404, `Appointment ${id} not found`);
  json(res, 200, apt);
});

/**
 * GET /api/slots?doctorId=&date=YYYY-MM-DD   -> { slots: ["09:00", ...] }   (clinic time)
 * GET /api/slots?doctorId=&startsAt=ISO      -> { available: true|false }
 */
route("GET", /^\/api\/slots$/, "admin-or-bolna", (_req, res, _m, { url }) => {
  const p = url.searchParams;
  const query = p.get("doctorId") ?? p.get("doctor");
  if (!query) return fail(res, 400, "doctorId is required");
  const doctor = findDoctor(query);
  if (!doctor) return fail(res, 404, `Doctor ${query} not found`);

  const startsAt = p.get("startsAt");
  if (startsAt) {
    if (Number.isNaN(new Date(startsAt).getTime())) return fail(res, 400, "startsAt must be an ISO 8601 date");
    return json(res, 200, { available: !slotTaken(doctor.id, startsAt, p.get("ignoreId") ?? undefined) });
  }

  const date = resolveDate(p.get("date") ?? "today") ?? clinicDate();
  json(res, 200, { doctorId: doctor.id, date, slots: freeSlots(doctor, date) });
});

route("POST", /^\/api\/appointments$/, "admin-or-bolna", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  const result = createAppointment(body ?? {}, { strictHours: body?.bookedBy === "ai" });
  if (!result.ok) return fail(res, result.status, result.error);
  const apt = result.appointment;
  // Wait briefly for the confirmation so whatsappSent is true when we answer;
  // a slow provider finishes in the background and updates the row then.
  const sent = notifyPatient("confirmed", apt).then(({ channel }) => recordConfirmation(apt, channel));
  await Promise.race([sent, new Promise((r) => setTimeout(r, 4000))]);
  json(res, 201, apt);
});

route("PATCH", /^\/api\/appointments\/([^/]+)$/, "admin-or-bolna", async (req, res, [id]) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  const result = updateAppointment(id, body ?? {});
  if (!result.ok) return fail(res, result.status, result.error);
  const apt = result.appointment;
  if (body.status === "cancelled" && result.previousStatus !== "cancelled") {
    void notifyPatient("cancelled", apt);
  } else if (result.moved) {
    const sent = notifyPatient("rescheduled", apt).then(({ channel }) => recordConfirmation(apt, channel));
    await Promise.race([sent, new Promise((r) => setTimeout(r, 4000))]);
  }
  json(res, 200, apt);
});

/* --- doctors ------------------------------------------------------- */

const DOCTOR_FIELDS = ["name", "speciality", "fee", "slotDurationMin", "availability"];
const validAvailability = (a) =>
  Array.isArray(a) && a.every((b) => b && Number.isInteger(Number(b.day)) && /^\d{2}:\d{2}$/.test(b.start) && /^\d{2}:\d{2}$/.test(b.end) && b.start < b.end);

route("GET", /^\/api\/doctors$/, "admin-or-bolna", (_req, res) => json(res, 200, db.doctors));

route("POST", /^\/api\/doctors$/, "admin", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (!body.name) return fail(res, 422, "name is required");
  if (body.availability !== undefined && !validAvailability(body.availability)) {
    return fail(res, 422, "availability must be a list of { day, start: \"HH:mm\", end: \"HH:mm\" }");
  }
  const slug = String(body.name).toLowerCase().replace(/^dr\.?\s*/, "").split(/\s+/).pop()?.replace(/[^a-z]/g, "");
  const id = slug && !db.doctors.some((d) => d.id === `doc-${slug}`) ? `doc-${slug}` : makeId("doc");
  const doctor = {
    id,
    name: body.name,
    speciality: body.speciality ?? "General Physician",
    fee: Number(body.fee ?? 500),
    slotDurationMin: Number(body.slotDurationMin ?? 15) || 15,
    availability: (body.availability ?? []).map((b) => ({ day: Number(b.day), start: b.start, end: b.end })),
  };
  db.doctors.push(doctor);
  persistTable("doctors");
  knowledgeChanged();
  json(res, 201, doctor);
});

route("PATCH", /^\/api\/doctors\/([^/]+)$/, "admin", async (req, res, [id]) => {
  const doctor = db.doctors.find((d) => d.id === id);
  if (!doctor) return fail(res, 404, `Doctor ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (body.availability !== undefined && !validAvailability(body.availability)) {
    return fail(res, 422, "availability must be a list of { day, start: \"HH:mm\", end: \"HH:mm\" }");
  }
  for (const k of DOCTOR_FIELDS) if (body[k] !== undefined) doctor[k] = body[k];
  doctor.fee = Number(doctor.fee) || 0;
  doctor.slotDurationMin = Number(doctor.slotDurationMin) || 15;
  persistTable("doctors");
  knowledgeChanged();
  json(res, 200, doctor);
});

route("DELETE", /^\/api\/doctors\/([^/]+)$/, "admin", (_req, res, [id]) => {
  const before = db.doctors.length;
  db.doctors = db.doctors.filter((d) => d.id !== id);
  if (db.doctors.length === before) return fail(res, 404, `Doctor ${id} not found`);
  persistTable("doctors");
  knowledgeChanged();
  noContent(res);
});

/* --- clinic, faqs, knowledge --------------------------------------- */

route("GET", /^\/api\/clinic$/, "admin-or-bolna", (_req, res) => json(res, 200, db.clinic));

route("PUT", /^\/api\/clinic$/, "admin", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  const next = { ...db.clinic, ...body };
  if (body.agent) next.agent = { ...db.clinic.agent, ...body.agent };
  if (body.escalation) next.escalation = { ...db.clinic.escalation, ...body.escalation };
  if (Array.isArray(body.faqs)) {
    next.faqs = body.faqs
      .filter((f) => f && f.question)
      .map((f) => ({ id: f.id || makeId("faq"), question: f.question, answer: f.answer ?? "", hits: Number(f.hits ?? 0) }));
  }
  db.clinic = next;
  persistTable("clinic");
  knowledgeChanged();
  json(res, 200, db.clinic);
});

/** The FAQ tool: FAQs plus the knowledge base, as VOICE-AGENT.md recommends. */
route("GET", /^\/api\/faqs$/, "admin-or-bolna", (_req, res) => json(res, 200, db.clinic.faqs));

route("GET", /^\/api\/knowledge$/, "admin", (_req, res) => json(res, 200, db.knowledge));

route("POST", /^\/api\/knowledge$/, "admin", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (!body.title || !body.body) return fail(res, 422, "title and body are required");
  const item = {
    id: makeId("kb"),
    title: body.title,
    body: body.body,
    source: ["faq", "document", "staff"].includes(body.source) ? body.source : "staff",
    updatedAt: new Date().toISOString(),
  };
  db.knowledge.unshift(item);
  persistTable("knowledge");
  knowledgeChanged();
  json(res, 201, item);
});

route("PATCH", /^\/api\/knowledge\/([^/]+)$/, "admin", async (req, res, [id]) => {
  const item = db.knowledge.find((k) => k.id === id);
  if (!item) return fail(res, 404, `Knowledge item ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  for (const k of ["title", "body", "source"]) if (body[k] !== undefined) item[k] = body[k];
  item.updatedAt = new Date().toISOString();
  persistTable("knowledge");
  knowledgeChanged();
  json(res, 200, item);
});

route("DELETE", /^\/api\/knowledge\/([^/]+)$/, "admin", (_req, res, [id]) => {
  const before = db.knowledge.length;
  db.knowledge = db.knowledge.filter((k) => k.id !== id);
  if (db.knowledge.length === before) return fail(res, 404, `Knowledge item ${id} not found`);
  persistTable("knowledge");
  knowledgeChanged();
  noContent(res);
});

/* --- agent --------------------------------------------------------- */

route("GET", /^\/api\/agent\/metrics$/, "admin", (_req, res) => json(res, 200, agentMetrics()));

/** The test console: one utterance, a real agent reply, and a verdict. */
route("POST", /^\/api\/agent\/test$/, "admin", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  const utterance = String(body.utterance ?? "").trim();
  if (!utterance) return fail(res, 422, "utterance is required");
  const out = await chat({ sessionId: `test-${makeId("t")}`, message: utterance });
  const unsure = /samajh nahi|not sure|call back|staff .*call|don't know|pata nahi/i.test(out.reply);
  const verdict = out.escalated ? "warn" : unsure ? "warn" : "pass";
  json(res, 200, {
    transcript: [
      { role: "user", text: utterance },
      { role: "ai", text: out.reply },
    ],
    verdict,
    note: out.escalated
      ? "The agent handed this to staff. Right for emergencies and requests for a human; otherwise add the answer to the knowledge base."
      : unsure
        ? "The agent was not sure. Add this to the FAQs or knowledge base so it can answer directly."
        : `Answered${out.actions.length ? ` using ${[...new Set(out.actions)].join(", ")}` : ""}${out.engine === "rules" ? " (rule-based: set OPENAI_API_KEY for the full agent)" : ""}.`,
  });
});

/** The "Try the agent" dock. Bookings here are dry runs. */
route("POST", /^\/api\/agent\/simulate$/, "admin", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  const message = String(body.message ?? "").trim();
  if (!message) return fail(res, 422, "message is required");
  const out = await chat({ sessionId: body.sessionId, message, history: body.history });
  json(res, 200, out);
});

/** "Call me": the phone agent rings this number, so you can hear the real thing. */
route("POST", /^\/api\/agent\/call$/, "admin", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  const phone = String(body.phone ?? "").trim();
  if (phone.replace(/\D/g, "").length < 10) return fail(res, 422, "Enter a valid 10 digit mobile number.");
  if (!integrations.bolna()) return fail(res, 503, "The phone agent is not connected yet. Add BOLNA_API_KEY on the server.");
  try {
    const out = await startCall(phone, { test: true });
    json(res, 200, { ok: true, executionId: out.execution_id ?? null, status: out.status ?? "queued" });
  } catch (err) {
    fail(res, 502, err.message);
  }
});

/* --- outbound, usage, onboarding ----------------------------------- */

route("GET", /^\/api\/campaigns$/, "admin", (_req, res) => json(res, 200, db.campaigns));

route("POST", /^\/api\/campaigns$/, "admin", async (req, res) => {
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (!body.name) return fail(res, 422, "name is required");
  const campaign = {
    status: "scheduled",
    type: "reminder",
    channel: "whatsapp",
    script: "",
    ...body,
    id: makeId("camp"),
    contacted: 0,
    connected: 0,
    converted: 0,
    audience: Number(body.audience ?? 0),
  };
  db.campaigns.unshift(campaign);
  persistTable("campaigns");
  json(res, 201, campaign);
});

route("PATCH", /^\/api\/campaigns\/([^/]+)$/, "admin", async (req, res, [id]) => {
  const campaign = db.campaigns.find((c) => c.id === id);
  if (!campaign) return fail(res, 404, `Campaign ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  for (const k of ["status", "name", "script", "channel", "scheduledAt"]) if (body[k] !== undefined) campaign[k] = body[k];
  persistTable("campaigns");
  json(res, 200, campaign);
});

route("GET", /^\/api\/usage$/, "admin", (_req, res) => json(res, 200, usage()));

route("GET", /^\/api\/onboarding$/, "admin", (_req, res) => json(res, 200, onboarding()));

route("PATCH", /^\/api\/onboarding\/([^/]+)$/, "admin", async (req, res, [id]) => {
  if (!db.onboarding.some((s) => s.id === id)) return fail(res, 404, `Step ${id} not found`);
  const body = await readBody(req);
  if (body === null) return fail(res, 400, "Body must be valid JSON");
  if (typeof body.done === "boolean") {
    db.meta.onboardingDone = { ...(db.meta.onboardingDone ?? {}), [id]: body.done };
    persistTable("meta");
  }
  json(res, 200, onboarding().find((s) => s.id === id));
});

/* ------------------------------------------------------------------ */
/* Server                                                             */
/* ------------------------------------------------------------------ */

function allowOrigin(origin) {
  if (config.corsOrigins.includes("*")) return "*";
  return config.corsOrigins.includes(origin) ? origin : "";
}

const methodMatches = (m, method) => (typeof m === "string" ? m === method : m.test(method));

export function createApiServer({ store = createStore() } = {}) {
  useStore(store);
  const ready = store.init().then(() => {
    events.on("knowledge", () => scheduleAgentSync());
  });
  ready.catch((err) => {
    console.error("[server] storage failed to start:", err.message);
  });

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin ?? "";
    const allowed = allowOrigin(origin);
    if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path !== "/health") {
      try {
        await ready;
      } catch (err) {
        return fail(res, 503, `Storage is not available: ${err.message}`);
      }
    }

    for (const { method, pattern, access, handler } of routes) {
      if (!methodMatches(method, req.method)) continue;
      const match = pattern.exec(path);
      if (!match) continue;

      const ok =
        access === "public" ||
        (access === "admin" && isAdmin(req)) ||
        (access === "bolna" && isBolna(req, url)) ||
        (access === "admin-or-bolna" && (isAdmin(req) || isBolna(req, url)));
      if (!ok) return fail(res, 401, "Please sign in again.");

      try {
        return await handler(req, res, match.slice(1), { url, store });
      } catch (err) {
        console.error(`${req.method} ${path} failed:`, err);
        if (!res.headersSent) return fail(res, 500, "Internal server error");
        return res.end();
      }
    }

    fail(res, 404, `No route for ${req.method} ${path}`);
  });

  server.ready = ready;
  server.store = store;
  return server;
}

// Only listen when run directly, so tests can import createApiServer().
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const server = createApiServer();
  server.listen(config.port, async () => {
    console.log(`Dhwani API listening on http://localhost:${config.port}`);
    try {
      await server.ready;
    } catch {
      return;
    }
    const s = server.store.status();
    console.log(`  storage    ${s.kind}: ${s.detail}`);
    console.log(`  phone      ${integrations.bolna() ? `Bolna, agent ${agentId() || "(not created yet: POST /api/integrations/bolna/sync)"}` : "off (set BOLNA_API_KEY)"}`);
    console.log(`  public url ${config.publicUrl || "not set (Bolna cannot reach this server until PUBLIC_URL is set)"}`);
    console.log(`  messages   ${messagingStatus().channels.join(", ") || "off (set META_WA_* or TWILIO_*)"}`);
    console.log(`  chat agent ${integrations.llm() ? `${llmProvider()} ${llmModel()}` : "rule-based (set OPENAI_API_KEY or GEMINI_API_KEY)"}`);
    console.log(`  login      ${authRequired() ? "required" : "open (set ADMIN_PASSWORD before going public)"}`);
    startReminderSchedule();
  });

  const shutdown = async () => {
    console.log("Shutting down, flushing pending writes…");
    await server.store.flush?.();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
