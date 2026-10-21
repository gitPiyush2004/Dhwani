// ---------------------------------------------------------------------------
// Booking rules. Everything that creates or moves an appointment goes through
// here, whether it comes from the dashboard, the phone agent (Bolna tools) or
// the chat agent, so all three obey the same guard.
//
// Every function that checks a slot and then writes is synchronous: there is
// no await between the check and the mutation, which is what makes the
// double-booking guard atomic in a single Node process.
// ---------------------------------------------------------------------------

import { EventEmitter } from "node:events";
import { makeId } from "./data.mjs";
import { db } from "./state.mjs";
import {
  addDays,
  clinicDate,
  clinicInstant,
  clinicMinutes,
  fromMinutes,
  toMinutes,
  weekdayOf,
} from "./time.mjs";

/* --- persistence hooks --------------------------------------------- */

let store = { saveRow() {}, saveTable() {} };
export const useStore = (s) => (store = s);
export const persistRow = (table, record) => store.saveRow(table, record);
export const persistTable = (table) => store.saveTable(table);

/** "knowledge" fires when anything the agent's prompt depends on changes. */
export const events = new EventEmitter();
export const knowledgeChanged = () => events.emit("knowledge");

export const SLOT_TAKEN = "That slot is already taken. Please pick another time.";

export const LIVE = (a) => a.status !== "cancelled";

/* --- doctors -------------------------------------------------------- */

const SPECIALITY_HINTS = [
  [/child|kid|baby|bachch|bacch|infant|paed|pediat|बच्च/, /paed|pediat|child/],
  [/women|woman|lady|ladies|pregnan|gyn|period|mahila|महिला/, /gyn|obst|women/],
  [/skin|derma|rash|twacha/, /derma|skin/],
  [/teeth|tooth|dant|dental/, /dent/],
  [/eye|aankh|vision/, /ophth|eye/],
  [/bone|joint|ortho|haddi/, /ortho/],
  [/heart|cardio|dil/, /cardio/],
  [/general|physician|fever|bukhar|cold|regular|family/, /general|physician|family/],
];

const normal = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\bdr\.?\s*/g, "")
    .replace(/\bdoctor\b|\bsahab\b|\bji\b|\bmadam\b|\bsir\b/g, "")
    .replace(/[^a-zऀ-ॿ\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Finds a doctor by id, name, surname or speciality. Null when ambiguous or unknown. */
export function findDoctor(query) {
  const q = String(query ?? "").trim();
  if (!q) return db.doctors.length === 1 ? db.doctors[0] : null;
  const byId = db.doctors.find((d) => d.id.toLowerCase() === q.toLowerCase());
  if (byId) return byId;

  const n = normal(q);
  if (!n) return db.doctors.length === 1 ? db.doctors[0] : null;
  const exact = db.doctors.find((d) => normal(d.name) === n);
  if (exact) return exact;

  const tokens = n.split(" ").filter((t) => t.length > 1);
  const scored = db.doctors
    .map((d) => {
      const name = normal(d.name).split(" ");
      const score = tokens.reduce((s, t) => s + (name.includes(t) ? 2 : name.some((w) => w.startsWith(t) || t.startsWith(w)) ? 1 : 0), 0);
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) return scored[0].d;

  for (const [ask, spec] of SPECIALITY_HINTS) {
    if (!ask.test(n)) continue;
    const matches = db.doctors.filter((d) => spec.test(d.speciality.toLowerCase()));
    if (matches.length === 1) return matches[0];
  }
  const bySpeciality = db.doctors.filter((d) => normal(d.speciality).includes(n));
  return bySpeciality.length === 1 ? bySpeciality[0] : null;
}

/* --- slots ---------------------------------------------------------- */

const overlaps = (aStart, aMin, bStart, bMin) => aStart < bStart + bMin * 60_000 && bStart < aStart + aMin * 60_000;

/** True when the doctor already has a live appointment overlapping this time. */
export function slotTaken(doctorId, startsAt, ignoreId, durationMin) {
  const t = new Date(startsAt).getTime();
  const doctor = db.doctors.find((d) => d.id === doctorId);
  const len = Number(durationMin) || doctor?.slotDurationMin || 15;
  return db.appointments.some(
    (a) =>
      a.id !== ignoreId &&
      a.doctorId === doctorId &&
      LIVE(a) &&
      overlaps(t, len, new Date(a.startsAt).getTime(), a.durationMin || len)
  );
}

/** True when the slot sits fully inside one of the doctor's hour blocks. */
export function withinHours(doctor, startsAt, durationMin = doctor.slotDurationMin) {
  const date = clinicDate(startsAt);
  const start = clinicMinutes(startsAt);
  return doctor.availability.some(
    (b) => b.day === weekdayOf(date) && start >= toMinutes(b.start) && start + durationMin <= toMinutes(b.end)
  );
}

/**
 * Free "HH:mm" slots (clinic time) for a doctor on a clinic date. Past times
 * today are excluded, with a 10 minute lead so nobody is booked for "now".
 */
export function freeSlots(doctor, date, { ignoreId } = {}) {
  const out = [];
  const nowCutoff = Date.now() + 10 * 60_000;
  const blocks = doctor.availability
    .filter((b) => b.day === weekdayOf(date))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (const block of blocks) {
    const end = toMinutes(block.end);
    for (let t = toMinutes(block.start); t + doctor.slotDurationMin <= end; t += doctor.slotDurationMin) {
      const hhmm = fromMinutes(t);
      const iso = clinicInstant(date, hhmm);
      if (new Date(iso).getTime() < nowCutoff) continue;
      if (!slotTaken(doctor.id, iso, ignoreId, doctor.slotDurationMin)) out.push(hhmm);
    }
  }
  return out;
}

/** The next date (from `from`, inclusive) with any free slot, within `days`. */
export function nextAvailable(doctor, from = clinicDate(), days = 21) {
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const slots = freeSlots(doctor, date);
    if (slots.length) return { date, slots };
  }
  return null;
}

/* --- appointments --------------------------------------------------- */

const digits = (p) => String(p ?? "").replace(/\D/g, "").slice(-10);
export const samePhone = (a, b) => digits(a).length >= 10 && digits(a) === digits(b);

/** Upcoming live appointments for a caller, soonest first. */
export function upcomingForPhone(phone) {
  const now = Date.now() - 60 * 60_000;
  return db.appointments
    .filter((a) => samePhone(a.phone, phone) && LIVE(a) && a.status !== "completed" && new Date(a.startsAt).getTime() >= now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

const fail = (status, error) => ({ ok: false, status, error });

/**
 * Validates and creates an appointment in one synchronous step.
 * `strictHours` (used for the AI) rejects times outside the doctor's hours and
 * times in the past; front-desk staff may override both.
 */
export function createAppointment(input, { strictHours = input.bookedBy !== "staff", dryRun = false } = {}) {
  const { patientName, phone, doctorId, startsAt } = input ?? {};
  if (!patientName || !phone || !doctorId || !startsAt) {
    return fail(422, "patientName, phone, doctorId and startsAt are required");
  }
  const doctor = db.doctors.find((d) => d.id === doctorId);
  if (!doctor) return fail(404, `Doctor ${doctorId} not found`);
  const t = new Date(startsAt);
  if (Number.isNaN(t.getTime())) return fail(422, "startsAt must be an ISO 8601 date");
  const durationMin = Number(input.durationMin) || doctor.slotDurationMin;

  if (strictHours) {
    if (t.getTime() < Date.now() - 5 * 60_000) return fail(422, "That time has already passed. Please pick a future slot.");
    if (!withinHours(doctor, t.toISOString(), durationMin)) {
      return fail(422, `${doctor.name} is not available at that time.`);
    }
  }
  if (slotTaken(doctorId, t.toISOString(), undefined, durationMin)) return fail(409, SLOT_TAKEN);

  const now = new Date().toISOString();
  const appointment = {
    id: makeId("apt"),
    patientName: String(patientName).trim(),
    phone: String(phone).trim(),
    doctorId,
    startsAt: t.toISOString(),
    durationMin,
    reason: String(input.reason ?? "").trim(),
    status: "confirmed",
    bookedBy: input.bookedBy === "staff" ? "staff" : "ai",
    whatsappSent: false,
    confirmationChannel: null,
    createdAt: now,
    updatedAt: now,
  };
  if (dryRun) return { ok: true, appointment, dryRun: true };

  db.appointments.push(appointment);
  db.appointments.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  persistRow("appointments", appointment);
  return { ok: true, appointment };
}

const EDITABLE = ["patientName", "phone", "reason", "status", "doctorId", "durationMin", "whatsappSent", "bookedBy"];
const STATUSES = new Set(["confirmed", "rescheduled", "cancelled", "completed"]);

/**
 * One function for reschedule, cancel, complete and edits.
 * A startsAt change implies "rescheduled" unless a status is given.
 */
export function updateAppointment(id, patch, { strictHours = false, dryRun = false } = {}) {
  const apt = db.appointments.find((a) => a.id === id);
  if (!apt) return fail(404, `Appointment ${id} not found`);
  if (patch.status && !STATUSES.has(patch.status)) return fail(422, `Unknown status ${patch.status}`);

  const next = { ...apt };
  for (const k of EDITABLE) if (patch[k] !== undefined) next[k] = patch[k];

  const doctor = db.doctors.find((d) => d.id === next.doctorId);
  if (!doctor) return fail(404, `Doctor ${next.doctorId} not found`);

  let moved = false;
  if (patch.startsAt) {
    const t = new Date(patch.startsAt);
    if (Number.isNaN(t.getTime())) return fail(422, "startsAt must be an ISO 8601 date");
    next.startsAt = t.toISOString();
    moved = next.startsAt !== apt.startsAt || next.doctorId !== apt.doctorId;
  } else if (next.doctorId !== apt.doctorId) {
    moved = true;
  }

  if (moved && next.status !== "cancelled") {
    if (strictHours) {
      if (new Date(next.startsAt).getTime() < Date.now()) return fail(422, "That time has already passed.");
      if (!withinHours(doctor, next.startsAt, next.durationMin)) return fail(422, `${doctor.name} is not available at that time.`);
    }
    if (slotTaken(next.doctorId, next.startsAt, id, next.durationMin)) return fail(409, SLOT_TAKEN);
    if (!patch.status) next.status = "rescheduled";
  }
  if (next.status === "cancelled") next.whatsappSent = false;
  next.updatedAt = new Date().toISOString();
  if (dryRun) return { ok: true, appointment: next, moved, dryRun: true };

  const previousStatus = apt.status;
  Object.assign(apt, next);
  db.appointments.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  persistRow("appointments", apt);
  return { ok: true, appointment: apt, moved, previousStatus };
}

/** Records the result of a confirmation message on the appointment. */
export function recordConfirmation(apt, channel) {
  apt.whatsappSent = channel === "whatsapp";
  apt.confirmationChannel = channel;
  apt.updatedAt = new Date().toISOString();
  persistRow("appointments", apt);
}
