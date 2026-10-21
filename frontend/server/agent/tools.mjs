// ---------------------------------------------------------------------------
// The receptionist's tools.
//
// One implementation, two callers:
//   * Bolna calls them over HTTP mid-call (routes in bolna/routes.mjs).
//   * The Gemini chat agent calls them in-process (agent/brain.mjs).
//
// Each tool takes loose, spoken-style arguments ("Dr. Sharma", "kal",
// "5:30 pm"), resolves them on the server in clinic time, and returns a small
// JSON object with a `message` the LLM can read straight back to the caller.
// The LLM never has to do date arithmetic or know an appointment's ISO time.
// ---------------------------------------------------------------------------

import {
  createAppointment,
  findDoctor,
  freeSlots,
  nextAvailable,
  persistTable,
  recordConfirmation,
  updateAppointment,
  upcomingForPhone,
} from "../domain.mjs";
import { messagingStatus, notifyPatient } from "../messaging.mjs";
import { db } from "../state.mjs";
import { formatAvailability } from "../store/schema.mjs";
import {
  addDays,
  clinicDate,
  clinicInstant,
  resolveDate,
  resolveTime,
  spokenDate,
  spokenWhen,
  time12,
} from "../time.mjs";

const MAX_DAYS_AHEAD = 90;

const doctorList = () =>
  db.doctors.map((d) => `${d.name} (${d.speciality}, fee Rs ${d.fee})`).join("; ");

const pickSlots = (slots, n = 6) => {
  if (slots.length <= n) return slots;
  // Spread the offer across the day instead of six consecutive morning slots.
  const step = slots.length / n;
  return Array.from({ length: n }, (_, i) => slots[Math.floor(i * step)]);
};

function resolveDoctor(query) {
  const doctor = findDoctor(query);
  if (doctor) return { doctor };
  return {
    error: {
      ok: false,
      message: `I could not tell which doctor "${query ?? ""}" means. Ask the caller to choose one of: ${doctorList()}.`,
    },
  };
}

function resolveDay(input) {
  const today = clinicDate();
  const date = resolveDate(input, today);
  if (!date) return { error: { ok: false, message: `I could not understand the date "${input ?? ""}". Ask the caller for the day again.` } };
  if (date < today) return { error: { ok: false, message: `${spokenDate(date)} has already passed. Ask for a future date.` } };
  if (date > addDays(today, MAX_DAYS_AHEAD)) {
    return { error: { ok: false, message: "That is too far ahead. Appointments can be booked up to three months in advance." } };
  }
  return { date };
}

/** Only promise a WhatsApp message when one can actually be sent. */
const confirmationLine = (what = "confirmation") =>
  messagingStatus().configured
    ? `Tell the caller a WhatsApp ${what} is on its way.`
    : "Do not promise a WhatsApp or SMS message.";

const isPlaceholder = (v) => !v || /[{}%]|from_number|unknown|caller/i.test(String(v));

/* --- tools ------------------------------------------------------------ */

export function checkSlots({ doctor: doctorQuery, date: dateInput }) {
  const { doctor, error } = resolveDoctor(doctorQuery);
  if (error) return error;
  const day = resolveDay(dateInput || "today");
  if (day.error) return day.error;

  const slots = freeSlots(doctor, day.date);
  if (slots.length) {
    const offer = pickSlots(slots);
    return {
      ok: true,
      doctor: doctor.name,
      date: day.date,
      day: spokenDate(day.date),
      available_times: offer.map(time12),
      all_free_times: slots.map(time12),
      total_free: slots.length,
      message: `${doctor.name} has ${slots.length} free slots on ${spokenDate(day.date)}. Suggest at most three, for example ${pickSlots(slots, 3).map(time12).join(", ")}. If the caller asks for a specific time, it is free only if it is in all_free_times: ${slots.map(time12).join(", ")}.`,
    };
  }

  const next = nextAvailable(doctor, addDays(day.date, 1));
  const worksThatDay = doctor.availability.some((b) => b.day === new Date(`${day.date}T00:00:00Z`).getUTCDay());
  const reason = worksThatDay ? "is fully booked" : "does not see patients";
  return {
    ok: true,
    doctor: doctor.name,
    date: day.date,
    available_times: [],
    next_available_date: next?.date ?? null,
    next_available_times: next ? pickSlots(next.slots, 3).map(time12) : [],
    message: next
      ? `${doctor.name} ${reason} on ${spokenDate(day.date)}. The next free day is ${spokenDate(next.date)}, at ${pickSlots(next.slots, 3).map(time12).join(", ")}.`
      : `${doctor.name} ${reason} on ${spokenDate(day.date)} and has no free slots in the next three weeks. Offer another doctor or a call back from the clinic.`,
  };
}

export function bookAppointment(args, { dryRun = false } = {}) {
  const patientName = String(args.patient_name ?? args.patientName ?? "").trim();
  const phone = String(args.phone ?? "").trim();
  if (!patientName || isPlaceholder(patientName)) return { ok: false, message: "Ask for the patient's full name before booking." };
  if (isPlaceholder(phone) || phone.replace(/\D/g, "").length < 10) {
    return { ok: false, message: "I need a valid 10 digit mobile number to book. Ask the caller for it." };
  }
  const { doctor, error } = resolveDoctor(args.doctor ?? args.doctorId);
  if (error) return error;
  const day = resolveDay(args.date);
  if (day.error) return day.error;
  const hhmm = resolveTime(args.time);
  if (!hhmm) return { ok: false, message: `I could not understand the time "${args.time ?? ""}". Ask again.` };

  const startsAt = clinicInstant(day.date, hhmm);
  const result = createAppointment(
    { patientName, phone, doctorId: doctor.id, startsAt, reason: args.reason ?? "", bookedBy: "ai" },
    { strictHours: true, dryRun }
  );

  if (!result.ok) {
    const alternatives = pickSlots(freeSlots(doctor, day.date), 3).map(time12);
    const next = alternatives.length ? null : nextAvailable(doctor, addDays(day.date, 1));
    const alt = alternatives.length
      ? `Free times that day: ${alternatives.join(", ")}.`
      : next
        ? `The next free day is ${spokenDate(next.date)}: ${pickSlots(next.slots, 3).map(time12).join(", ")}.`
        : "";
    const why =
      result.status === 409
        ? `Sorry, ${time12(hhmm)} on ${spokenDate(day.date)} was just taken.`
        : `${result.error}`;
    return { ok: false, message: `${why} ${alt} Apologise once and offer these. Never retry the same time.`.trim(), alternatives };
  }

  const apt = result.appointment;
  if (!dryRun) {
    void notifyPatient("confirmed", apt).then(({ channel }) => recordConfirmation(apt, channel));
  }
  return {
    ok: true,
    appointment_id: apt.id,
    patient: apt.patientName,
    doctor: doctor.name,
    when: spokenWhen(apt.startsAt),
    fee: `Rs ${doctor.fee}`,
    message: `Booked ${apt.patientName} with ${doctor.name} on ${spokenWhen(apt.startsAt)}. Fee is Rs ${doctor.fee}, paid at the clinic. ${confirmationLine()}${dryRun ? " (Test mode: nothing was saved.)" : ""}`,
  };
}

export function findAppointments({ phone }) {
  if (isPlaceholder(phone) || String(phone).replace(/\D/g, "").length < 10) {
    return { ok: false, message: "Ask for the mobile number the appointment was booked with." };
  }
  const list = upcomingForPhone(phone);
  if (!list.length) {
    return { ok: true, appointments: [], message: "No upcoming appointments for this number. Offer to book a new one." };
  }
  const appointments = list.map((a) => ({
    appointment_id: a.id,
    patient: a.patientName,
    doctor: db.doctors.find((d) => d.id === a.doctorId)?.name ?? a.doctorId,
    when: spokenWhen(a.startsAt),
  }));
  return {
    ok: true,
    appointments,
    message:
      appointments.length === 1
        ? `Found one appointment: ${appointments[0].patient} with ${appointments[0].doctor} on ${appointments[0].when} (id ${appointments[0].appointment_id}). Confirm with the caller before changing it.`
        : `Found ${appointments.length} appointments: ${appointments.map((a) => `${a.patient} with ${a.doctor} on ${a.when} (id ${a.appointment_id})`).join("; ")}. Ask which one they mean.`,
  };
}

export function rescheduleAppointment(args, { dryRun = false } = {}) {
  const id = String(args.appointment_id ?? args.appointmentId ?? "").trim();
  const apt = db.appointments.find((a) => a.id === id);
  if (!apt) return { ok: false, message: `No appointment with id ${id}. Use find_appointments first.` };
  const doctor = db.doctors.find((d) => d.id === apt.doctorId);
  const day = resolveDay(args.date);
  if (day.error) return day.error;
  const hhmm = resolveTime(args.time);
  if (!hhmm) return { ok: false, message: `I could not understand the time "${args.time ?? ""}".` };

  const result = updateAppointment(id, { startsAt: clinicInstant(day.date, hhmm) }, { strictHours: true, dryRun });
  if (!result.ok) {
    const alternatives = doctor ? pickSlots(freeSlots(doctor, day.date, { ignoreId: id }), 3).map(time12) : [];
    return {
      ok: false,
      message: `${result.status === 409 ? "That time is taken." : result.error} ${alternatives.length ? `Free times that day: ${alternatives.join(", ")}.` : "Offer another day."}`,
      alternatives,
    };
  }
  if (!dryRun) {
    void notifyPatient("rescheduled", result.appointment).then(({ channel }) => recordConfirmation(result.appointment, channel));
  }
  return {
    ok: true,
    appointment_id: id,
    when: spokenWhen(result.appointment.startsAt),
    message: `Moved the appointment to ${spokenWhen(result.appointment.startsAt)} with ${doctor?.name}. ${confirmationLine("update")}`,
  };
}

export function cancelAppointment(args, { dryRun = false } = {}) {
  const id = String(args.appointment_id ?? args.appointmentId ?? "").trim();
  const result = updateAppointment(id, { status: "cancelled" }, { dryRun });
  if (!result.ok) return { ok: false, message: `No appointment with id ${id}. Use find_appointments first.` };
  if (!dryRun) void notifyPatient("cancelled", result.appointment);
  return {
    ok: true,
    appointment_id: id,
    message: `Cancelled the appointment on ${spokenWhen(result.appointment.startsAt)}. Offer to book a new time if they want.`,
  };
}

const words = (s) =>
  new Set(
    String(s ?? "")
      .toLowerCase()
      .split(/[^a-z0-9ऀ-ॿ]+/)
      .filter((w) => w.length > 2)
  );

/** Answers from the clinic's FAQs and knowledge base, best matches first. */
export function getClinicInfo({ question }) {
  const q = words(question);
  const clinic = db.clinic ?? {};
  const faqs = clinic.faqs ?? [];
  const rank = (text) => [...words(text)].filter((w) => q.has(w)).length;

  const rankedFaqs = faqs.map((f) => ({ f, s: rank(`${f.question} ${f.answer}`) })).sort((a, b) => b.s - a.s);
  const rankedKb = db.knowledge.map((k) => ({ k, s: rank(`${k.title} ${k.body}`) })).sort((a, b) => b.s - a.s);

  const best = rankedFaqs[0];
  if (best && best.s > 0) {
    best.f.hits = (best.f.hits ?? 0) + 1;
    persistTable("clinic");
  }

  return {
    ok: true,
    clinic: clinic.name,
    address: clinic.address,
    phone: clinic.phone,
    doctors: db.doctors.map((d) => ({
      name: d.name,
      speciality: d.speciality,
      fee: `Rs ${d.fee}`,
      hours: formatAvailability(d.availability),
    })),
    faqs: rankedFaqs.slice(0, 4).map(({ f }) => ({ q: f.question, a: f.answer })),
    knowledge: rankedKb.filter((x) => x.s > 0).slice(0, 3).map(({ k }) => ({ title: k.title, text: k.body })),
    message:
      "Answer only from this information. If the answer is not here, say the clinic staff will call back, and offer to transfer.",
  };
}

/* --- registry --------------------------------------------------------- */

export const TOOL_DEFS = [
  {
    name: "check_slots",
    description:
      "Find free appointment times for a doctor on a day. Call this before offering any time. Never invent a time.",
    parameters: {
      type: "object",
      properties: {
        doctor: { type: "string", description: "Doctor's name or speciality, e.g. 'Dr. Sharma' or 'child specialist'" },
        date: { type: "string", description: "The day: YYYY-MM-DD, or words like 'today', 'tomorrow', 'kal', 'Monday'" },
      },
      required: ["doctor", "date"],
    },
    run: checkSlots,
    method: "GET",
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment. Only call after the caller confirmed the doctor, day and time, and you repeated their name back and they said yes.",
    parameters: {
      type: "object",
      properties: {
        patient_name: { type: "string", description: "Patient's full name, as confirmed by the caller" },
        phone: { type: "string", description: "Patient's 10 digit mobile number" },
        doctor: { type: "string", description: "Doctor's name" },
        date: { type: "string", description: "The day: YYYY-MM-DD or 'tomorrow' etc." },
        time: { type: "string", description: "Time as offered, e.g. '10:30 AM' or '17:00'" },
        reason: { type: "string", description: "Short reason for the visit, e.g. 'fever and cold'" },
      },
      required: ["patient_name", "phone", "doctor", "date", "time", "reason"],
    },
    run: bookAppointment,
    method: "POST",
  },
  {
    name: "find_appointments",
    description: "Look up a caller's upcoming appointments by phone number, before rescheduling or cancelling.",
    parameters: {
      type: "object",
      properties: { phone: { type: "string", description: "The 10 digit mobile number the appointment was booked with" } },
      required: ["phone"],
    },
    run: findAppointments,
    method: "GET",
  },
  {
    name: "reschedule_appointment",
    description: "Move an existing appointment to a new day and time. Check slots first and confirm with the caller.",
    parameters: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "Id from find_appointments" },
        date: { type: "string", description: "New day: YYYY-MM-DD or 'tomorrow' etc." },
        time: { type: "string", description: "New time, e.g. '11:00 AM'" },
      },
      required: ["appointment_id", "date", "time"],
    },
    run: rescheduleAppointment,
    method: "POST",
  },
  {
    name: "cancel_appointment",
    description: "Cancel an existing appointment after the caller confirms which one.",
    parameters: {
      type: "object",
      properties: { appointment_id: { type: "string", description: "Id from find_appointments" } },
      required: ["appointment_id"],
    },
    run: cancelAppointment,
    method: "POST",
  },
  {
    name: "get_clinic_info",
    description:
      "Get clinic facts: address, timings, fees, doctors' hours, FAQs and knowledge base. Use for any clinic question you cannot answer from the prompt.",
    parameters: {
      type: "object",
      properties: { question: { type: "string", description: "The caller's question" } },
      required: ["question"],
    },
    run: getClinicInfo,
    method: "GET",
  },
];

export const TOOLS = Object.fromEntries(TOOL_DEFS.map((t) => [t.name, t]));
