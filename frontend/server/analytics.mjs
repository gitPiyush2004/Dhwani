// ---------------------------------------------------------------------------
// Dashboard aggregates, computed from the real tables. No invented numbers:
// every trend is this period against the previous one.
// ---------------------------------------------------------------------------

import { agentId } from "./bolna/client.mjs";
import { config, integrations } from "./config.mjs";
import { LIVE, samePhone } from "./domain.mjs";
import { db } from "./state.mjs";
import { addDays, clinicDate, clinicInstant, clinicMinutes, shortDay, toMinutes, weekdayOf } from "./time.mjs";

const DAY = 864e5;
const trend = (cur, prev) => (prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100));
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const between = (iso, from, to) => {
  const t = new Date(iso ?? 0).getTime();
  return t >= from && t < to;
};
const createdAt = (a) => a.createdAt ?? a.startsAt;
const fee = (a) => db.doctors.find((d) => d.id === a.doctorId)?.fee ?? 0;

/** True when no doctor has hours at that instant: "the clinic is closed". */
function clinicClosedAt(iso) {
  const date = clinicDate(iso);
  const mins = clinicMinutes(iso);
  return !db.doctors.some((d) =>
    d.availability.some((b) => b.day === weekdayOf(date) && mins >= toMinutes(b.start) && mins < toMinutes(b.end))
  );
}

/** Missed or dropped calls whose caller later got through or got booked. */
function recoveredCount(from, to) {
  return db.calls.filter((c) => {
    if (!["missed", "dropped"].includes(c.outcome) || !between(c.startedAt, from, to)) return false;
    const after = new Date(c.startedAt).getTime();
    return (
      db.calls.some((o) => o !== c && samePhone(o.phone, c.phone) && o.resolved && new Date(o.startedAt).getTime() > after) ||
      db.appointments.some((a) => samePhone(a.phone, c.phone) && new Date(createdAt(a)).getTime() > after)
    );
  }).length;
}

export function dashboardStats() {
  const now = Date.now();
  const today = clinicDate();
  const startToday = new Date(clinicInstant(today, "00:00")).getTime();
  const startYesterday = startToday - DAY;
  const sameTimeYesterday = now - DAY;

  const callsToday = db.calls.filter((c) => between(c.startedAt, startToday, now + 1)).length;
  const callsYesterday = db.calls.filter((c) => between(c.startedAt, startYesterday, sameTimeYesterday)).length;

  const aiBooked = (from, to) =>
    db.appointments.filter((a) => a.bookedBy === "ai" && LIVE(a) && between(createdAt(a), from, to));
  const bookedToday = aiBooked(startToday, now + 1).length;
  const bookedYesterday = aiBooked(startYesterday, sameTimeYesterday).length;

  const week = 7 * DAY;
  const recovered = recoveredCount(now - week, now + 1);
  const recoveredPrev = recoveredCount(now - 2 * week, now - week);

  const connected = (from, to) => db.calls.filter((c) => c.durationSec > 0 && between(c.startedAt, from, to)).map((c) => c.durationSec);
  const avgNow = avg(connected(now - week, now + 1));
  const avgPrev = avg(connected(now - 2 * week, now - week));

  // The Overview headline reads "bookings recovered, last 7 days".
  const revenue = aiBooked(now - week, now + 1).reduce((s, a) => s + fee(a), 0);
  const revenuePrev = aiBooked(now - 2 * week, now - week).reduce((s, a) => s + fee(a), 0);

  return {
    callsToday,
    appointmentsBooked: bookedToday,
    missedRecovered: recovered,
    avgDurationSec: Math.round(avgNow),
    revenueRecovered: revenue,
    bookedWhileClosed: aiBooked(now - week, now + 1).filter((a) => clinicClosedAt(createdAt(a))).length,
    trends: {
      callsToday: trend(callsToday, callsYesterday),
      appointmentsBooked: trend(bookedToday, bookedYesterday),
      missedRecovered: trend(recovered, recoveredPrev),
      avgDurationSec: avgPrev ? trend(avgNow, avgPrev) : 0,
      revenueRecovered: trend(revenue, revenuePrev),
    },
  };
}

export function callsPerDay(days = 7) {
  const today = clinicDate();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const dayCalls = db.calls.filter((c) => clinicDate(c.startedAt) === date);
    out.push({
      date: clinicInstant(date, "00:00"),
      label: shortDay(date),
      answered: dayCalls.filter((c) => c.durationSec > 0).length,
      neededHuman: dayCalls.filter((c) => c.outcome === "human").length,
    });
  }
  return out;
}

const OUTCOME_LABELS = {
  booked: "Booked",
  faq: "FAQ answered",
  human: "Handed to human",
  dropped: "Dropped",
  missed: "Missed",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
};

export function callOutcomes() {
  const counts = {};
  for (const c of db.calls) counts[c.outcome] = (counts[c.outcome] ?? 0) + 1;
  return Object.keys(counts)
    .map((key) => ({ key, label: OUTCOME_LABELS[key] ?? key, value: counts[key] }))
    .sort((a, b) => b.value - a.value);
}

export function agentMetrics() {
  const calls = db.calls.filter((c) => c.outcome !== "missed");
  const total = calls.length;
  const resolved = calls.filter((c) => c.resolved).length;
  const handoffs = calls.filter((c) => c.outcome === "human").length;
  const answered = calls.filter((c) => c.durationSec > 0);

  const byIntent = new Map();
  for (const c of db.calls) {
    const e = byIntent.get(c.intent) ?? { total: 0, resolved: 0 };
    e.total += 1;
    if (c.resolved) e.resolved += 1;
    byIntent.set(c.intent, e);
  }

  const today = clinicDate();
  let carry = total ? resolved / total : 0;
  const accuracyTrend = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const day = calls.filter((c) => clinicDate(c.startedAt) === date);
    if (day.length) carry = day.filter((c) => c.resolved).length / day.length;
    return { label: shortDay(date), value: Math.round(carry * 100) / 100 };
  });

  const unresolved = db.calls.filter((c) => !c.resolved);
  return {
    resolutionRate: total ? resolved / total : 0,
    containmentRate: total ? (total - handoffs) / total : 0,
    avgHandleSec: Math.round(avg(answered.map((c) => c.durationSec))),
    humanHandoffs: handoffs,
    needsReview: unresolved.length,
    reviewQueue: unresolved.map((c) => c.id),
    accuracyTrend,
    intents: [...byIntent.entries()]
      .map(([intent, v]) => ({ intent, total: v.total, resolved: v.resolved, accuracy: v.total ? v.resolved / v.total : 0 }))
      .sort((a, b) => b.total - a.total),
  };
}

export function usage() {
  const month = clinicDate().slice(0, 7);
  const seconds = db.calls.filter((c) => clinicDate(c.startedAt).startsWith(month)).reduce((s, c) => s + (c.durationSec || 0), 0);
  const [y, m] = month.split("-").map(Number);
  const renews = clinicInstant(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, "00:00");
  return {
    plan: db.usage.plan ?? "Starter",
    minutesIncluded: db.usage.minutesIncluded ?? 500,
    ratePerMinute: db.usage.ratePerMinute ?? 6,
    minutesUsed: Math.ceil(seconds / 60),
    renewsAt: renews,
  };
}

/** The go-live checklist, ticked by what is actually configured. */
export function onboarding() {
  const clinic = db.clinic ?? {};
  const overrides = db.meta.onboardingDone ?? {};
  const computed = {
    "ob-1": Boolean(clinic.name && clinic.address),
    "ob-2": db.doctors.some((d) => d.availability.length > 0),
    "ob-3": Boolean((clinic.agent?.greeting || clinic.greeting) && clinic.faqs?.length),
    "ob-4": Boolean(integrations.bolna() && agentId() && config.bolna.phoneNumber),
    "ob-5": db.calls.some((c) => c.executionId),
  };
  return db.onboarding.map((s) => ({ ...s, done: Boolean(computed[s.id] || overrides[s.id]) }));
}
