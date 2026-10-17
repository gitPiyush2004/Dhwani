import { addDays, format, isSameDay, startOfDay } from "date-fns";
import type {
  AgentMetrics,
  AgentTestRun,
  Appointment,
  AppointmentFilters,
  AppointmentStatus,
  Call,
  CallFilters,
  CallOutcome,
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
import {
  mockAgentMetrics,
  mockAppointments,
  mockCalls,
  mockCampaigns,
  mockClinic,
  mockDoctors,
  mockKnowledge,
  mockLiveCalls,
  mockOnboarding,
  mockSavedViews,
  mockUsage,
} from "./mockData";

// ===========================================================================
//  Mock implementation of the API contract.
// ---------------------------------------------------------------------------
//  This is the demo backend. It keeps an in-memory store so bookings, edits and
//  settings saves are visible while you click around.
//
//  Do NOT import this from components. Components import src/lib/api.ts, which
//  dispatches to here only when VITE_API_BASE_URL is unset. When the real
//  backend exists, this file becomes dead weight and can be deleted, along with
//  src/lib/mockData.ts.
// ===========================================================================

/** In-memory store so mutations are visible during the demo. */
const store = {
  calls: mockCalls.map((c) => ({ ...c })),
  appointments: mockAppointments.map((a) => ({ ...a })),
  clinic: structuredClone(mockClinic),
  doctors: mockDoctors.map((d) => ({ ...d })),
  knowledge: mockKnowledge.map((k) => ({ ...k })),
  campaigns: mockCampaigns.map((c) => ({ ...c })),
  onboarding: mockOnboarding.map((o) => ({ ...o })),
  live: mockLiveCalls.map((c) => ({ ...c })),
};

const delay = (ms = 110) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => structuredClone(v);

// ---------------------------------------------------------------------------
// Live operations
// ---------------------------------------------------------------------------

/** GET /api/live-calls */
export async function getLiveCalls(): Promise<LiveCall[]> {
  await delay(60);
  return clone(store.live);
}

/** POST /api/live-calls/:id/takeover */
export async function takeoverCall(id: string): Promise<{ ok: true }> {
  await delay(150);
  store.live = store.live.filter((c) => c.id !== id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** GET /api/dashboard/stats */
export async function getDashboardStats(): Promise<DashboardStats> {
  await delay();
  const today = new Date();
  const callsToday = store.calls.filter((c) => isSameDay(new Date(c.startedAt), today));
  const bookedToday = store.appointments.filter(
    (a) => isSameDay(new Date(a.startsAt), today) && a.status !== "cancelled"
  ).length;
  const recovered = store.calls.filter(
    (c) => c.outcome === "missed" || c.outcome === "dropped"
  ).length;
  const answered = store.calls.filter((c) => c.durationSec > 0);
  const avg = answered.reduce((s, c) => s + c.durationSec, 0) / Math.max(answered.length, 1);
  const booked = store.calls.filter((c) => c.outcome === "booked").length;

  return {
    callsToday: callsToday.length,
    appointmentsBooked: bookedToday,
    missedRecovered: recovered,
    avgDurationSec: Math.round(avg),
    revenueRecovered: booked * 560 + 18400,
    bookedWhileClosed: 9,
    trends: {
      callsToday: 12,
      appointmentsBooked: 8,
      missedRecovered: 25,
      avgDurationSec: -4,
      revenueRecovered: 17,
    },
  };
}

/** GET /api/dashboard/calls-per-day?days=7 */
export async function getCallsPerDay(): Promise<DailyCallsPoint[]> {
  await delay();
  const today = new Date();
  const points: DailyCallsPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const dayCalls = store.calls.filter((c) => isSameDay(new Date(c.startedAt), day));
    points.push({
      date: startOfDay(day).toISOString(),
      label: format(day, "EEE"),
      answered: dayCalls.filter((c) => c.durationSec > 0).length,
      neededHuman: dayCalls.filter((c) => c.outcome === "human").length,
    });
  }
  return points;
}

/** GET /api/dashboard/call-outcomes */
export async function getCallOutcomes(): Promise<OutcomeSlice[]> {
  await delay();
  const labels: Record<CallOutcome, string> = {
    booked: "Booked",
    faq: "FAQ answered",
    human: "Handed to human",
    dropped: "Dropped",
    missed: "Missed",
    rescheduled: "Rescheduled",
    cancelled: "Cancelled",
  };
  const counts = store.calls.reduce<Record<string, number>>((acc, c) => {
    acc[c.outcome] = (acc[c.outcome] ?? 0) + 1;
    return acc;
  }, {});
  return (Object.keys(counts) as CallOutcome[])
    .map((key) => ({ key, label: labels[key], value: counts[key] }))
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/** GET /api/calls?search=&outcome=&language=&from=&to=&needsReview= */
export async function getCalls(filters: CallFilters = {}): Promise<Call[]> {
  await delay();
  const { search = "", outcome = "all", language = "all", from, to, needsReview } = filters;
  const q = search.trim().toLowerCase();
  return clone(
    store.calls.filter((c) => {
      if (outcome !== "all" && c.outcome !== outcome) return false;
      if (language !== "all" && c.language !== language) return false;
      if (needsReview && c.resolved) return false;
      const t = new Date(c.startedAt).getTime();
      if (from && t < new Date(from).getTime()) return false;
      if (to && t > new Date(to).getTime()) return false;
      if (q) {
        const hay = `${c.callerName} ${c.phone} ${c.summary} ${c.intent} ${c.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
  );
}

/** GET /api/calls/:id */
export async function getCall(id: string): Promise<Call> {
  await delay(70);
  const call = store.calls.find((c) => c.id === id);
  if (!call) throw new Error(`Call ${id} not found`);
  return clone(call);
}

/** PATCH /api/calls/:id  { needsFollowUp: false } */
export async function markCallFollowedUp(id: string): Promise<Call> {
  await delay(90);
  const call = store.calls.find((c) => c.id === id);
  if (!call) throw new Error(`Call ${id} not found`);
  call.needsFollowUp = false;
  return clone(call);
}

/** PATCH /api/calls/:id  { resolved: true } */
export async function markCallResolved(id: string): Promise<Call> {
  await delay(90);
  const call = store.calls.find((c) => c.id === id);
  if (!call) throw new Error(`Call ${id} not found`);
  call.resolved = true;
  call.needsFollowUp = false;
  return clone(call);
}

/** GET /api/saved-views */
export async function getSavedViews(): Promise<SavedView[]> {
  await delay(50);
  return clone(mockSavedViews);
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

/** GET /api/appointments?from=&to=&status= */
export async function getAppointments(
  filters: AppointmentFilters = {}
): Promise<Appointment[]> {
  await delay();
  const { from, to, status = "all" } = filters;
  return clone(
    store.appointments
      .filter((a) => {
        if (status !== "all" && a.status !== status) return false;
        const t = new Date(a.startsAt).getTime();
        if (from && t < new Date(from).getTime()) return false;
        if (to && t > new Date(to).getTime()) return false;
        return true;
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  );
}

/** GET /api/appointments/:id */
export async function getAppointment(id: string): Promise<Appointment> {
  await delay(70);
  const apt = store.appointments.find((a) => a.id === id);
  if (!apt) throw new Error(`Appointment ${id} not found`);
  return clone(apt);
}

/** GET /api/appointments/availability?doctorId=&startsAt= */
export async function isSlotAvailable(
  doctorId: string,
  startsAt: string,
  ignoreId?: string
): Promise<boolean> {
  await delay(60);
  const t = new Date(startsAt).getTime();
  return !store.appointments.some(
    (a) =>
      a.id !== ignoreId &&
      a.doctorId === doctorId &&
      a.status !== "cancelled" &&
      new Date(a.startsAt).getTime() === t
  );
}

/** POST /api/appointments */
export async function createAppointment(input: NewAppointmentInput): Promise<Appointment> {
  await delay(130);
  const free = await isSlotAvailable(input.doctorId, input.startsAt);
  if (!free) throw new Error("That slot is already taken. Please pick another time.");
  const apt: Appointment = {
    id: `apt-${Math.random().toString(36).slice(2, 8)}`,
    ...input,
    status: "confirmed",
    whatsappSent: true,
  };
  store.appointments.push(apt);
  return clone(apt);
}

/** PATCH /api/appointments/:id */
export async function updateAppointment(
  id: string,
  patch: Partial<Appointment>
): Promise<Appointment> {
  await delay(90);
  const apt = store.appointments.find((a) => a.id === id);
  if (!apt) throw new Error(`Appointment ${id} not found`);
  Object.assign(apt, patch);
  return clone(apt);
}

/** PATCH /api/appointments/:id  { startsAt, status: "rescheduled" } */
export async function rescheduleAppointment(id: string, startsAt: string): Promise<Appointment> {
  await delay(110);
  const apt = store.appointments.find((a) => a.id === id);
  if (!apt) throw new Error(`Appointment ${id} not found`);
  const free = await isSlotAvailable(apt.doctorId, startsAt, id);
  if (!free) throw new Error("That slot is already taken. Please pick another time.");
  apt.startsAt = startsAt;
  apt.status = "rescheduled";
  apt.whatsappSent = true;
  return clone(apt);
}

/** PATCH /api/appointments/:id  { status: "cancelled" } */
export async function cancelAppointment(id: string): Promise<Appointment> {
  return setStatus(id, "cancelled");
}

/** PATCH /api/appointments/:id  { status: "completed" } */
export async function completeAppointment(id: string): Promise<Appointment> {
  return setStatus(id, "completed");
}

async function setStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
  await delay(90);
  const apt = store.appointments.find((a) => a.id === id);
  if (!apt) throw new Error(`Appointment ${id} not found`);
  apt.status = status;
  if (status === "cancelled") apt.whatsappSent = false;
  return clone(apt);
}

// ---------------------------------------------------------------------------
// Agent quality
// ---------------------------------------------------------------------------

/** GET /api/agent/metrics */
export async function getAgentMetrics(): Promise<AgentMetrics> {
  await delay();
  return clone(mockAgentMetrics);
}

/** POST /api/agent/test  { utterance } */
export async function runAgentTest(utterance: string): Promise<AgentTestRun> {
  await delay(420);
  const reply = await getAgentReply(utterance);
  const escalates = /connect|staff se|human/i.test(reply);
  return {
    transcript: [
      { role: "user", text: utterance },
      { role: "ai", text: reply },
    ],
    verdict: escalates ? "warn" : "pass",
    note: escalates
      ? "The agent escalated instead of answering. Add this to the knowledge base so it can handle it directly."
      : "Answered from the knowledge base with high confidence.",
  };
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

/** GET /api/knowledge */
export async function getKnowledge(): Promise<KnowledgeItem[]> {
  await delay();
  return clone(store.knowledge);
}

/** POST /api/knowledge */
export async function createKnowledge(
  input: Omit<KnowledgeItem, "id" | "updatedAt">
): Promise<KnowledgeItem> {
  await delay(120);
  const item: KnowledgeItem = {
    ...input,
    id: `kb-${Math.random().toString(36).slice(2, 7)}`,
    updatedAt: new Date().toISOString(),
  };
  store.knowledge.unshift(item);
  return clone(item);
}

/** PATCH /api/knowledge/:id */
export async function updateKnowledge(
  id: string,
  patch: Partial<KnowledgeItem>
): Promise<KnowledgeItem> {
  await delay(90);
  const item = store.knowledge.find((k) => k.id === id);
  if (!item) throw new Error(`Knowledge item ${id} not found`);
  Object.assign(item, patch, { updatedAt: new Date().toISOString() });
  return clone(item);
}

/** DELETE /api/knowledge/:id */
export async function deleteKnowledge(id: string): Promise<void> {
  await delay(90);
  store.knowledge = store.knowledge.filter((k) => k.id !== id);
}

// ---------------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------------

/** GET /api/campaigns */
export async function getCampaigns(): Promise<Campaign[]> {
  await delay();
  return clone(store.campaigns);
}

/** PATCH /api/campaigns/:id  { status } */
export async function setCampaignStatus(
  id: string,
  status: Campaign["status"]
): Promise<Campaign> {
  await delay(120);
  const c = store.campaigns.find((x) => x.id === id);
  if (!c) throw new Error(`Campaign ${id} not found`);
  c.status = status;
  return clone(c);
}

/** POST /api/campaigns */
export async function createCampaign(input: Omit<Campaign, "id">): Promise<Campaign> {
  await delay(160);
  const c: Campaign = { ...input, id: `camp-${Math.random().toString(36).slice(2, 7)}` };
  store.campaigns.unshift(c);
  return clone(c);
}

// ---------------------------------------------------------------------------
// Clinic, doctors, usage, onboarding
// ---------------------------------------------------------------------------

/** GET /api/clinic */
export async function getClinic(): Promise<Clinic> {
  await delay();
  return clone(store.clinic);
}

/** PUT /api/clinic */
export async function updateClinic(patch: Partial<Clinic>): Promise<Clinic> {
  await delay(130);
  store.clinic = { ...store.clinic, ...patch };
  return clone(store.clinic);
}

/** GET /api/doctors */
export async function getDoctors(): Promise<Doctor[]> {
  await delay();
  return clone(store.doctors);
}

/** POST /api/doctors */
export async function createDoctor(input: Omit<Doctor, "id">): Promise<Doctor> {
  await delay(110);
  const doctor: Doctor = { ...input, id: `doc-${Math.random().toString(36).slice(2, 7)}` };
  store.doctors.push(doctor);
  return clone(doctor);
}

/** PATCH /api/doctors/:id */
export async function updateDoctor(id: string, patch: Partial<Doctor>): Promise<Doctor> {
  await delay(90);
  const doctor = store.doctors.find((d) => d.id === id);
  if (!doctor) throw new Error(`Doctor ${id} not found`);
  Object.assign(doctor, patch);
  return clone(doctor);
}

/** DELETE /api/doctors/:id */
export async function deleteDoctor(id: string): Promise<void> {
  await delay(90);
  store.doctors = store.doctors.filter((d) => d.id !== id);
}

/** GET /api/usage */
export async function getUsage(): Promise<Usage> {
  await delay(60);
  return clone(mockUsage);
}

/** GET /api/onboarding */
export async function getOnboarding(): Promise<OnboardingStep[]> {
  await delay(50);
  return clone(store.onboarding);
}

/** PATCH /api/onboarding/:id  { done } */
export async function setOnboardingStep(id: string, done: boolean): Promise<OnboardingStep> {
  await delay(80);
  const step = store.onboarding.find((s) => s.id === id);
  if (!step) throw new Error(`Step ${id} not found`);
  step.done = done;
  return clone(step);
}

// ---------------------------------------------------------------------------
// "Try the agent" chat simulator
// ---------------------------------------------------------------------------

/** POST /api/agent/simulate  { message, history } */
export async function getAgentReply(message: string): Promise<string> {
  await delay(380);
  const m = message.toLowerCase();

  if (/(book|appoint|dikhana|slot|milna|checkup|check-up)/.test(m))
    return "Bilkul! Main aapke liye appointment book kar sakti hoon. Aap kis doctor se milna chahenge? Dr. Sharma (General Physician), Dr. Verma (Gynaecologist) ya Dr. Khan (Paediatrician)?";
  if (/(sharma|general|physician)/.test(m))
    return "Dr. Sharma ke paas kal 10:30 AM, 12:00 PM aur 5:30 PM available hain. Kaunsa time theek rahega?";
  if (/(verma|gynae|gyn)/.test(m))
    return "Dr. Verma Monday, Wednesday aur Friday ko 10:00 AM se 2:00 PM tak available hain. Aapko kaunsa din suit karega?";
  if (/(khan|child|bachcha|baby|paed|ped)/.test(m))
    return "Dr. Khan Tuesday, Thursday aur Saturday ko 4:00 PM se 8:00 PM tak available hain. Bachche ki age kya hai?";
  if (/(10:30|12|5:30|morning|evening|subah|shaam|kal|tomorrow)/.test(m))
    return "Perfect, woh slot note kar liya. Aapka poora naam aur mobile number bata dijiye, main appointment confirm kar deti hoon aur WhatsApp par confirmation bhej doongi.";
  if (/(fee|fees|charge|kitna|kitni|price|cost)/.test(m))
    return "Dr. Sharma ₹500, Dr. Verma ₹700 aur Dr. Khan ₹600 charge karte hain. 7 din ke andar follow-up par 50% discount milta hai.";
  if (/(timing|time|khulti|open|close|band|hours|baje)/.test(m))
    return "Clinic Monday se Saturday, subah 9 se raat 8 baje tak khuli rehti hai. Sunday closed hai.";
  if (/(where|address|location|kahan|pata|near)/.test(m))
    return "Hum C-14, Green Park Extension, New Delhi 110016 par hain, Green Park metro station gate 2 ke paas.";
  if (/(insurance|tpa|claim|star health|cashless)/.test(m))
    return "Hum Star Health, HDFC Ergo aur Care Health accept karte hain. TPA claim ke liye pre-authorisation form chahiye hota hai.";
  if (/(reschedule|change|badal|shift)/.test(m))
    return "Zaroor, reschedule kar deti hoon. Aapka current appointment kis din ka hai, aur naya time kab chahiye?";
  if (/(cancel|nahi aana|nahi aa)/.test(m))
    return "Theek hai, cancel kar deti hoon. Confirm karne ke liye aapka naam bata dijiye.";
  if (/(emergency|urgent|chest pain|saans|breath|blood|accident|108)/.test(m))
    return "Main samajh rahi hoon, yeh urgent lagta hai. Agar emergency hai toh kripya turant 108 par call karein. Main aapko abhi clinic staff se connect kar rahi hoon.";
  if (/(human|staff|doctor se baat|insaan|person)/.test(m))
    return "Bilkul, main aapko clinic staff se connect kar rahi hoon. Please line par bane rahein.";
  if (/(thank|thanks|dhanyavad|shukriya|bye)/.test(m))
    return "Aapka din shubh rahe! Sharma Family Clinic se sampark karne ke liye dhanyavaad. Take care!";
  if (/(hi|hello|namaste|hey)/.test(m))
    return "Namaste! Sharma Family Clinic mein aapka swagat hai. Main AawazDoc hoon. Appointment book karna hai, ya koi sawaal hai?";
  return "Samajh gayi. Main note kar rahi hoon. Appointment book karna hai, fees jaanni hai, ya clinic ke timings? Aap Hindi, English ya Hinglish mein bata sakte hain.";
}
