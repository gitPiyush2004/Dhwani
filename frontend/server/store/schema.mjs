// ---------------------------------------------------------------------------
// Google Sheet tabs and the column <-> JSON mapping.
//
// The first columns of each tab are exactly the ones in the architecture plan
// (docs/ARCHITECTURE.md, "Data: Google Sheet tabs"). The extra columns after
// them carry what the dashboard needs beyond the plan. Columns are matched by
// header name, so the clinic can reorder them or add their own without
// breaking anything.
//
// Two traps handled here, both called out in docs/API-CONTRACT.md:
//   1. Sheets turns date-looking text into dates. We write RAW text and
//      normalise anything a human typed back to ISO 8601 on read.
//   2. "duration" (Calls) is seconds; "slot length" (Doctors) is minutes.
// ---------------------------------------------------------------------------

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CELL_LIMIT = 45_000;

/* --- primitive readers ---------------------------------------------- */

const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v, fallback = 0) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : fallback;
};
const bool = (v, fallback = false) => {
  if (typeof v === "boolean") return v;
  const s = str(v).toLowerCase();
  if (!s) return fallback;
  return ["true", "yes", "y", "1", "sent", "✓", "✔"].includes(s);
};
const json = (v, fallback) => {
  const s = str(v);
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
const list = (v) => {
  const parsed = json(v, null);
  if (Array.isArray(parsed)) return parsed.map(String);
  return str(v)
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
};
/** Anything date-like -> ISO 8601. Keeps ISO strings untouched. */
const isoDate = (v) => {
  const s = str(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toISOString();
  // dd/mm/yyyy hh:mm, as a human in India would type it
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(s);
  if (m) {
    let h = Number(m[4] ?? 0);
    if (m[7]?.toLowerCase() === "pm" && h < 12) h += 12;
    if (m[7]?.toLowerCase() === "am" && h === 12) h = 0;
    const p = (n) => String(n).padStart(2, "0");
    return new Date(
      `${m[3]}-${p(m[2])}-${p(m[1])}T${p(h)}:${m[5] ?? "00"}:${m[6] ?? "00"}+05:30`
    ).toISOString();
  }
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? s : t.toISOString();
};

/* --- weekly availability -------------------------------------------- */

/**
 * Human-readable availability, e.g. "Mon-Sat 09:00-13:00, 17:00-20:00".
 * Days with identical hours are grouped, runs of days become ranges.
 */
export function formatAvailability(blocks = []) {
  const byDay = new Map();
  for (const b of blocks) {
    const key = `${b.start}-${b.end}`;
    byDay.set(b.day, [...(byDay.get(b.day) ?? []), key]);
  }
  const groups = new Map();
  for (const [day, ranges] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const key = ranges.sort().join(", ");
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  const daysLabel = (days) => {
    const parts = [];
    let i = 0;
    while (i < days.length) {
      let j = i;
      while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
      parts.push(j - i >= 2 ? `${DAY_LABELS[days[i]]}-${DAY_LABELS[days[j]]}` : days.slice(i, j + 1).map((d) => DAY_LABELS[d]).join(","));
      i = j + 1;
    }
    return parts.join(",");
  };
  return [...groups.entries()].map(([ranges, days]) => `${daysLabel(days)} ${ranges}`).join("; ");
}

/** Accepts the JSON form from the contract or the human form above. */
export function parseAvailability(v) {
  const parsed = json(v, null);
  if (Array.isArray(parsed)) {
    return parsed
      .filter((b) => b && b.start && b.end)
      .map((b) => ({ day: Number(b.day), start: String(b.start), end: String(b.end) }));
  }
  const out = [];
  const norm = (t) => {
    const [h, m = "00"] = t.split(/[:.]/);
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  };
  for (const segment of str(v).split(/[;\n|]/)) {
    const s = segment.trim().toLowerCase();
    if (!s) continue;
    const firstTime = s.search(/\d{1,2}[:.]\d{2}\s*-/);
    if (firstTime < 0) continue;
    const dayPart = s.slice(0, firstTime);
    const timePart = s.slice(firstTime);
    const days = new Set();
    for (const token of dayPart.split(/[,\s]+/).filter(Boolean)) {
      const [a, b] = token.split("-").map((x) => DAY_KEYS.indexOf(x.slice(0, 3)));
      if (a < 0) continue;
      if (b === undefined || b < 0) days.add(a);
      else for (let d = a; d !== (b + 1) % 7; d = (d + 1) % 7) days.add(d);
    }
    for (const r of timePart.matchAll(/(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})/g)) {
      for (const day of days) out.push({ day, start: norm(r[1]), end: norm(r[2]) });
    }
  }
  return out.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
}

/* --- transcripts ------------------------------------------------------ */

/** Keeps the cell under the Sheets limit by dropping the oldest lines. */
function transcriptCell(lines = []) {
  let kept = lines.map(({ speaker, text, startSec }) => ({ speaker, text, startSec }));
  let out = JSON.stringify(kept);
  while (out.length > CELL_LIMIT && kept.length > 1) {
    kept = kept.slice(Math.ceil(kept.length / 10));
    out = JSON.stringify(kept);
  }
  return out.length > CELL_LIMIT ? out.slice(0, CELL_LIMIT) : out;
}

/* --- tabs --------------------------------------------------------------- */

export const TABS = {
  Appointments: {
    table: "appointments",
    rowLevel: true,
    headers: [
      "id", "patient", "phone", "doctor", "start time", "status", "booked by", "whatsapp sent",
      "duration (min)", "reason", "confirmation", "created at", "updated at",
    ],
    toRow: (a) => ({
      id: a.id,
      patient: a.patientName,
      phone: a.phone,
      doctor: a.doctorId,
      "start time": a.startsAt,
      status: a.status,
      "booked by": a.bookedBy,
      "whatsapp sent": Boolean(a.whatsappSent),
      "duration (min)": a.durationMin,
      reason: a.reason ?? "",
      confirmation: a.confirmationChannel ?? "",
      "created at": a.createdAt ?? "",
      "updated at": a.updatedAt ?? "",
    }),
    fromRow: (r) => ({
      id: str(r.id),
      patientName: str(r.patient),
      phone: str(r.phone),
      doctorId: str(r.doctor),
      startsAt: isoDate(r["start time"]),
      durationMin: num(r["duration (min)"], 15),
      reason: str(r.reason),
      status: str(r.status).toLowerCase() || "confirmed",
      bookedBy: str(r["booked by"]).toLowerCase() === "staff" ? "staff" : "ai",
      whatsappSent: bool(r["whatsapp sent"]),
      confirmationChannel: str(r.confirmation) || null,
      createdAt: isoDate(r["created at"]) || undefined,
      updatedAt: isoDate(r["updated at"]) || undefined,
    }),
  },

  Calls: {
    table: "calls",
    rowLevel: true,
    headers: [
      "id", "phone", "time", "duration", "language", "outcome", "summary", "transcript",
      "follow-up flag", "caller name", "intent", "resolved", "confidence", "sentiment",
      "recording url", "captured details", "tags", "ai actions", "bolna execution id",
    ],
    toRow: (c) => ({
      id: c.id,
      phone: c.phone,
      time: c.startedAt,
      duration: c.durationSec,
      language: c.language,
      outcome: c.outcome,
      summary: c.summary,
      transcript: transcriptCell(c.transcript),
      "follow-up flag": Boolean(c.needsFollowUp),
      "caller name": c.callerName,
      intent: c.intent,
      resolved: Boolean(c.resolved),
      confidence: c.confidence,
      sentiment: c.sentiment,
      "recording url": c.sourceRecordingUrl ?? c.recordingUrl ?? "",
      "captured details": JSON.stringify(c.extracted ?? {}),
      tags: (c.tags ?? []).join(", "),
      "ai actions": JSON.stringify(c.aiActions ?? []),
      "bolna execution id": c.executionId ?? "",
    }),
    fromRow: (r) => {
      const startedAt = isoDate(r.time) || new Date().toISOString();
      const transcript = json(r.transcript, []);
      return {
        id: str(r.id),
        callerName: str(r["caller name"]) || "Unknown caller",
        phone: str(r.phone),
        startedAt,
        durationSec: num(r.duration),
        language: str(r.language) || "Hinglish",
        outcome: str(r.outcome).toLowerCase() || "faq",
        sentiment: str(r.sentiment).toLowerCase() || "neutral",
        summary: str(r.summary),
        transcript: (Array.isArray(transcript) ? transcript : []).map((l, i) => ({
          speaker: l.speaker === "ai" ? "ai" : "patient",
          text: String(l.text ?? ""),
          startSec: Number(l.startSec ?? i * 6),
          ts: new Date(new Date(startedAt).getTime() + Number(l.startSec ?? i * 6) * 1000).toISOString(),
        })),
        extracted: json(r["captured details"], {}) ?? {},
        needsFollowUp: bool(r["follow-up flag"]),
        sourceRecordingUrl: str(r["recording url"]),
        recordingUrl: str(r["recording url"]),
        intent: str(r.intent) || "Clinic question",
        resolved: bool(r.resolved, true),
        confidence: num(r.confidence, 0.8),
        tags: list(r.tags),
        aiActions: json(r["ai actions"], null) ?? list(r["ai actions"]),
        executionId: str(r["bolna execution id"]) || undefined,
      };
    },
  },

  Doctors: {
    table: "doctors",
    headers: ["id", "name", "speciality", "fee", "weekly availability", "slot length"],
    toRow: (d) => ({
      id: d.id,
      name: d.name,
      speciality: d.speciality,
      fee: d.fee,
      "weekly availability": formatAvailability(d.availability),
      "slot length": d.slotDurationMin,
    }),
    fromRow: (r) => ({
      id: str(r.id),
      name: str(r.name),
      speciality: str(r.speciality) || "General Physician",
      fee: num(r.fee, 500),
      slotDurationMin: num(r["slot length"], 15) || 15,
      availability: parseAvailability(r["weekly availability"]),
    }),
  },

  FAQs: {
    table: "faqs",
    headers: ["id", "question", "answer", "hits"],
    toRow: (f) => ({ id: f.id, question: f.question, answer: f.answer, hits: f.hits ?? 0 }),
    fromRow: (r) => ({ id: str(r.id), question: str(r.question), answer: str(r.answer), hits: num(r.hits) }),
  },

  Clinic: {
    table: "clinic",
    single: true,
    headers: [
      "name", "address", "greeting", "escalation phone number", "clinic phone", "languages",
      "escalation triggers", "agent settings",
    ],
    toRow: (c) => ({
      name: c.name,
      address: c.address,
      greeting: c.greeting,
      "escalation phone number": c.escalation?.phone ?? "",
      "clinic phone": c.phone ?? "",
      languages: (c.languages ?? []).join(", "),
      "escalation triggers": (c.escalation?.triggers ?? []).join(", "),
      "agent settings": JSON.stringify(c.agent ?? {}),
    }),
    fromRow: (r) => ({
      name: str(r.name),
      address: str(r.address),
      greeting: str(r.greeting),
      phone: str(r["clinic phone"]),
      languages: list(r.languages),
      escalation: { phone: str(r["escalation phone number"]), triggers: list(r["escalation triggers"]) },
      agent: json(r["agent settings"], null),
    }),
  },

  Knowledge: {
    table: "knowledge",
    headers: ["id", "title", "body", "source", "updated at"],
    toRow: (k) => ({ id: k.id, title: k.title, body: k.body, source: k.source, "updated at": k.updatedAt }),
    fromRow: (r) => ({
      id: str(r.id),
      title: str(r.title),
      body: str(r.body),
      source: ["faq", "document", "staff"].includes(str(r.source)) ? str(r.source) : "staff",
      updatedAt: isoDate(r["updated at"]) || new Date().toISOString(),
    }),
  },

  Campaigns: {
    table: "campaigns",
    headers: [
      "id", "name", "type", "status", "channel", "audience", "contacted", "connected", "converted",
      "scheduled at", "script",
    ],
    toRow: (c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      channel: c.channel,
      audience: c.audience ?? 0,
      contacted: c.contacted ?? 0,
      connected: c.connected ?? 0,
      converted: c.converted ?? 0,
      "scheduled at": c.scheduledAt ?? "",
      script: c.script ?? "",
    }),
    fromRow: (r) => ({
      id: str(r.id),
      name: str(r.name),
      type: str(r.type) || "reminder",
      status: str(r.status) || "scheduled",
      channel: str(r.channel) === "voice" ? "voice" : "whatsapp",
      audience: num(r.audience),
      contacted: num(r.contacted),
      connected: num(r.connected),
      converted: num(r.converted),
      scheduledAt: isoDate(r["scheduled at"]) || undefined,
      script: str(r.script),
    }),
  },

  Settings: {
    table: "meta",
    headers: ["key", "value"],
  },
};

/** Which tab a table lives in. */
export const TAB_FOR = Object.fromEntries(Object.entries(TABS).map(([tab, t]) => [t.table, tab]));
