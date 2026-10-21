// ---------------------------------------------------------------------------
// Clinic-time helpers.
//
// The server may run in UTC (Render, Railway) while the clinic is in IST, so
// nothing here uses the machine's local time zone. Every "day" and every
// "HH:mm" is in clinic time, computed from a fixed UTC offset.
// ---------------------------------------------------------------------------

import { config } from "./config.mjs";

const offsetMs = (() => {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(config.utcOffset);
  if (!m) return 330 * 60_000;
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return (m[1] === "-" ? -mins : mins) * 60_000;
})();

const pad = (n) => String(n).padStart(2, "0");

/** Shifted Date whose UTC fields read as clinic wall-clock time. */
const wall = (t) => new Date(new Date(t).getTime() + offsetMs);

/** "YYYY-MM-DD" in clinic time. */
export const clinicDate = (t = Date.now()) => wall(t).toISOString().slice(0, 10);

/** "HH:mm" in clinic time. */
export const clinicTime = (t) => wall(t).toISOString().slice(11, 16);

/** Minutes since clinic midnight. */
export const clinicMinutes = (t) => {
  const w = wall(t);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
};

/** ISO instant for a clinic date and "HH:mm". */
export const clinicInstant = (date, hhmm) =>
  new Date(`${date}T${hhmm}:00${config.utcOffset}`).toISOString();

/** 0 = Sunday, like Date.getDay(), for a "YYYY-MM-DD". */
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

export const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
};

export const fromMinutes = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const dayName = (date) => DAY_NAMES[weekdayOf(date)];
export const shortDay = (date) => dayName(date).slice(0, 3);

/** "10:30 AM" */
export function time12(hhmm) {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

/** "Thursday, 22 October" */
export function spokenDate(date) {
  const [, mo, d] = date.split("-").map(Number);
  return `${dayName(date)}, ${d} ${MONTHS[mo - 1]}`;
}

/** "Thursday, 22 October at 10:30 AM" for an ISO instant. */
export const spokenWhen = (iso) => `${spokenDate(clinicDate(iso))} at ${time12(clinicTime(iso))}`;

/* ------------------------------------------------------------------ */
/* Parsing what callers (and LLMs) say                                */
/* ------------------------------------------------------------------ */

const WEEKDAYS = [
  ["sunday", "sun", "ravivar", "itwar", "itvaar", "रविवार", "इतवार"],
  ["monday", "mon", "somvar", "somvaar", "सोमवार"],
  ["tuesday", "tue", "tues", "mangalvar", "mangalwar", "मंगलवार"],
  ["wednesday", "wed", "budhvar", "budhwar", "बुधवार"],
  ["thursday", "thu", "thur", "thurs", "guruvar", "guruwar", "brihaspativar", "गुरुवार", "बृहस्पतिवार"],
  ["friday", "fri", "shukravar", "shukrawar", "शुक्रवार"],
  ["saturday", "sat", "shanivar", "shaniwar", "शनिवार"],
];

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Resolves "today", "kal", "parso", "Monday", "22 Oct", "22/10", "2026-10-22"
 * to a clinic "YYYY-MM-DD". Returns null when it cannot.
 * "kal" means tomorrow here: callers booking appointments never mean yesterday.
 */
export function resolveDate(input, today = clinicDate()) {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;

  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;

  if (/\b(today|aaj|abhi)\b|आज/.test(s)) return today;
  if (/day after|parso|parson|परसों/.test(s)) return addDays(today, 2);
  if (/\b(tomorrow|tmrw|kal|kel)\b|कल/.test(s)) return addDays(today, 1);

  // Weekday names: the next occurrence, today included only if it is today.
  for (let day = 0; day < 7; day++) {
    if (WEEKDAYS[day].some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(s))) {
      const delta = (day - weekdayOf(today) + 7) % 7;
      const next = /\bnext\b|agle|अगले/.test(s) && delta === 0 ? 7 : delta;
      return addDays(today, next);
    }
  }

  // "22 oct", "oct 22", "22 october 2026"
  const [ty, tm] = today.split("-").map(Number);
  const dm = /(\d{1,2})(?:st|nd|rd|th)?\s*([a-z]{3,})|([a-z]{3,})\s*(\d{1,2})/.exec(s);
  if (dm) {
    const day = Number(dm[1] ?? dm[4]);
    const monthIdx = MONTH_KEYS.indexOf((dm[2] ?? dm[3]).slice(0, 3));
    if (monthIdx >= 0 && day >= 1 && day <= 31) {
      const yearMatch = /\b(20\d{2})\b/.exec(s);
      let year = yearMatch ? Number(yearMatch[1]) : ty;
      if (!yearMatch && monthIdx + 1 < tm) year += 1;
      return `${year}-${pad(monthIdx + 1)}-${pad(day)}`;
    }
  }

  // "22/10", "22-10-2026" (Indian order: day first)
  const dmy = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(s);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = dmy[3] ? Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : ty;
    if (!dmy[3] && month < tm) year += 1;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`;
  }

  return null;
}

/**
 * Resolves "10:30", "10.30 am", "5 pm", "17:00", "shaam 5 baje", "saade 10"
 * to "HH:mm". Bare hours 1 to 7 are read as afternoon/evening, because clinics
 * do not open at 3 AM. Returns null when it cannot.
 */
export function resolveTime(input) {
  let s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/बजे|baje/g, " ").replace(/\s+/g, " ");

  let extra = 0;
  if (/saade|sadhe|साढ़े/.test(s)) extra = 30;
  else if (/sawa|सवा/.test(s)) extra = 15;
  const paune = /paune|पौने/.test(s);

  const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  let min = m[2] ? Number(m[2]) : extra;
  if (paune) {
    h -= 1;
    min = 45;
  }
  const mer = m[3]?.replace(/\./g, "");
  const evening = /evening|shaam|\bsham\b|raat|शाम|रात|dopahar|afternoon|दोपहर|night/.test(s);
  const morning = /morning|subah|सुबह/.test(s);

  if (mer === "pm" || (evening && !morning)) {
    if (h < 12) h += 12;
  } else if (mer === "am" || morning) {
    if (h === 12) h = 0;
  } else if (h >= 1 && h <= 7) {
    h += 12;
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}
