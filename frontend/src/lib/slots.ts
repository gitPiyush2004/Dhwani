import { set } from "date-fns";
import type { Appointment, Doctor } from "@/types";

/** minutes-from-midnight -> "10:30" */
export function formatSlot(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "10:30" -> "10:30 AM" */
export function slotLabel(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** All slots a doctor offers on the weekday of `date`. */
export function slotsFor(doctor: Doctor, date: Date): string[] {
  const day = date.getDay();
  const out: string[] = [];
  for (const block of doctor.availability.filter((b) => b.day === day)) {
    const [sh, sm] = block.start.split(":").map(Number);
    const [eh, em] = block.end.split(":").map(Number);
    const end = eh * 60 + em;
    let t = sh * 60 + sm;
    while (t + doctor.slotDurationMin <= end) {
      out.push(formatSlot(t));
      t += doctor.slotDurationMin;
    }
  }
  return out;
}

/** Combine a calendar date with a "HH:mm" slot into a Date. */
export function slotToDate(date: Date, slot: string): Date {
  const [h, m] = slot.split(":").map(Number);
  return set(date, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
}

/** True when the same doctor already has a live appointment at that instant. */
export function isSlotTaken(
  appointments: Appointment[],
  doctorId: string,
  startsAt: Date,
  ignoreId?: string
): boolean {
  return appointments.some(
    (a) =>
      a.id !== ignoreId &&
      a.doctorId === doctorId &&
      a.status !== "cancelled" &&
      new Date(a.startsAt).getTime() === startsAt.getTime()
  );
}

/** yyyy-MM-dd for <input type="date"> */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
