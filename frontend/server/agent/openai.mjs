// ---------------------------------------------------------------------------
// Minimal OpenAI Chat Completions client, zero dependencies.
//
// Used for the dashboard's chat agent and the post-call summaries when
// OPENAI_API_KEY is set (it takes priority over Gemini). The phone agent's
// brain is configured separately, in Bolna.
//
// Newer models reject `temperature` and `max_tokens`, so this sends neither:
// only `max_completion_tokens`. Model ids change, so on "model not found" it
// falls back down a short list and remembers what worked.
// ---------------------------------------------------------------------------

import { config } from "../config.mjs";

const URL = "https://api.openai.com/v1/chat/completions";
const FALLBACKS = ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"];
let workingModel = null;

export class OpenAIError extends Error {}

/**
 * @param {{ messages: object[], tools?: object[], json?: boolean, maxTokens?: number }} req
 * @returns {Promise<{ message: object, text: string, calls: object[], model: string }>}
 */
export async function complete({ messages, tools, json = false, maxTokens = 1500 }) {
  if (!config.openai.apiKey) throw new OpenAIError("OPENAI_API_KEY is not set");
  const models = [...new Set([workingModel, config.openai.model, ...FALLBACKS].filter(Boolean))];
  let lastErr;

  for (const model of models) {
    const body = {
      model,
      messages,
      max_completion_tokens: maxTokens,
      ...(tools?.length
        ? {
            tools: tools.map(({ name, description, parameters }) => ({
              type: "function",
              function: { name, description, parameters },
            })),
          }
        : {}),
      ...(json ? { response_format: { type: "json_object" } } : {}),
    };

    let res;
    try {
      res = await fetch(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.openai.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      lastErr = new OpenAIError(`OpenAI request failed: ${err.message}`);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      lastErr = new OpenAIError(`OpenAI ${model}: ${msg}`);
      if (res.status === 404 || data?.error?.code === "model_not_found") continue;
      throw lastErr;
    }

    workingModel = model;
    const message = data.choices?.[0]?.message ?? { role: "assistant", content: "" };
    return {
      model,
      message,
      text: String(message.content ?? "").trim(),
      calls: (message.tool_calls ?? []).map((c) => {
        let args = {};
        try {
          args = JSON.parse(c.function?.arguments || "{}");
        } catch {
          /* leave empty: the tool will ask for what is missing */
        }
        return { id: c.id, name: c.function?.name, args };
      }),
    };
  }
  throw lastErr ?? new OpenAIError("No OpenAI model available");
}

export const openaiModel = () => workingModel ?? config.openai.model;
