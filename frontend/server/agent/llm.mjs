// ---------------------------------------------------------------------------
// Which LLM the dashboard chat and the call analysis use: OpenAI when
// OPENAI_API_KEY is set, else Gemini when GEMINI_API_KEY is set.
// ---------------------------------------------------------------------------

import { integrations } from "../config.mjs";
import { generate, geminiModel } from "./gemini.mjs";
import { complete, openaiModel } from "./openai.mjs";

export const llmProvider = () => (integrations.openai() ? "openai" : integrations.gemini() ? "gemini" : null);

export const llmModel = () => (llmProvider() === "openai" ? openaiModel() : llmProvider() === "gemini" ? geminiModel() : null);

/** One prompt in, parsed JSON out. */
export async function completeJSON(prompt, maxTokens = 1500) {
  let text;
  if (llmProvider() === "openai") {
    text = (await complete({ messages: [{ role: "user", content: prompt }], json: true, maxTokens })).text;
  } else {
    text = (await generate({ contents: [{ role: "user", parts: [{ text: prompt }] }], json: true, maxTokens })).text;
  }
  return JSON.parse(text.replace(/^```(json)?|```$/g, "").trim());
}
