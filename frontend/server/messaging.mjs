// ---------------------------------------------------------------------------
// Patient messages: WhatsApp first, SMS as the fallback.
//
// Providers, tried in order, each only when its env vars are set:
//   1. Meta WhatsApp Cloud API  (META_WA_TOKEN, META_WA_PHONE_NUMBER_ID,
//      META_WA_TEMPLATE for business-initiated messages)
//   2. Twilio WhatsApp          (TWILIO_* + TWILIO_WHATSAPP_FROM, the sandbox works)
//   3. Twilio SMS               (TWILIO_* + TWILIO_SMS_FROM)
//
// A messaging failure never fails a booking. The caller gets back which
// channel worked (or null) and records that truthfully on the appointment.
// ---------------------------------------------------------------------------

import { config, integrations } from "./config.mjs";
import { db } from "./state.mjs";
import { spokenWhen } from "./time.mjs";

/** "+91 98110 22334" / "09811022334" / "9811022334" -> "+919811022334" */
export function toE164(phone) {
  const digits = String(phone ?? "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  const bare = digits.replace(/^0+/, "");
  if (bare.length === 10) return `+91${bare}`;
  if (bare.length === 12 && bare.startsWith("91")) return `+${bare}`;
  return `+${bare}`;
}

const doctorName = (id) => db.doctors.find((d) => d.id === id)?.name ?? "the doctor";

export function messageFor(kind, apt) {
  const clinic = db.clinic ?? {};
  const first = String(apt.patientName ?? "").split(" ")[0] || "ji";
  const when = spokenWhen(apt.startsAt);
  const doctor = doctorName(apt.doctorId);
  switch (kind) {
    case "cancelled":
      return `Namaste ${first}, aapka ${doctor} ke saath ${when} ka appointment cancel ho gaya hai. Naya appointment ke liye ${clinic.phone ?? "clinic"} par call karein. - ${clinic.name ?? ""}`;
    case "reminder":
      return `Namaste ${first}! Reminder: kal ${when} par ${doctor} ke saath aapka appointment hai. Address: ${clinic.address ?? ""}. Reschedule ke liye ${clinic.phone ?? "clinic"} par call karein. - ${clinic.name ?? ""}`;
    case "rescheduled":
      return `Namaste ${first}! Aapka appointment ab ${when} par ${doctor} ke saath hai. Address: ${clinic.address ?? ""}. - ${clinic.name ?? ""}`;
    default:
      return `Namaste ${first}! Aapka appointment ${when} par ${doctor} ke saath confirm ho gaya hai. Address: ${clinic.address ?? ""}. Reschedule ke liye ${clinic.phone ?? "clinic"} par call karein. - ${clinic.name ?? ""}`;
  }
}

async function sendMetaWhatsApp(to, kind, apt, text) {
  const { token, phoneNumberId, template, templateLang } = config.messaging.meta;
  const useTemplate = template && kind !== "cancelled";
  const body = useTemplate
    ? {
        messaging_product: "whatsapp",
        to: to.replace("+", ""),
        type: "template",
        template: {
          name: template,
          language: { code: templateLang },
          components: [
            {
              type: "body",
              parameters: [
                String(apt.patientName ?? "").split(" ")[0] || "ji",
                spokenWhen(apt.startsAt),
                doctorName(apt.doctorId),
                db.clinic?.address ?? "",
              ].map((t) => ({ type: "text", text: t })),
            },
          ],
        },
      }
    : { messaging_product: "whatsapp", to: to.replace("+", ""), type: "text", text: { body: text } };

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Meta WhatsApp HTTP ${res.status}`);
  return json.messages?.[0]?.id ?? "sent";
}

async function sendTwilio(from, to, text) {
  const { accountSid, authToken } = config.messaging.twilio;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: to, Body: text }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message ?? `Twilio HTTP ${res.status}`);
  return json.sid ?? "sent";
}

export function messagingStatus() {
  const channels = [];
  if (integrations.meta()) channels.push("Meta WhatsApp");
  if (integrations.twilio() && config.messaging.twilio.whatsappFrom) channels.push("Twilio WhatsApp");
  if (integrations.twilio() && config.messaging.twilio.smsFrom) channels.push("Twilio SMS");
  return { configured: channels.length > 0, channels, lastError: lastMessagingError };
}

let lastMessagingError = null;

/**
 * Sends a patient message. Resolves to { channel: "whatsapp" | "sms" | null, error? }.
 * Never throws.
 */
export async function notifyPatient(kind, apt) {
  const to = toE164(apt.phone);
  if (!to) return { channel: null, error: "No phone number" };
  const text = messageFor(kind, apt);
  const errors = [];
  const tw = config.messaging.twilio;

  if (integrations.meta()) {
    try {
      await sendMetaWhatsApp(to, kind, apt, text);
      return { channel: "whatsapp" };
    } catch (err) {
      errors.push(`Meta: ${err.message}`);
    }
  }
  if (integrations.twilio() && tw.whatsappFrom) {
    try {
      const from = tw.whatsappFrom.startsWith("whatsapp:") ? tw.whatsappFrom : `whatsapp:${tw.whatsappFrom}`;
      await sendTwilio(from, `whatsapp:${to}`, text);
      return { channel: "whatsapp" };
    } catch (err) {
      errors.push(`Twilio WhatsApp: ${err.message}`);
    }
  }
  if (integrations.twilio() && tw.smsFrom) {
    try {
      await sendTwilio(tw.smsFrom, to, text);
      return { channel: "sms" };
    } catch (err) {
      errors.push(`Twilio SMS: ${err.message}`);
    }
  }

  if (!errors.length) return { channel: null, error: "No messaging provider configured" };
  lastMessagingError = errors.join("; ");
  console.warn(`[messaging] ${kind} for ${apt.id} not delivered: ${lastMessagingError}`);
  return { channel: null, error: lastMessagingError };
}
