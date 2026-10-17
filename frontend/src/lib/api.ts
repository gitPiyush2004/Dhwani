import type {
  AgentMetrics,
  AgentTestRun,
  Appointment,
  AppointmentFilters,
  Call,
  CallFilters,
  Campaign,
  Clinic,
  DailyCallsPoint,
  DashboardStats,
  Doctor,
  KnowledgeItem,
  LiveCall,
  NewAppointmentInput,
  OnboardingStep,
  OutcomeSlice,
  SavedView,
  Usage,
} from "@/types";
import { USE_LIVE_API } from "./config";
import { http, qs } from "./http";
import * as mock from "./api.mock";

// ===========================================================================
//  THE API CONTRACT
// ---------------------------------------------------------------------------
//  This is the only file in the app that touches data. Every function is async
//  and returns a typed promise. Each one names the REST endpoint the backend
//  must implement.
//
//  Two modes:
//    * VITE_API_BASE_URL unset  -> returns mock data (src/lib/api.mock.ts)
//    * VITE_API_BASE_URL set    -> calls the real backend over HTTP
//
//  The full request/response shapes, error codes, the Google Sheets column
//  mapping and the Bolna tool definitions are in docs/API-CONTRACT.md.
//  The voice agent's side is in docs/VOICE-AGENT.md.
// ===========================================================================

/* -------------------------------------------------------------------------
 * Live operations
 * ---------------------------------------------------------------------- */

/** GET /api/live-calls -> LiveCall[] */
export async function getLiveCalls(): Promise<LiveCall[]> {
  if (USE_LIVE_API) return http<LiveCall[]>("/api/live-calls");
  return mock.getLiveCalls();
}

/** POST /api/live-calls/:id/takeover -> { ok: true } */
export async function takeoverCall(id: string): Promise<{ ok: true }> {
  if (USE_LIVE_API) return http<{ ok: true }>(`/api/live-calls/${id}/takeover`, { method: "POST" });
  return mock.takeoverCall(id);
}

/* -------------------------------------------------------------------------
 * Dashboard aggregates
 * ---------------------------------------------------------------------- */

/** GET /api/dashboard/stats -> DashboardStats */
export async function getDashboardStats(): Promise<DashboardStats> {
  if (USE_LIVE_API) return http<DashboardStats>("/api/dashboard/stats");
  return mock.getDashboardStats();
}

/** GET /api/dashboard/calls-per-day?days=7 -> DailyCallsPoint[] */
export async function getCallsPerDay(days = 7): Promise<DailyCallsPoint[]> {
  if (USE_LIVE_API) return http<DailyCallsPoint[]>(`/api/dashboard/calls-per-day${qs({ days })}`);
  return mock.getCallsPerDay();
}

/** GET /api/dashboard/call-outcomes -> OutcomeSlice[] */
export async function getCallOutcomes(): Promise<OutcomeSlice[]> {
  if (USE_LIVE_API) return http<OutcomeSlice[]>("/api/dashboard/call-outcomes");
  return mock.getCallOutcomes();
}

/* -------------------------------------------------------------------------
 * Calls
 * ---------------------------------------------------------------------- */

/**
 * GET /api/calls?search=&outcome=&language=&from=&to=&needsReview=
 * -> Call[] (newest first)
 */
export async function getCalls(filters: CallFilters = {}): Promise<Call[]> {
  if (USE_LIVE_API) return http<Call[]>(`/api/calls${qs(filters)}`);
  return mock.getCalls(filters);
}

/** GET /api/calls/:id -> Call */
export async function getCall(id: string): Promise<Call> {
  if (USE_LIVE_API) return http<Call>(`/api/calls/${id}`);
  return mock.getCall(id);
}

/** PATCH /api/calls/:id  body { needsFollowUp: false } -> Call */
export async function markCallFollowedUp(id: string): Promise<Call> {
  if (USE_LIVE_API)
    return http<Call>(`/api/calls/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ needsFollowUp: false }),
    });
  return mock.markCallFollowedUp(id);
}

/** PATCH /api/calls/:id  body { resolved: true } -> Call */
export async function markCallResolved(id: string): Promise<Call> {
  if (USE_LIVE_API)
    return http<Call>(`/api/calls/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ resolved: true }),
    });
  return mock.markCallResolved(id);
}

/** GET /api/saved-views -> SavedView[] */
export async function getSavedViews(): Promise<SavedView[]> {
  if (USE_LIVE_API) return http<SavedView[]>("/api/saved-views");
  return mock.getSavedViews();
}

/* -------------------------------------------------------------------------
 * Appointments
 * ---------------------------------------------------------------------- */

/** GET /api/appointments?from=&to=&status= -> Appointment[] (soonest first) */
export async function getAppointments(
  filters: AppointmentFilters = {}
): Promise<Appointment[]> {
  if (USE_LIVE_API) return http<Appointment[]>(`/api/appointments${qs(filters)}`);
  return mock.getAppointments(filters);
}

/** GET /api/appointments/:id -> Appointment */
export async function getAppointment(id: string): Promise<Appointment> {
  if (USE_LIVE_API) return http<Appointment>(`/api/appointments/${id}`);
  return mock.getAppointment(id);
}

/**
 * Point check used by the booking and reschedule pickers.
 * GET /api/slots?doctorId=&startsAt=ISO -> { available: boolean }
 * The voice agent instead asks for a whole day:
 * GET /api/slots?doctorId=&date=YYYY-MM-DD -> { slots: string[] }
 */
export async function isSlotAvailable(
  doctorId: string,
  startsAt: string,
  ignoreId?: string
): Promise<boolean> {
  if (USE_LIVE_API) {
    const res = await http<{ available: boolean }>(
      `/api/slots${qs({ doctorId, startsAt, ignoreId })}`
    );
    return res.available;
  }
  return mock.isSlotAvailable(doctorId, startsAt, ignoreId);
}

/** POST /api/appointments -> Appointment (409 if the slot is taken) */
export async function createAppointment(input: NewAppointmentInput): Promise<Appointment> {
  if (USE_LIVE_API)
    return http<Appointment>("/api/appointments", {
      method: "POST",
      body: JSON.stringify(input),
    });
  return mock.createAppointment(input);
}

/** PATCH /api/appointments/:id -> Appointment */
export async function updateAppointment(
  id: string,
  patch: Partial<Appointment>
): Promise<Appointment> {
  if (USE_LIVE_API)
    return http<Appointment>(`/api/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  return mock.updateAppointment(id, patch);
}

/** PATCH /api/appointments/:id  body { startsAt, status: "rescheduled" } -> Appointment */
export async function rescheduleAppointment(id: string, startsAt: string): Promise<Appointment> {
  if (USE_LIVE_API)
    return http<Appointment>(`/api/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ startsAt, status: "rescheduled" }),
    });
  return mock.rescheduleAppointment(id, startsAt);
}

/** PATCH /api/appointments/:id  body { status: "cancelled" } -> Appointment */
export async function cancelAppointment(id: string): Promise<Appointment> {
  if (USE_LIVE_API)
    return http<Appointment>(`/api/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });
  return mock.cancelAppointment(id);
}

/** PATCH /api/appointments/:id  body { status: "completed" } -> Appointment */
export async function completeAppointment(id: string): Promise<Appointment> {
  if (USE_LIVE_API)
    return http<Appointment>(`/api/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
  return mock.completeAppointment(id);
}

/* -------------------------------------------------------------------------
 * Agent quality
 * ---------------------------------------------------------------------- */

/** GET /api/agent/metrics -> AgentMetrics */
export async function getAgentMetrics(): Promise<AgentMetrics> {
  if (USE_LIVE_API) return http<AgentMetrics>("/api/agent/metrics");
  return mock.getAgentMetrics();
}

/** POST /api/agent/test  body { utterance } -> AgentTestRun */
export async function runAgentTest(utterance: string): Promise<AgentTestRun> {
  if (USE_LIVE_API)
    return http<AgentTestRun>("/api/agent/test", {
      method: "POST",
      body: JSON.stringify({ utterance }),
    });
  return mock.runAgentTest(utterance);
}

/* -------------------------------------------------------------------------
 * Knowledge base
 * ---------------------------------------------------------------------- */

/** GET /api/knowledge -> KnowledgeItem[] */
export async function getKnowledge(): Promise<KnowledgeItem[]> {
  if (USE_LIVE_API) return http<KnowledgeItem[]>("/api/knowledge");
  return mock.getKnowledge();
}

/** POST /api/knowledge -> KnowledgeItem */
export async function createKnowledge(
  input: Omit<KnowledgeItem, "id" | "updatedAt">
): Promise<KnowledgeItem> {
  if (USE_LIVE_API)
    return http<KnowledgeItem>("/api/knowledge", {
      method: "POST",
      body: JSON.stringify(input),
    });
  return mock.createKnowledge(input);
}

/** PATCH /api/knowledge/:id -> KnowledgeItem */
export async function updateKnowledge(
  id: string,
  patch: Partial<KnowledgeItem>
): Promise<KnowledgeItem> {
  if (USE_LIVE_API)
    return http<KnowledgeItem>(`/api/knowledge/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  return mock.updateKnowledge(id, patch);
}

/** DELETE /api/knowledge/:id -> 204 */
export async function deleteKnowledge(id: string): Promise<void> {
  if (USE_LIVE_API) return http<void>(`/api/knowledge/${id}`, { method: "DELETE" });
  return mock.deleteKnowledge(id);
}

/* -------------------------------------------------------------------------
 * Outbound campaigns
 * ---------------------------------------------------------------------- */

/** GET /api/campaigns -> Campaign[] */
export async function getCampaigns(): Promise<Campaign[]> {
  if (USE_LIVE_API) return http<Campaign[]>("/api/campaigns");
  return mock.getCampaigns();
}

/** PATCH /api/campaigns/:id  body { status } -> Campaign */
export async function setCampaignStatus(
  id: string,
  status: Campaign["status"]
): Promise<Campaign> {
  if (USE_LIVE_API)
    return http<Campaign>(`/api/campaigns/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  return mock.setCampaignStatus(id, status);
}

/** POST /api/campaigns -> Campaign */
export async function createCampaign(input: Omit<Campaign, "id">): Promise<Campaign> {
  if (USE_LIVE_API)
    return http<Campaign>("/api/campaigns", { method: "POST", body: JSON.stringify(input) });
  return mock.createCampaign(input);
}

/* -------------------------------------------------------------------------
 * Clinic, doctors, usage, onboarding
 * ---------------------------------------------------------------------- */

/** GET /api/clinic -> Clinic */
export async function getClinic(): Promise<Clinic> {
  if (USE_LIVE_API) return http<Clinic>("/api/clinic");
  return mock.getClinic();
}

/** PUT /api/clinic -> Clinic */
export async function updateClinic(patch: Partial<Clinic>): Promise<Clinic> {
  if (USE_LIVE_API)
    return http<Clinic>("/api/clinic", { method: "PUT", body: JSON.stringify(patch) });
  return mock.updateClinic(patch);
}

/** GET /api/doctors -> Doctor[] */
export async function getDoctors(): Promise<Doctor[]> {
  if (USE_LIVE_API) return http<Doctor[]>("/api/doctors");
  return mock.getDoctors();
}

/** POST /api/doctors -> Doctor */
export async function createDoctor(input: Omit<Doctor, "id">): Promise<Doctor> {
  if (USE_LIVE_API)
    return http<Doctor>("/api/doctors", { method: "POST", body: JSON.stringify(input) });
  return mock.createDoctor(input);
}

/** PATCH /api/doctors/:id -> Doctor */
export async function updateDoctor(id: string, patch: Partial<Doctor>): Promise<Doctor> {
  if (USE_LIVE_API)
    return http<Doctor>(`/api/doctors/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return mock.updateDoctor(id, patch);
}

/** DELETE /api/doctors/:id -> 204 */
export async function deleteDoctor(id: string): Promise<void> {
  if (USE_LIVE_API) return http<void>(`/api/doctors/${id}`, { method: "DELETE" });
  return mock.deleteDoctor(id);
}

/** GET /api/usage -> Usage */
export async function getUsage(): Promise<Usage> {
  if (USE_LIVE_API) return http<Usage>("/api/usage");
  return mock.getUsage();
}

/** GET /api/onboarding -> OnboardingStep[] */
export async function getOnboarding(): Promise<OnboardingStep[]> {
  if (USE_LIVE_API) return http<OnboardingStep[]>("/api/onboarding");
  return mock.getOnboarding();
}

/** PATCH /api/onboarding/:id  body { done } -> OnboardingStep */
export async function setOnboardingStep(id: string, done: boolean): Promise<OnboardingStep> {
  if (USE_LIVE_API)
    return http<OnboardingStep>(`/api/onboarding/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    });
  return mock.setOnboardingStep(id, done);
}

/* -------------------------------------------------------------------------
 * Agent chat simulator (frontend demo)
 * ---------------------------------------------------------------------- */

/** POST /api/agent/simulate  body { message, history } -> { reply } */
export async function getAgentReply(message: string): Promise<string> {
  if (USE_LIVE_API) {
    const res = await http<{ reply: string }>("/api/agent/simulate", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    return res.reply;
  }
  return mock.getAgentReply(message);
}

/* -------------------------------------------------------------------------
 * Not called by the dashboard, but part of the same contract:
 *
 *   POST /api/calls/webhook     Bolna posts the transcript + summary here after
 *                               every call. This is what fills the Calls table.
 *
 * It is implemented in server/index.mjs and specified in docs/API-CONTRACT.md.
 * ---------------------------------------------------------------------- */
