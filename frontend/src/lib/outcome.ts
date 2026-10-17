import type { AppointmentStatus, CallOutcome, Language, Sentiment } from "@/types";

export type BadgeVariant =
  | "default"
  | "outline"
  | "lime"
  | "ink"
  | "signal"
  | "violet"
  | "teal"
  | "amber";

export const OUTCOME_META: Record<CallOutcome, { label: string; variant: BadgeVariant }> = {
  booked: { label: "Booked", variant: "lime" },
  faq: { label: "FAQ answered", variant: "teal" },
  human: { label: "Handed to human", variant: "amber" },
  dropped: { label: "Dropped", variant: "signal" },
  missed: { label: "Missed", variant: "signal" },
  rescheduled: { label: "Rescheduled", variant: "violet" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export const LANGUAGE_META: Record<Language, { label: string; variant: BadgeVariant }> = {
  Hindi: { label: "Hindi", variant: "default" },
  English: { label: "English", variant: "default" },
  Hinglish: { label: "Hinglish", variant: "default" },
};

export const SENTIMENT_META: Record<Sentiment, { label: string; dot: string; text: string }> = {
  positive: { label: "Positive", dot: "bg-teal", text: "text-teal" },
  neutral: { label: "Neutral", dot: "bg-ink3", text: "text-ink3" },
  negative: { label: "Negative", dot: "bg-signal", text: "text-signal" },
};

export const STATUS_META: Record<AppointmentStatus, { label: string; variant: BadgeVariant }> = {
  confirmed: { label: "Confirmed", variant: "lime" },
  rescheduled: { label: "Rescheduled", variant: "violet" },
  cancelled: { label: "Cancelled", variant: "signal" },
  completed: { label: "Completed", variant: "default" },
};

/** Chart colours, chosen to hold up on both the bone and the ink background. */
export const CHART_COLORS: Record<string, string> = {
  booked: "#8FD117",
  faq: "#0D9E86",
  human: "#DB940C",
  dropped: "#FF6A3D",
  missed: "#D64520",
  rescheduled: "#7656FF",
  cancelled: "#9AA0A8",
  accent: "#8FD117",
  signal: "#FF6A3D",
};

export const CAMPAIGN_META: Record<
  string,
  { label: string; variant: BadgeVariant; blurb: string }
> = {
  reminder: {
    label: "Reminders",
    variant: "lime",
    blurb: "Cut no-shows by confirming tomorrow's appointments.",
  },
  waitlist: {
    label: "Waitlist",
    variant: "violet",
    blurb: "Fill a cancelled slot by calling the waitlist.",
  },
  recall: {
    label: "Recall",
    variant: "teal",
    blurb: "Bring patients back when they are due.",
  },
  feedback: {
    label: "Feedback",
    variant: "amber",
    blurb: "Ask how the visit went and catch problems early.",
  },
};

export const CAMPAIGN_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: "Running", variant: "lime" },
  scheduled: { label: "Scheduled", variant: "violet" },
  paused: { label: "Paused", variant: "outline" },
  completed: { label: "Completed", variant: "default" },
};
