// ---------------------------------------------------------------------------
// Bolna REST client: create/update the agent, place calls, link numbers,
// fetch executions and recordings. Docs: https://www.bolna.ai/docs
// ---------------------------------------------------------------------------

import { config } from "../config.mjs";
import { persistTable } from "../domain.mjs";
import { toE164 } from "../messaging.mjs";
import { db } from "../state.mjs";
import { buildAgentPayload } from "./agent-config.mjs";

export class BolnaError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function bolna(path, { method = "GET", body } = {}) {
  if (!config.bolna.apiKey) throw new BolnaError("BOLNA_API_KEY is not set", 0);
  const res = await fetch(`${config.bolna.apiBase}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.bolna.apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const detail = data?.detail ?? data?.message ?? data?.error ?? data?.raw ?? `HTTP ${res.status}`;
    throw new BolnaError(`Bolna ${method} ${path} failed: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`, res.status);
  }
  return data;
}

export const agentId = () => config.bolna.agentId || db.meta.bolnaAgentId || "";

let lastSync = { at: null, ok: null, error: null };
export const lastSyncStatus = () => lastSync;

/** Creates the agent, or replaces its whole config if it exists. */
export async function syncAgent() {
  if (!config.publicUrl) {
    throw new BolnaError("PUBLIC_URL is not set. Bolna needs a public HTTPS URL to reach the tools and webhook.", 0);
  }
  if (!config.bolna.secret) throw new BolnaError("BOLNA_SECRET is not set", 0);
  const payload = buildAgentPayload();
  try {
    let id = agentId();
    let created = false;
    if (id) {
      try {
        await bolna(`/v2/agent/${id}`, { method: "PUT", body: payload });
      } catch (err) {
        if (err.status !== 404) throw err;
        id = "";
      }
    }
    if (!id) {
      const res = await bolna("/v2/agent", { method: "POST", body: payload });
      id = res.agent_id ?? res.id;
      created = true;
      db.meta.bolnaAgentId = id;
      persistTable("meta");
    }
    lastSync = { at: new Date().toISOString(), ok: true, error: null };
    return { agentId: id, created };
  } catch (err) {
    lastSync = { at: new Date().toISOString(), ok: false, error: err.message };
    throw err;
  }
}

/** Outbound call from the agent to a phone, e.g. "Call me" in the dashboard. */
export async function startCall(phone, userData = {}) {
  const id = agentId();
  if (!id) throw new BolnaError("The Bolna agent is not set up yet. Sync it from Settings first.", 0);
  const body = {
    agent_id: id,
    recipient_phone_number: toE164(phone),
    user_data: { timezone: config.timezone, ...userData },
  };
  if (config.bolna.phoneNumber) body.from_phone_number = toE164(config.bolna.phoneNumber);
  return bolna("/call", { method: "POST", body });
}

export const getMe = () => bolna("/user/me");
export const getAgent = (id = agentId()) => bolna(`/v2/agent/${id}`);
export const getExecution = (id) => bolna(`/executions/${id}`);
export const listPhoneNumbers = () => bolna("/phone-numbers/all");

/** Points an owned number's inbound calls at our agent. */
export async function linkInboundNumber(phone = config.bolna.phoneNumber) {
  const numbers = await listPhoneNumbers();
  const list = Array.isArray(numbers) ? numbers : numbers.data ?? numbers.phone_numbers ?? [];
  const target = list.find((n) => toE164(n.phone_number ?? n.number) === toE164(phone));
  if (!target) {
    throw new BolnaError(
      `Phone number ${phone} is not in this Bolna account. Numbers found: ${list.map((n) => n.phone_number ?? n.number).join(", ") || "none"}`,
      404
    );
  }
  return bolna("/inbound/setup", { method: "POST", body: { agent_id: agentId(), phone_number_id: target.id } });
}

/** Streams a call recording, authenticating to Bolna when the URL is theirs. */
export async function fetchRecording(url) {
  const isBolna = /bolna\.(ai|dev)/.test(new URL(url).hostname);
  const res = await fetch(url, {
    headers: isBolna && config.bolna.apiKey ? { Authorization: `Bearer ${config.bolna.apiKey}` } : {},
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok && isBolna) return fetch(url, { signal: AbortSignal.timeout(30_000) });
  return res;
}

/* --- keep the agent's prompt in step with the clinic ---------------- */

let syncTimer = null;
/** Debounced: many edits in a row become one Bolna update. */
export function scheduleAgentSync(delayMs = 8000) {
  if (!config.bolna.autoSync || !config.bolna.apiKey || !config.publicUrl || !config.bolna.secret || !agentId()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncAgent()
      .then(() => console.log("[bolna] agent prompt synced"))
      .catch((err) => console.warn("[bolna] auto-sync failed:", err.message));
  }, delayMs);
  syncTimer.unref?.();
}
