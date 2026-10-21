// ---------------------------------------------------------------------------
// Minimal Gemini REST client (generateContent), zero dependencies.
//
// Notes from the current docs, which this client follows:
//   * Gemini 3+ returns a thoughtSignature with function calls. The model's
//     content must be echoed back verbatim, so callers push
//     `candidate.content` into history unchanged.
//   * Function responses go back in a role "user" turn of functionResponse
//     parts, matched by id.
//   * Gemini 3 uses thinkingConfig.thinkingLevel; 2.5 uses thinkingBudget.
//     Sending the wrong one is a 400, so it is chosen per model.
//   * New API keys may not get 2.5 models, and model ids change, so we try
//     the configured model and fall back down a list on "not found".
// ---------------------------------------------------------------------------

import { config } from "../config.mjs";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const FALLBACKS = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"];

let workingModel = null;

function thinkingFor(model) {
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: "low" };
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  return undefined;
}

export class GeminiError extends Error {}

/**
 * @param {{ system?: string, contents: object[], tools?: object[], json?: boolean, maxTokens?: number }} req
 * @returns {Promise<{ content: object, text: string, calls: object[], finishReason: string }>}
 */
export async function generate({ system, contents, tools, json = false, maxTokens = 1024 }) {
  if (!config.gemini.apiKey) throw new GeminiError("GEMINI_API_KEY is not set");
  const models = [...new Set([workingModel, config.gemini.model, ...FALLBACKS].filter(Boolean))];
  let lastErr;

  for (const model of models) {
    const body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      ...(tools?.length
        ? {
            tools: [
              {
                functionDeclarations: tools.map(({ name, description, parameters }) => ({ name, description, parameters })),
              },
            ],
          }
        : {}),
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(json ? { responseMimeType: "application/json" } : {}),
        ...(thinkingFor(model) ? { thinkingConfig: thinkingFor(model) } : {}),
      },
    };

    let res;
    try {
      res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": config.gemini.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      lastErr = new GeminiError(`Gemini request failed: ${err.message}`);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      lastErr = new GeminiError(`Gemini ${model}: ${msg}`);
      // Model unavailable for this key: try the next one. Anything else is fatal.
      if (res.status === 404 || (res.status === 400 && /model|not (found|supported)|thinking/i.test(msg)) || res.status === 403) {
        continue;
      }
      throw lastErr;
    }

    workingModel = model;
    const candidate = data.candidates?.[0];
    const content = candidate?.content ?? { role: "model", parts: [] };
    const parts = content.parts ?? [];
    return {
      model,
      content,
      text: parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim(),
      calls: parts.filter((p) => p.functionCall).map((p) => p.functionCall),
      finishReason: candidate?.finishReason ?? "UNKNOWN",
    };
  }
  throw lastErr ?? new GeminiError("No Gemini model available");
}

export const geminiModel = () => workingModel ?? config.gemini.model;
