// ---------------------------------------------------------------------------
// The chat agent behind the dashboard's "Try the agent" dock and the Agent
// page's test console. Same prompt and same tools as the phone agent.
//
// With GEMINI_API_KEY it runs a real Gemini function-calling loop. Without it,
// a small rule-based fallback still answers from the clinic's real data.
//
// Bookings made here are dry runs: the tools validate everything and report
// what would happen, but nothing is written. Testing the agent must never put
// a fake patient in the clinic's calendar.
// ---------------------------------------------------------------------------

import { integrations } from "../config.mjs";
import { db } from "../state.mjs";
import { generate } from "./gemini.mjs";
import { llmProvider } from "./llm.mjs";
import { complete } from "./openai.mjs";
import { buildSystemPrompt } from "./prompt.mjs";
import { TOOL_DEFS, TOOLS, checkSlots, getClinicInfo } from "./tools.mjs";

const SESSION_TTL_MS = 30 * 60_000;
const MAX_STEPS = 5;
const sessions = new Map();

const EMERGENCY = /chest pain|seene (mein|me) dard|saans|breath|unconscious|behosh|bleeding|khoon|accident|stroke|seizure|daura|poison|zeher|suicide|marna chahta|108|emergency|सीने|सांस|बेहोश/i;
const HUMAN = /\b(human|staff|receptionist|insaan|real person|kisi se baat|manager)\b/i;

function session(id) {
  const now = Date.now();
  for (const [k, s] of sessions) if (now - s.at > SESSION_TTL_MS) sessions.delete(k);
  const key = id || `anon-${now}`;
  if (!sessions.has(key)) sessions.set(key, { contents: [], messages: [], at: now });
  const s = sessions.get(key);
  s.at = now;
  return s;
}

const fallbackTool = {
  name: "transfer_to_staff",
  description: "Hand the conversation to clinic staff: emergencies, the caller asks for a human, or you cannot help.",
  parameters: {
    type: "object",
    properties: { reason: { type: "string", description: "Why" } },
    required: ["reason"],
  },
};

/**
 * @returns {Promise<{ reply: string, actions: string[], escalated: boolean, engine: "openai" | "gemini" | "rules" }>}
 */
export async function chat({ sessionId, message, history }) {
  const text = String(message ?? "").trim();
  const provider = llmProvider();
  if (!provider) return rulesReply(text);

  const s = session(sessionId);
  if (provider === "openai") return openaiChat(s, text, history);

  if (!s.contents.length && Array.isArray(history)) {
    // A client without a session id can send the visible history instead.
    for (const h of history.slice(-12)) {
      const t = String(h?.text ?? "").trim();
      if (t) s.contents.push({ role: h.role === "ai" ? "model" : "user", parts: [{ text: t }] });
    }
    while (s.contents.length && s.contents[0].role === "model") s.contents.shift();
  }
  s.contents.push({ role: "user", parts: [{ text }] });

  try {
    return await geminiLoop(s);
  } catch (err) {
    // Never leave the dock silent: answer from the rules and start a fresh history.
    console.warn("[agent] Gemini failed, using rules:", err.message);
    s.contents = [];
    return { ...rulesReply(text), error: err.message };
  }
}

/** Runs one tool call from the model, in dry-run mode. */
function runTool(name, args, state) {
  state.actions.push(name);
  if (name === "transfer_to_staff") {
    state.escalated = true;
    return { ok: true, message: "Staff have been alerted and will call back on the caller's number." };
  }
  if (TOOLS[name]) return TOOLS[name].run(args ?? {}, { dryRun: true });
  return { ok: false, message: `Unknown tool ${name}` };
}

async function openaiChat(s, text, history) {
  if (!s.messages.length && Array.isArray(history)) {
    for (const h of history.slice(-12)) {
      const t = String(h?.text ?? "").trim();
      if (t) s.messages.push({ role: h.role === "ai" ? "assistant" : "user", content: t });
    }
  }
  s.messages.push({ role: "user", content: text });
  const state = { actions: [], escalated: false };
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const out = await complete({
        messages: [{ role: "system", content: buildSystemPrompt("chat") }, ...s.messages],
        tools: [...TOOL_DEFS, fallbackTool],
      });
      s.messages.push(out.message);
      if (!out.calls.length) {
        return { reply: out.text || "Ji, bataiye main aapki kya madad kar sakti hoon?", ...state, engine: "openai" };
      }
      for (const call of out.calls) {
        s.messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(runTool(call.name, call.args, state)) });
      }
    }
    return { reply: "Ek second, main staff se confirm karke batati hoon.", ...state, escalated: true, engine: "openai" };
  } catch (err) {
    console.warn("[agent] OpenAI failed, using rules:", err.message);
    s.messages = [];
    return { ...rulesReply(text), error: err.message };
  }
}

async function geminiLoop(s) {
  const actions = [];
  let escalated = false;
  const system = buildSystemPrompt("chat");

  for (let step = 0; step < MAX_STEPS; step++) {
    const out = await generate({ system, contents: s.contents, tools: [...TOOL_DEFS, fallbackTool] });
    s.contents.push(out.content.parts?.length ? out.content : { role: "model", parts: [{ text: out.text || "..." }] });

    if (!out.calls.length) {
      return { reply: out.text || "Ji, bataiye main aapki kya madad kar sakti hoon?", actions, escalated, engine: "gemini" };
    }

    const responses = out.calls.map((call) => {
      let result;
      if (call.name === "transfer_to_staff") {
        escalated = true;
        result = { ok: true, message: "Staff have been alerted and will call back on the caller's number." };
      } else if (TOOLS[call.name]) {
        result = TOOLS[call.name].run(call.args ?? {}, { dryRun: true });
      } else {
        result = { ok: false, message: `Unknown tool ${call.name}` };
      }
      actions.push(call.name);
      return { functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: result } };
    });
    s.contents.push({ role: "user", parts: responses });
  }
  return { reply: "Ek second, main staff se confirm karke batati hoon.", actions, escalated: true, engine: "gemini" };
}

/* --- fallback without an LLM ----------------------------------------- */

function rulesReply(message) {
  const m = message.toLowerCase();
  const clinic = db.clinic ?? {};
  const out = (reply, actions = [], escalated = false) => ({ reply, actions, escalated, engine: "rules" });

  if (EMERGENCY.test(m)) {
    return out("Yeh emergency lagti hai. Kripya abhi 108 par call karein. Main clinic staff ko turant alert kar rahi hoon.", ["transfer_to_staff"], true);
  }
  if (HUMAN.test(m)) {
    return out(`Zaroor. Clinic staff aapko ${clinic.phone ?? "jaldi"} se call back karenge.`, ["transfer_to_staff"], true);
  }
  if (/(book|appoint|dikhana|slot|milna|available|free|kal|tomorrow|aaj|today)/.test(m)) {
    const doctor = db.doctors.find((d) => m.includes(d.name.toLowerCase().replace(/^dr\.?\s*/, "").split(" ").pop()));
    if (doctor) {
      const date = /(kal|tomorrow)/.test(m) ? "tomorrow" : /parso/.test(m) ? "day after tomorrow" : "today";
      const r = checkSlots({ doctor: doctor.name, date });
      return out(
        r.available_times?.length
          ? `${doctor.name} ke paas ${r.day} ko ${r.available_times.slice(0, 3).join(", ")} free hai. Kaunsa time theek rahega?`
          : r.message,
        ["check_slots"]
      );
    }
    return out(
      `Bilkul! Aap kis doctor se milna chahenge? ${db.doctors.map((d) => `${d.name} (${d.speciality})`).join(", ")}.`
    );
  }
  if (/(fee|charge|kitni|kitna|price|cost|paisa)/.test(m)) {
    return out(db.doctors.map((d) => `${d.name}: ${d.fee} rupaye`).join(", ") + ".", ["get_clinic_info"]);
  }
  const info = getClinicInfo({ question: message });
  const top = info.faqs[0];
  const relevant = top && [...m.split(/\W+/)].some((w) => w.length > 3 && `${top.q} ${top.a}`.toLowerCase().includes(w));
  if (relevant) return out(top.a, ["get_clinic_info"]);
  if (info.knowledge[0]) return out(info.knowledge[0].text, ["get_clinic_info"]);
  return out("Samajh gayi. Appointment book karna hai, fees jaanni hai, ya clinic ke timings?");
}
