import { format, isSameDay, isTomorrow, subDays } from "date-fns";

/** "Today" / "Yesterday" / "Tomorrow" / "12 Oct" - short day label. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return "Today";
  if (isSameDay(d, subDays(now, 1))) return "Yesterday";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "d MMM");
}

/** "4:30 PM" */
export function timeLabel(iso: string): string {
  return format(new Date(iso), "h:mm a");
}

/** "Wed, 15 Oct · 4:30 PM" */
export function fullDateTime(iso: string): string {
  return format(new Date(iso), "EEE, d MMM · h:mm a");
}

/** "15 Oct" */
export function shortDate(iso: string): string {
  return format(new Date(iso), "d MMM");
}
