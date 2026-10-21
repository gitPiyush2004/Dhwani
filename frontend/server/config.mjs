// ---------------------------------------------------------------------------
// Runtime configuration, read once from the environment.
// Every integration switches on when its variables are present and stays off
// (with an honest status in GET /api/integrations) when they are not.
// See server/.env.example for the full list with explanations.
// ---------------------------------------------------------------------------

import { loadEnv } from "./env.mjs";

loadEnv();

const env = (k, fallback = "") => (process.env[k] ?? "").trim() || fallback;
const bool = (k, fallback = false) => {
  const v = env(k).toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes";
};

function googleCredentials() {
  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (raw) {
    try {
      const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      const json = JSON.parse(text);
      return { email: json.client_email, privateKey: json.private_key };
    } catch {
      console.warn("[config] GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON or base64 JSON");
    }
  }
  const email = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = env("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  return email && privateKey ? { email, privateKey } : null;
}

export const config = {
  port: Number(env("PORT", "8787")),
  corsOrigins: env("CORS_ORIGINS", "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  /** Public HTTPS base URL of this API. Bolna needs it for tools and the webhook. */
  publicUrl: env("PUBLIC_URL").replace(/\/+$/, ""),

  /** Clinic time zone. India has no DST, so a fixed offset is exact. */
  timezone: env("CLINIC_TIMEZONE", "Asia/Kolkata"),
  utcOffset: env("CLINIC_UTC_OFFSET", "+05:30"),

  auth: {
    /** When set, the dashboard must log in with this password. */
    adminPassword: env("ADMIN_PASSWORD"),
    secret: env("AUTH_SECRET") || env("ADMIN_PASSWORD"),
    tokenTtlHours: Number(env("AUTH_TOKEN_TTL_HOURS", "720")),
  },

  store: {
    /** sheets | file | memory. Defaults to sheets when credentials exist, else file. */
    kind: env("STORE"),
    dataFile: env("DATA_FILE"),
    seedDemo: bool("SEED_DEMO_DATA", false),
  },

  sheets: {
    id: env("SHEET_ID"),
    credentials: googleCredentials(),
    refreshSec: Number(env("SHEETS_REFRESH_SEC", "60")),
  },

  bolna: {
    apiKey: env("BOLNA_API_KEY"),
    apiBase: env("BOLNA_API_BASE", "https://api.bolna.ai").replace(/\/+$/, ""),
    agentId: env("BOLNA_AGENT_ID"),
    /** Shared secret Bolna sends on tool calls (Bearer) and the webhook (?token=). */
    secret: env("BOLNA_SECRET"),
    phoneNumber: env("BOLNA_PHONE_NUMBER"),
    telephonyProvider: env("BOLNA_TELEPHONY_PROVIDER", "plivo"),
    llmProvider: env("BOLNA_LLM_PROVIDER", "google"),
    llmModel: env("BOLNA_LLM_MODEL", "gemini-2.5-flash"),
    ttsModel: env("BOLNA_TTS_MODEL", "bulbul:v3"),
    ttsVoice: env("BOLNA_TTS_VOICE", "priya"),
    sttModel: env("BOLNA_STT_MODEL", "saaras:v4"),
    language: env("BOLNA_LANGUAGE", "hi"),
    /** Push prompt changes to Bolna whenever the clinic, doctors or FAQs change. */
    autoSync: bool("BOLNA_AUTO_SYNC", true),
  },

  /** Dashboard chat agent and call summaries. OpenAI wins when both are set. */
  openai: {
    apiKey: env("OPENAI_API_KEY"),
    model: env("OPENAI_MODEL", "gpt-5-mini"),
  },

  gemini: {
    apiKey: env("GEMINI_API_KEY"),
    model: env("GEMINI_MODEL", "gemini-3.5-flash-lite"),
  },

  messaging: {
    meta: {
      token: env("META_WA_TOKEN"),
      phoneNumberId: env("META_WA_PHONE_NUMBER_ID"),
      template: env("META_WA_TEMPLATE"),
      templateLang: env("META_WA_TEMPLATE_LANG", "en"),
    },
    twilio: {
      accountSid: env("TWILIO_ACCOUNT_SID"),
      authToken: env("TWILIO_AUTH_TOKEN"),
      whatsappFrom: env("TWILIO_WHATSAPP_FROM"),
      smsFrom: env("TWILIO_SMS_FROM"),
    },
    /** Daily WhatsApp/SMS reminder for tomorrow's appointments, clinic time "HH:mm". */
    reminderTime: env("REMINDER_TIME", "18:00"),
  },
};

export const integrations = {
  sheets: () => Boolean(config.sheets.id && config.sheets.credentials),
  bolna: () => Boolean(config.bolna.apiKey),
  gemini: () => Boolean(config.gemini.apiKey),
  openai: () => Boolean(config.openai.apiKey),
  /** Any LLM for the dashboard chat and call analysis. */
  llm: () => Boolean(config.openai.apiKey || config.gemini.apiKey),
  meta: () => Boolean(config.messaging.meta.token && config.messaging.meta.phoneNumberId),
  twilio: () => Boolean(config.messaging.twilio.accountSid && config.messaging.twilio.authToken),
};
