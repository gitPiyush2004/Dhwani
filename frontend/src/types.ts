// ---------------------------------------------------------------------------
// AawazDoc domain types.
// These mirror the shapes the real backend will return, so replacing the mock
// layer in src/lib/api.ts with real REST calls changes nothing in the UI.
// ---------------------------------------------------------------------------

export type Language = "Hindi" | "English" | "Hinglish";

export type CallOutcome =
  | "booked"
  | "faq"
  | "human"
  | "dropped"
  | "missed"
  | "rescheduled"
  | "cancelled";

export type Sentiment = "positive" | "neutral" | "negative";

export type Speaker = "ai" | "patient";

export interface TranscriptLine {
  speaker: Speaker;
  text: string;
  ts: string;
  /** seconds from the start of the call, used to sync the transcript to audio */
  startSec: number;
}

export interface ExtractedDetails {
  name?: string;
  reason?: string;
  slot?: string;
}

export interface Call {
  id: string;
  callerName: string;
  phone: string;
  startedAt: string;
  durationSec: number;
  language: Language;
  outcome: CallOutcome;
  sentiment: Sentiment;
  summary: string;
  transcript: TranscriptLine[];
  extracted: ExtractedDetails;
  needsFollowUp: boolean;
  recordingUrl: string;
  /** the caller's underlying reason for calling, normalised */
  intent: string;
  /** did the agent complete the task without a human? */
  resolved: boolean;
  /** the agent's own confidence in what it heard */
  confidence: number;
  tags: string[];
  /** what the agent actually did on the call */
  aiActions: string[];
}

export type AppointmentStatus =
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "completed";

export interface Appointment {
  id: string;
  patientName: string;
  phone: string;
  doctorId: string;
  startsAt: string;
  durationMin: number;
  reason: string;
  status: AppointmentStatus;
  bookedBy: "ai" | "staff";
  whatsappSent: boolean;
}

/** `day` follows Date.getDay(): 0 = Sunday. */
export interface AvailabilityBlock {
  day: number;
  start: string;
  end: string;
}

export interface Doctor {
  id: string;
  name: string;
  speciality: string;
  fee: number;
  slotDurationMin: number;
  availability: AvailabilityBlock[];
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  /** how many times callers asked this */
  hits: number;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  body: string;
  source: "faq" | "document" | "staff";
  updatedAt: string;
}

export interface AgentConfig {
  name: string;
  voice: string;
  speed: number;
  greeting: string;
  fallback: string;
  guardrails: string[];
  recordingConsent: boolean;
}

export interface Escalation {
  phone: string;
  triggers: string[];
}

export interface Clinic {
  name: string;
  address: string;
  phone: string;
  languages: Language[];
  greeting: string;
  faqs: FAQ[];
  escalation: Escalation;
  agent: AgentConfig;
}

// --- Live operations -------------------------------------------------------

export type LivePhase = "greeting" | "booking" | "question" | "handoff";

export interface LiveCall {
  id: string;
  callerName: string;
  phone: string;
  language: Language;
  intent: string;
  sentiment: Sentiment;
  startedAt: string;
  durationSec: number;
  phase: LivePhase;
  confidence: number;
  /** what the agent is saying right now */
  currentLine: string;
  waveform: number[];
}

// --- Agent quality ---------------------------------------------------------

export interface IntentStat {
  intent: string;
  total: number;
  resolved: number;
  accuracy: number;
}

export interface AgentMetrics {
  resolutionRate: number;
  containmentRate: number;
  avgHandleSec: number;
  humanHandoffs: number;
  needsReview: number;
  reviewQueue: string[];
  accuracyTrend: { label: string; value: number }[];
  intents: IntentStat[];
}

// --- Outbound --------------------------------------------------------------

export type CampaignType = "reminder" | "waitlist" | "recall" | "feedback";
export type CampaignStatus = "active" | "scheduled" | "paused" | "completed";

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  channel: "voice" | "whatsapp";
  audience: number;
  contacted: number;
  connected: number;
  converted: number;
  scheduledAt?: string;
  script: string;
}

// --- Billing ---------------------------------------------------------------

export interface Usage {
  plan: string;
  minutesUsed: number;
  minutesIncluded: number;
  ratePerMinute: number;
  renewsAt: string;
}

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  done: boolean;
  to?: string;
}

// --- Dashboard -------------------------------------------------------------

export interface DashboardStats {
  callsToday: number;
  appointmentsBooked: number;
  missedRecovered: number;
  avgDurationSec: number;
  revenueRecovered: number;
  bookedWhileClosed: number;
  trends: {
    callsToday: number;
    appointmentsBooked: number;
    missedRecovered: number;
    avgDurationSec: number;
    revenueRecovered: number;
  };
}

export interface DailyCallsPoint {
  date: string;
  label: string;
  answered: number;
  neededHuman: number;
}

export interface OutcomeSlice {
  key: CallOutcome;
  label: string;
  value: number;
}

// --- Filters and inputs ----------------------------------------------------

export interface CallFilters {
  search?: string;
  outcome?: CallOutcome | "all";
  language?: Language | "all";
  from?: string;
  to?: string;
  /** only calls the agent could not complete */
  needsReview?: boolean;
}

export interface SavedView {
  id: string;
  label: string;
  filters: CallFilters;
}

export interface AppointmentFilters {
  from?: string;
  to?: string;
  status?: AppointmentStatus | "all";
}

export interface NewAppointmentInput {
  patientName: string;
  phone: string;
  doctorId: string;
  startsAt: string;
  durationMin: number;
  reason: string;
  bookedBy: "ai" | "staff";
}

export interface AgentMessage {
  role: "ai" | "user";
  text: string;
}

export interface AgentTestRun {
  transcript: AgentMessage[];
  verdict: "pass" | "warn" | "fail";
  note: string;
}
