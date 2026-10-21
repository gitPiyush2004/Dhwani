import type {
  AgentChatReply,
  AgentMessage,
  AgentMetrics,
  AgentTestRun,
  AuthStatus,
  Appointment,
  AppointmentFilters,
  Call,
  CallFilters,
  Campaign,
  Clinic,
  DailyCallsPoint,
  DashboardStats,
  Doctor,
  Integrations,
  KnowledgeItem,
  LiveCall,
  NewAppointmentInput,
  OnboardingStep,
  OutcomeSlice,
  PublicConfig,
  SavedView,
  Usage,
} from "@/types";
import { USE_LIVE_API } from "./config";
import { http, httpBlob, qs, setToken } from "./http";
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
 * The agent: chat (same brain and tools as the phone line) and "Call me"
 * ---------------------------------------------------------------------- */

/**
 * POST /api/agent/simulate  body { message, sessionId, history } -> AgentChatReply
 * Bookings made from the chat are dry runs on the server.
 */
export async function chatWithAgent(
  message: string,
  sessionId: string,
  history: AgentMessage[] = []
): Promise<AgentChatReply> {
  if (USE_LIVE_API)
    return http<AgentChatReply>("/api/agent/simulate", {
      method: "POST",
      body: JSON.stringify({ message, sessionId, history }),
    });
  const reply = await mock.getAgentReply(message);
  return { reply, actions: [], escalated: false, engine: "rules" };
}

/** Kept for older callers. */
export async function getAgentReply(message: string): Promise<string> {
  return (await chatWithAgent(message, "default")).reply;
}

/** POST /api/agent/call  body { phone } -> the phone agent rings this number */
export async function callMeWithAgent(phone: string): Promise<{ ok: true; executionId: string | null }> {
  if (USE_LIVE_API)
    return http<{ ok: true; executionId: string | null }>("/api/agent/call", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  await new Promise((r) => setTimeout(r, 600));
  throw new Error("Connect the backend to place real calls.");
}

/* -------------------------------------------------------------------------
 * Recordings, auth, public config, integrations
 * ---------------------------------------------------------------------- */

/** GET /api/calls/:id/recording -> the audio file (fetched with the login token) */
export async function getRecording(recordingUrl: string): Promise<Blob | null> {
  if (!USE_LIVE_API || !recordingUrl.startsWith("/api/")) return null;
  return httpBlob(recordingUrl);
}

/** GET /api/auth/status -> AuthStatus */
export async function getAuthStatus(): Promise<AuthStatus> {
  if (USE_LIVE_API) return http<AuthStatus>("/api/auth/status");
  return { required: false, authenticated: true };
}

/** POST /api/auth/login  body { password } -> stores the session token */
export async function signIn(password: string): Promise<void> {
  const res = await http<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  setToken(res.token);
}

export function signOut() {
  setToken("");
}

/** GET /api/public/config -> PublicConfig (no login needed: the landing page uses it) */
export async function getPublicConfig(): Promise<PublicConfig> {
  if (USE_LIVE_API) return http<PublicConfig>("/api/public/config");
  return { clinicName: "", agentName: "", demoPhone: null, voiceEnabled: false };
}

/** GET /api/integrations -> what is connected, for Settings > Integrations */
export async function getIntegrations(): Promise<Integrations | null> {
  if (USE_LIVE_API) return http<Integrations>("/api/integrations");
  return null;
}

/** POST /api/integrations/bolna/sync -> creates or updates the phone agent */
export async function syncPhoneAgent(): Promise<{ agentId: string; created: boolean }> {
  return http<{ agentId: string; created: boolean }>("/api/integrations/bolna/sync", { method: "POST" });
}

/** POST /api/integrations/bolna/link-number -> inbound calls to the number reach the agent */
export async function linkPhoneNumber(phone?: string): Promise<unknown> {
  return http<unknown>("/api/integrations/bolna/link-number", {
    method: "POST",
    body: JSON.stringify(phone ? { phone } : {}),
  });
}

/** POST /api/reminders/run -> sends tomorrow's reminders now */
export async function runRemindersNow(): Promise<{ due?: number; delivered?: number; skipped?: string }> {
  return http("/api/reminders/run", { method: "POST" });
}

/* -------------------------------------------------------------------------
 * Not called by the dashboard, but part of the same contract:
 *
 *   POST /api/bolna/webhook      Bolna posts every call's status here; the
 *                                finished call becomes a row in the Calls tab.
 *   GET|POST /api/bolna/tools/*  The agent's booking tools, called mid-call.
 *   POST /api/calls/webhook      The generic post-call webhook.
 *
 * All implemented in server/ and specified in docs/API-CONTRACT.md.
 * ---------------------------------------------------------------------- */
