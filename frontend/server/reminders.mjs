// ---------------------------------------------------------------------------
// Appointment reminders: the "reminder" campaign on the Outbound page.
//
// While that campaign is active, once a day at REMINDER_TIME (clinic time)
// every patient with an appointment tomorrow gets a WhatsApp (or SMS)
// reminder. The campaign's funnel counts are real: audience = appointments,
// contacted = attempts, connected = delivered, converted = still booked.
// ---------------------------------------------------------------------------

import { config } from "./config.mjs";
import { LIVE, persistTable } from "./domain.mjs";
import { messagingStatus, notifyPatient } from "./messaging.mjs";
import { db } from "./state.mjs";
import { addDays, clinicDate, clinicTime } from "./time.mjs";

export async function runReminders({ force = false } = {}) {
  const campaign = db.campaigns.find((c) => c.type === "reminder" && c.status === "active");
  if (!campaign) return { skipped: "The reminder campaign is not active" };
  if (!messagingStatus().configured) return { skipped: "No WhatsApp or SMS provider is configured" };

  const today = clinicDate();
  if (!force && db.meta.remindersSentFor === today) return { skipped: "Already sent today" };

  const tomorrow = addDays(today, 1);
  const due = db.appointments.filter((a) => LIVE(a) && a.status !== "completed" && clinicDate(a.startsAt) === tomorrow);

  db.meta.remindersSentFor = today;
  persistTable("meta");

  let delivered = 0;
  for (const apt of due) {
    const { channel } = await notifyPatient("reminder", apt);
    if (channel) delivered += 1;
  }

  campaign.audience = (campaign.audience ?? 0) + due.length;
  campaign.contacted = (campaign.contacted ?? 0) + due.length;
  campaign.connected = (campaign.connected ?? 0) + delivered;
  campaign.converted = (campaign.converted ?? 0) + delivered;
  persistTable("campaigns");
  console.log(`[reminders] ${delivered}/${due.length} reminders delivered for ${tomorrow}`);
  return { date: tomorrow, due: due.length, delivered };
}

export function startReminderSchedule() {
  const timer = setInterval(() => {
    if (clinicTime(Date.now()) >= config.messaging.reminderTime && db.meta.remindersSentFor !== clinicDate()) {
      runReminders().catch((err) => console.error("[reminders] failed:", err));
    }
  }, 5 * 60_000);
  timer.unref?.();
}
