// ---------------------------------------------------------------------------
// Call logs: turning what the voice platform sends into the `Call` records
// the dashboard reads, plus the live-calls feed.
//
// Two inputs:
//   * POST /api/calls/webhook with our own documented payload (VOICE-AGENT.md)
//   * POST /api/bolna/webhook with Bolna's native execution payload, which
//     arrives several times per call as its status changes
//
// The outcome is worked out from evidence, not guessed: if an appointment was
// booked, moved or cancelled for this caller's number during the call window,
// that is the outcome. Gemini (when configured) writes the summary, intent,
// language and sentiment; without it, heuristics and Bolna's own summary do.
// ---------------------------------------------------------------------------

import { integrations } from "./config.mjs";
import { makeId } from "./data.mjs";
import { persistRow, samePhone } from "./domain.mjs";
import { completeJSON } from "./agent/llm.mjs";
import { db } from "./state.mjs";
import { spokenWhen } from "./time.mjs";

export const OUTCOMES = ["booked", "faq", "human", "dropped", "missed", "rescheduled", "cancelled"];
export const INTENTS = [
  "New appointment",
  "Reschedule",
  "Cancellation",
  "Clinic question",
  "Urgent case",
  "Incomplete call",
  "Missed call",
];
const INTENT_FOR = {
  booked: "New appointment",
  rescheduled: "Reschedule",
  cancelled: "Cancellation",
  faq: "Clinic question",
  human: "Urgent case",
  dropped: "Incomplete call",
  missed: "Missed call",
};
const RESOLVED = new Set(["booked", "faq", "rescheduled", "cancelled"]);
const TERMINAL = new Set(["completed", "no-answer", "busy", "failed", "canceled", "cancelled", "stopped", "error", "balance-low"]);
const NOT_CONNECTED = new Set(["no-answer", "busy", "failed", "canceled", "cancelled", "balance-low", "error"]);
const EMERGENCY = /chest pain|seene|सीने|saans|सांस|breath|unconscious|behosh|बेहोश|bleeding|khoon|खून|accident|stroke|seizure|daura|poison|zeher|suicide|108/i;

/** Bolna sometimes sends naive timestamps; they are UTC. */
const toIso = (v) => {
  if (!v) return null;
  const s = String(v);
  const t = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

const last4 = (phone) => String(phone ?? "").replace(/\D/g, "").slice(-4);

/* --- transcript -------------------------------------------------------- */

/** "assistant: ...\nuser: ..." -> lines with timing spread over the call. */
export function parseTranscriptText(text, durationSec = 0) {
  const lines = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(assistant|agent|ai|bot|user|caller|patient|human|customer)\s*:\s*(.*)$/i.exec(line);
    if (m) lines.push({ speaker: /^(assistant|agent|ai|bot)$/i.test(m[1]) ? "ai" : "patient", text: m[2] });
    else if (lines.length) lines[lines.length - 1].text += ` ${line}`;
  }
  return withTiming(lines, durationSec);
}

/** Fills startSec proportionally to how much was said, when the source has none. */
export function withTiming(lines, durationSec = 0) {
  const total = lines.reduce((s, l) => s + Math.max(l.text.length, 12), 0) || 1;
  const span = durationSec > 0 ? durationSec : lines.length * 6;
  let acc = 0;
  return lines.map((l) => {
    const startSec = l.startSec ?? Math.round((acc / total) * span);
    acc += Math.max(l.text.length, 12);
    return { speaker: l.speaker, text: l.text.trim(), startSec };
  });
}

function detectLanguage(lines) {
  const text = lines.filter((l) => l.speaker === "patient").map((l) => l.text).join(" ") || lines.map((l) => l.text).join(" ");
  if (!text.trim()) return "Hinglish";
  const deva = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  if (deva > latin * 2) return "Hindi";
  const hindiWords = (text.toLowerCase().match(/\b(hai|hain|mujhe|kya|nahi|aap|kal|chahiye|kar|ka|ki|ke|haan|ji|theek|acha|accha|bhai|mera|meri)\b/g) ?? []).length;
  const wordCount = text.split(/\s+/).length || 1;
  if (deva > 0 || hindiWords / wordCount > 0.08) return "Hinglish";
  return "English";
}

/* --- evidence from our own records ------------------------------------- */

function bookingEvidence(phone, startIso, durationSec) {
  if (!phone) return { created: [], moved: [], cancelled: [] };
  const from = new Date(startIso).getTime() - 2 * 60_000;
  const to = new Date(startIso).getTime() + (durationSec + 10 * 60) * 1000;
  const inWindow = (iso) => {
    const t = new Date(iso ?? 0).getTime();
    return t >= from && t <= to;
  };
  const mine = db.appointments.filter((a) => samePhone(a.phone, phone));
  return {
    created: mine.filter((a) => a.bookedBy === "ai" && inWindow(a.createdAt) && a.status !== "cancelled"),
    moved: mine.filter((a) => a.status === "rescheduled" && inWindow(a.updatedAt) && !inWindow(a.createdAt)),
    cancelled: mine.filter((a) => a.status === "cancelled" && inWindow(a.updatedAt)),
  };
}

const doctorName = (id) => db.doctors.find((d) => d.id === id)?.name ?? "the doctor";

/* --- AI analysis --------------------------------------------------------- */

async function analyse(lines, facts) {
  if (!integrations.llm() || !lines.length) return null;
  const transcript = lines.map((l) => `${l.speaker === "ai" ? "Receptionist" : "Caller"}: ${l.text}`).join("\n").slice(0, 12_000);
  const prompt = `You analyse phone calls to an Indian clinic's AI receptionist. Return JSON only with these keys:
"callerName" (string or null, the patient's name if said),
"language" ("Hindi" | "English" | "Hinglish", what the caller mostly spoke),
"outcome" ("faq" | "human" | "dropped" | "booked" | "rescheduled" | "cancelled"),
"intent" (one of ${INTENTS.map((i) => `"${i}"`).join(", ")}),
"sentiment" ("positive" | "neutral" | "negative"),
"summary" (one or two plain English sentences for the clinic owner),
"reason" (short reason for the visit, or null),
"resolved" (true if the receptionist fully handled it without a human),
"confidence" (0 to 1, how well the receptionist understood the caller).
Use "human" when the call was transferred, an emergency came up, or the caller asked for a person. Use "dropped" if the caller left before their need was handled.
Facts from the booking system: ${facts}

Transcript:
${transcript}`;
  try {
    const parsed = await completeJSON(prompt);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    console.warn("[calls] analysis failed, using heuristics:", err.message);
    return null;
  }
}

/* --- building a Call ------------------------------------------------------ */

/**
 * @param {object} n normalised input:
 *   { executionId?, phone, startedAt, durationSec, lines, connected, transferred,
 *     platformSummary?, recordingUrl?, direction?, status? }
 */
export async function buildCall(n) {
  const lines = n.lines ?? [];
  const callerSpoke = lines.some((l) => l.speaker === "patient" && l.text.trim());
  const evidence = bookingEvidence(n.phone, n.startedAt, n.durationSec);
  const callerText = lines.filter((l) => l.speaker === "patient").map((l) => l.text).join(" ");

  let outcome;
  if (evidence.created.length) outcome = "booked";
  else if (evidence.moved.length) outcome = "rescheduled";
  else if (evidence.cancelled.length) outcome = "cancelled";
  else if (n.transferred || EMERGENCY.test(callerText)) outcome = "human";
  else if (!n.connected || (!callerSpoke && n.durationSec < 5)) outcome = "missed";
  else if (!callerSpoke || (n.durationSec < 20 && lines.filter((l) => l.speaker === "patient").length <= 1)) outcome = "dropped";
  else outcome = "faq";

  const apt = evidence.created[0] ?? evidence.moved[0] ?? evidence.cancelled[0];
  const facts = apt
    ? `During this call an appointment was ${outcome === "booked" ? "booked" : outcome} for ${apt.patientName} with ${doctorName(apt.doctorId)} on ${spokenWhen(apt.startsAt)}.`
    : n.transferred
      ? "The call was transferred to clinic staff."
      : "No appointment was booked, moved or cancelled during this call.";

  const ai = outcome === "missed" ? null : await analyse(lines, facts);
  if (ai && !apt && !n.transferred && ["faq", "human", "dropped"].includes(ai.outcome) && outcome !== "missed") {
    outcome = ai.outcome;
  }

  const knownName = apt?.patientName ?? db.appointments.find((a) => samePhone(a.phone, n.phone))?.patientName;
  const callerName = knownName ?? (ai?.callerName || null) ?? null;
  const language = ["Hindi", "English", "Hinglish"].includes(ai?.language) ? ai.language : detectLanguage(lines);

  const actions = [];
  if (outcome === "booked" && apt) {
    actions.push(`Checked ${doctorName(apt.doctorId)}'s calendar`, `Booked ${spokenWhen(apt.startsAt)}`);
    actions.push(apt.whatsappSent ? "Sent the WhatsApp confirmation" : apt.confirmationChannel === "sms" ? "Sent an SMS confirmation" : "Confirmation message not sent");
  } else if (outcome === "rescheduled" && apt) actions.push("Found the appointment", `Moved it to ${spokenWhen(apt.startsAt)}`);
  else if (outcome === "cancelled" && apt) actions.push("Found the appointment", "Cancelled it and released the slot");
  else if (outcome === "human") actions.push(n.transferred ? "Transferred the call to clinic staff" : "Flagged the call for staff");
  else if (outcome === "faq") actions.push("Answered from the clinic's information");
  else if (outcome === "missed") actions.push(n.direction === "outbound" ? "Call was not answered" : "Call ended before it connected");
  else if (outcome === "dropped") actions.push("Caller left before the request was handled");

  const summary =
    ai?.summary ||
    n.platformSummary ||
    (outcome === "booked" && apt
      ? `Booked ${apt.patientName} with ${doctorName(apt.doctorId)} for ${spokenWhen(apt.startsAt)}.`
      : outcome === "missed"
        ? "Missed call. The caller should be called back."
        : outcome === "dropped"
          ? "Call ended before the caller's need was captured."
          : outcome === "human"
            ? "Call needed clinic staff."
            : "Caller asked a question about the clinic.");

  return {
    id: n.id ?? makeId("call"),
    executionId: n.executionId,
    callerName: callerName || (n.phone ? `Caller •••${last4(n.phone)}` : "Unknown caller"),
    phone: n.phone ?? "",
    startedAt: n.startedAt,
    durationSec: Math.round(n.durationSec || 0),
    language,
    outcome,
    sentiment: ["positive", "neutral", "negative"].includes(ai?.sentiment) ? ai.sentiment : outcome === "human" ? "negative" : "neutral",
    summary,
    transcript: lines.map((l) => ({
      ...l,
      ts: new Date(new Date(n.startedAt).getTime() + l.startSec * 1000).toISOString(),
    })),
    extracted: {
      ...(callerName ? { name: callerName } : {}),
      ...(apt?.reason || ai?.reason ? { reason: apt?.reason || ai.reason } : {}),
      ...(apt ? { slot: spokenWhen(apt.startsAt) } : {}),
    },
    needsFollowUp: ["human", "dropped", "missed"].includes(outcome),
    sourceRecordingUrl: n.recordingUrl ?? "",
    recordingUrl: n.recordingUrl ?? "",
    intent: INTENTS.includes(ai?.intent) && !apt ? ai.intent : INTENT_FOR[outcome],
    resolved: typeof ai?.resolved === "boolean" && !apt && outcome !== "human" ? ai.resolved && RESOLVED.has(outcome) : RESOLVED.has(outcome),
    confidence: typeof ai?.confidence === "number" ? Math.max(0, Math.min(1, ai.confidence)) : RESOLVED.has(outcome) ? 0.85 : 0.6,
    tags: [language.toLowerCase(), ...(n.direction ? [n.direction] : []), ...(n.test ? ["test"] : [])],
    aiActions: actions,
  };
}

export function saveCall(call) {
  const existing = call.executionId ? db.calls.find((c) => c.executionId === call.executionId) : db.calls.find((c) => c.id === call.id);
  if (existing) {
    Object.assign(existing, call, { id: existing.id });
    persistRow("calls", existing);
    return existing;
  }
  db.calls.unshift(call);
  db.calls.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  persistRow("calls", call);
  return call;
}

/* --- our documented webhook (VOICE-AGENT.md section 3) -------------------- */

export function callFromGenericWebhook(body) {
  const startedAt = toIso(body.startedAt) ?? new Date().toISOString();
  const transcript = Array.isArray(body.transcript)
    ? withTiming(
        body.transcript.map((line) => ({
          speaker: line.speaker === "ai" || line.speaker === "agent" || line.role === "agent" || line.role === "assistant" ? "ai" : "patient",
          text: String(line.text ?? line.content ?? ""),
          startSec: Number.isFinite(Number(line.startSec)) ? Number(line.startSec) : undefined,
        })),
        Number(body.durationSec ?? 0)
      )
    : typeof body.transcript === "string"
      ? parseTranscriptText(body.transcript, Number(body.durationSec ?? 0))
      : [];

  return {
    id: body.id ?? makeId("call"),
    callerName: body.callerName ?? body.caller_name ?? "Unknown caller",
    phone: body.phone ?? "",
    startedAt,
    durationSec: Number(body.durationSec ?? 0),
    language: body.language ?? "Hinglish",
    outcome: body.outcome ?? "faq",
    sentiment: body.sentiment ?? "neutral",
    summary: body.summary ?? "",
    transcript: transcript.map((l) => ({ ...l, ts: new Date(new Date(startedAt).getTime() + l.startSec * 1000).toISOString() })),
    extracted: body.extracted ?? {},
    needsFollowUp: Boolean(body.needsFollowUp ?? false),
    recordingUrl: body.recordingUrl ?? "",
    sourceRecordingUrl: body.recordingUrl ?? "",
    intent: body.intent ?? "Clinic question",
    resolved: Boolean(body.resolved ?? true),
    confidence: Number(body.confidence ?? 0.9),
    tags: body.tags ?? [],
    aiActions: body.aiActions ?? [],
    executionId: body.executionId ?? body.execution_id ?? undefined,
  };
}

/* --- Bolna's execution payload -------------------------------------------- */

export const isBolnaPayload = (b) =>
  b && typeof b === "object" && (b.telephony_data !== undefined || b.agent_id !== undefined || b.conversation_duration !== undefined || (typeof b.transcript === "string" && b.status !== undefined));

export function normaliseBolna(p) {
  const t = p.telephony_data ?? {};
  const direction = t.call_type ?? (p.context_details?.recipient_phone_number ? "outbound" : "inbound");
  const phone =
    direction === "outbound"
      ? t.to_number ?? p.user_number ?? p.context_details?.recipient_phone_number
      : t.from_number ?? p.user_number;
  const durationSec = Number(p.conversation_duration ?? t.duration ?? 0) || 0;
  const generalSummary = p.extracted_data?.General?.["Call Summary"]?.subjective;
  return {
    executionId: String(p.id ?? p.execution_id ?? ""),
    status: String(p.status ?? "").toLowerCase(),
    direction,
    phone: phone ?? "",
    startedAt: toIso(p.initiated_at) ?? toIso(p.created_at) ?? new Date().toISOString(),
    durationSec,
    lines: parseTranscriptText(p.transcript, durationSec),
    connected: !NOT_CONNECTED.has(String(p.status ?? "").toLowerCase()) && durationSec > 0,
    transferred: Boolean(p.transfer_call_data && Object.keys(p.transfer_call_data).length),
    platformSummary: typeof p.summary === "string" && p.summary.trim() ? p.summary.trim() : typeof generalSummary === "string" ? generalSummary : null,
    recordingUrl: t.recording_url ?? null,
    test: Boolean(p.context_details?.recipient_data?.test),
  };
}

/* --- live calls --------------------------------------------------------- */

const LIVE_STALE_MS = 30 * 60_000;
const waveform = () => Array.from({ length: 40 }, (_, i) => Math.round(18 + 82 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.31))));

export function upsertLiveCall(n) {
  const phase = n.status === "in-progress" ? "question" : "greeting";
  const existing = db.liveCalls.find((c) => c.id === n.executionId);
  const knownName = db.appointments.find((a) => samePhone(a.phone, n.phone))?.patientName;
  const status = {
    queued: "Placing the call…",
    scheduled: "Call scheduled",
    initiated: "Dialling…",
    ringing: "Ringing…",
    "in-progress": "On the line with the AI receptionist",
  }[n.status] ?? "Call in progress";
  if (existing) {
    Object.assign(existing, { phase, currentLine: status });
    return existing;
  }
  const live = {
    id: n.executionId,
    callerName: knownName ?? (n.phone ? `Caller •••${last4(n.phone)}` : "Caller"),
    phone: n.phone,
    language: "Hinglish",
    intent: n.direction === "outbound" ? "Outbound call" : "Inbound call",
    sentiment: "neutral",
    startedAt: n.startedAt,
    durationSec: 0,
    phase,
    confidence: 0.9,
    currentLine: status,
    waveform: waveform(),
  };
  db.liveCalls.unshift(live);
  return live;
}

export function removeLiveCall(id) {
  db.liveCalls = db.liveCalls.filter((c) => c.id !== id);
}

/** Live calls with an up-to-date duration; drops ones we never heard the end of. */
export function currentLiveCalls() {
  const now = Date.now();
  db.liveCalls = db.liveCalls.filter((c) => now - new Date(c.startedAt).getTime() < LIVE_STALE_MS);
  return db.liveCalls.map((c) => ({ ...c, durationSec: Math.max(0, Math.round((now - new Date(c.startedAt).getTime()) / 1000)) }));
}

const inflight = new Set();

/**
 * Handles one Bolna webhook delivery. Idempotent: upserts by execution id,
 * builds the call log once on the first terminal status, and only fills in
 * late-arriving details (a recording URL, say) after that.
 */
export async function handleBolnaWebhook(payload) {
  const n = normaliseBolna(payload);
  if (!n.executionId) return { ignored: "no execution id" };

  if (!TERMINAL.has(n.status)) {
    if (n.status === "call-disconnected") removeLiveCall(n.executionId);
    else upsertLiveCall(n);
    return { live: true, status: n.status };
  }

  removeLiveCall(n.executionId);
  const existing = db.calls.find((c) => c.executionId === n.executionId);
  if (existing) {
    let changed = false;
    if (n.recordingUrl && !existing.sourceRecordingUrl) {
      existing.sourceRecordingUrl = n.recordingUrl;
      existing.recordingUrl = n.recordingUrl;
      changed = true;
    }
    if (n.lines.length > existing.transcript.length) {
      existing.transcript = n.lines.map((l) => ({ ...l, ts: new Date(new Date(existing.startedAt).getTime() + l.startSec * 1000).toISOString() }));
      changed = true;
    }
    if (changed) persistRow("calls", existing);
    return { duplicate: true, callId: existing.id };
  }

  // Claim the execution id synchronously, so a retry that arrives while the
  // analysis is running does not create a second row.
  if (inflight.has(n.executionId)) return { duplicate: true, pending: true };
  inflight.add(n.executionId);
  try {
    const call = await buildCall(n);
    return { callId: saveCall(call).id, outcome: call.outcome };
  } finally {
    inflight.delete(n.executionId);
  }
}
