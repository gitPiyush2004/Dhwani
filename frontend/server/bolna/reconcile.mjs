// ---------------------------------------------------------------------------
// Safety net for the post-call webhook.
//
// Webhook deliveries can fail (a dropped connection, a tunnel restart, the API
// being down for a minute), and Bolna does not retry them. Every minute this
// lists the agent's recent executions and imports any finished call that is
// not in the call log yet, through the same idempotent handler the webhook
// uses. A call is never lost and never duplicated.
// ---------------------------------------------------------------------------

import { config, integrations } from "../config.mjs";
import { handleBolnaWebhook } from "../calls.mjs";
import { db } from "../state.mjs";
import { agentId, getExecution } from "./client.mjs";

const TERMINAL = new Set(["completed", "no-answer", "busy", "failed", "canceled", "stopped", "error", "balance-low"]);
const LOOKBACK_MS = 48 * 3600_000;
// Give the webhook a head start; Bolna sends "completed" a few minutes after hang-up.
const GRACE_MS = 90_000;

async function listRecent(id) {
  const res = await fetch(`${config.bolna.apiBase}/v2/agent/${id}/executions?page_size=25&page_number=1`, {
    headers: { Authorization: `Bearer ${config.bolna.apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Bolna executions list HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body.data) ? body.data : [];
}

export async function reconcileCalls() {
  const id = agentId();
  if (!integrations.bolna() || !id) return { skipped: true };
  const known = new Set(db.calls.map((c) => c.executionId).filter(Boolean));
  const now = Date.now();
  let imported = 0;
  for (const e of await listRecent(id)) {
    const exId = String(e.id ?? "");
    const age = now - new Date(e.updated_at ?? e.created_at ?? 0).getTime();
    if (!exId || known.has(exId) || !TERMINAL.has(String(e.status)) || age > LOOKBACK_MS || age < GRACE_MS) continue;
    const full = await getExecution(exId);
    const out = await handleBolnaWebhook(full);
    if (out.callId) {
      imported += 1;
      console.log(`[bolna] recovered call ${exId} (${out.outcome}) that the webhook missed`);
    }
  }
  return { imported };
}

export function startReconcile(everyMs = 60_000) {
  const tick = () => reconcileCalls().catch((err) => console.warn("[bolna] reconcile failed:", err.message));
  setTimeout(tick, 10_000).unref?.();
  setInterval(tick, everyMs).unref?.();
}
