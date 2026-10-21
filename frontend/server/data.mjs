// ---------------------------------------------------------------------------
// Seed data for the reference backend.
//
// This mirrors the shape of the Google Sheet tabs described in
// docs/ARCHITECTURE.md, but as plain JS objects, so the frontend and the voice
// agent have something real to talk to before Sheets is wired up.
//
//   Sheet tab -> array here
//   Appointments -> db.appointments
//   Calls        -> db.calls
//   Doctors      -> db.doctors
//   FAQs         -> db.clinic.faqs
//   Clinic       -> db.clinic
// ---------------------------------------------------------------------------

export const makeId = (prefix) =>
  `${prefix}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;

/* Deterministic RNG so the demo looks the same on every restart. */
function makeRng(seedValue) {
  let s = seedValue >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NAMES = [
  "Rahul Mehta", "Ananya Gupta", "Suresh Kumar", "Priya Nair", "Mohammed Faiz",
  "Kavita Joshi", "Arjun Singh", "Neha Sharma", "Rohit Bansal", "Sunita Devi",
  "Vikram Rao", "Aisha Siddiqui", "Manish Agarwal", "Deepa Iyer", "Harpreet Kaur",
  "Sanjay Verma", "Pooja Reddy", "Tarun Malhotra", "Meera Pillai", "Gaurav Chauhan",
];

const OUTCOMES = [
  "booked", "faq", "booked", "human", "booked", "faq", "dropped", "booked", "faq",
  "missed", "booked", "human", "faq", "booked", "rescheduled", "faq", "booked",
  "human", "faq", "cancelled",
];

const LANGUAGES = ["Hinglish", "Hindi", "English"];

const REASONS = [
  "Fever and cold", "Routine check-up", "Follow-up visit", "Skin rash",
  "Stomach pain", "Vaccination", "Blood pressure review", "Joint pain",
];

const INTENT = {
  booked: "New appointment",
  faq: "Clinic question",
  human: "Urgent case",
  dropped: "Incomplete call",
  missed: "Missed call",
  rescheduled: "Reschedule",
  cancelled: "Cancellation",
};

const RESOLVED = new Set(["booked", "faq", "rescheduled", "cancelled"]);

const ACTIONS = {
  booked: ["Checked the doctor's calendar", "Held the slot", "Sent the WhatsApp confirmation"],
  faq: ["Answered from the clinic FAQs"],
  human: ["Detected an urgent phrase", "Read out the 108 guidance", "Transferred to the staff line"],
  dropped: ["Attempted to re-establish audio", "Queued a recovery SMS"],
  missed: ["Rang out with no answer", "Queued a recovery SMS"],
  rescheduled: ["Found the appointment", "Moved it to the new slot"],
  cancelled: ["Confirmed the cancellation", "Released the slot"],
};

const SUMMARY = {
  booked: (n) => `Booked an appointment for ${n}; WhatsApp confirmation sent.`,
  faq: () => "Caller asked about timings and fees; answered, no booking needed.",
  human: (n) => `${n}'s call was flagged as urgent and handed to clinic staff.`,
  dropped: () => "Call dropped mid-conversation before the need was captured.",
  missed: () => "Missed call. Rang out with no answer. Recovery SMS sent.",
  rescheduled: (n) => `Rescheduled ${n}'s appointment to a later slot.`,
  cancelled: (n) => `${n} cancelled an appointment; the slot was released.`,
};

const TRANSCRIPTS = {
  booked: (name) => [
    { speaker: "ai", text: "Namaste! Sharma Family Clinic mein aapka swagat hai. Main Dhwani hoon." },
    { speaker: "patient", text: "Mujhe kal doctor ko dikhana hai." },
    { speaker: "ai", text: "Bilkul. Kal ke liye 10:30 AM, 12:00 PM aur 5:30 PM available hain." },
    { speaker: "patient", text: "12 baje ho jaye toh badhiya." },
    { speaker: "ai", text: `${name} ji, appointment kal 12:00 PM par book kar diya. WhatsApp confirmation bhej rahi hoon.` },
  ],
  faq: () => [
    { speaker: "ai", text: "Namaste! Sharma Family Clinic mein aapka swagat hai." },
    { speaker: "patient", text: "Clinic kitne baje khulti hai?" },
    { speaker: "ai", text: "Clinic Monday se Saturday, subah 9 se raat 8 baje tak khuli rehti hai." },
    { speaker: "patient", text: "Consultation fee kitni hai?" },
    { speaker: "ai", text: "Dr. Sharma ki fee ₹500 hai. Appointment book kar doon?" },
    { speaker: "patient", text: "Nahi, thank you." },
  ],
  human: () => [
    { speaker: "patient", text: "Mere papa ko bahut chest pain ho raha hai!" },
    { speaker: "ai", text: "Yeh urgent lagta hai. Agar emergency hai toh kripya turant 108 par call karein." },
    { speaker: "ai", text: "Main aapko abhi clinic staff se connect kar rahi hoon." },
  ],
  dropped: () => [
    { speaker: "ai", text: "Namaste! Sharma Family Clinic mein aapka swagat hai." },
    { speaker: "patient", text: "Haan, ek second..." },
  ],
};

function buildCalls() {
  const rng = makeRng(0x4aa7d0c);
  const today = new Date();
  const calls = [];

  NAMES.forEach((name, i) => {
    const outcome = OUTCOMES[i % OUTCOMES.length];
    const dayOffset = i % 7;
    const started = new Date(today);
    started.setDate(started.getDate() - dayOffset);
    started.setHours(9 + ((i * 3) % 10), (i * 7) % 60, Math.floor(rng() * 60), 0);
    // Never in the future, whatever time zone the server runs in.
    if (started.getTime() > Date.now() - 60_000) started.setTime(Date.now() - (i + 1) * 37 * 60_000);

    const lines = outcome === "missed" ? [] : (TRANSCRIPTS[outcome] ?? TRANSCRIPTS.faq)(name);
    let sec = 0;
    const transcript = lines.map((line) => {
      const entry = { ...line, ts: new Date(started.getTime() + sec * 1000).toISOString(), startSec: sec };
      sec += 5 + Math.floor(rng() * 7);
      return entry;
    });

    const durationSec = outcome === "missed" ? 0 : sec + 10;
    const language = LANGUAGES[i % LANGUAGES.length];

    calls.push({
      id: `call-${String(i + 1).padStart(3, "0")}`,
      callerName: name,
      phone: `+91 ${70000 + Math.floor(rng() * 29999)} ${10000 + Math.floor(rng() * 89999)}`,
      startedAt: started.toISOString(),
      durationSec,
      language,
      outcome,
      sentiment: outcome === "human" ? "negative" : outcome === "missed" ? "neutral" : "positive",
      summary: SUMMARY[outcome](name.split(" ")[0]),
      transcript,
      extracted:
        outcome === "booked"
          ? { name, reason: REASONS[i % REASONS.length], slot: "Tomorrow, 12:00 PM" }
          : outcome === "faq"
            ? { name }
            : {},
      needsFollowUp: outcome === "human" || outcome === "dropped",
      recordingUrl: `/recordings/call-${String(i + 1).padStart(3, "0")}.mp3`,
      intent: INTENT[outcome],
      resolved: RESOLVED.has(outcome),
      confidence: outcome === "human" ? 0.62 : outcome === "dropped" ? 0.4 : 0.9,
      tags: [language.toLowerCase()],
      aiActions: ACTIONS[outcome],
    });
  });

  return calls.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

function buildAppointments(doctors) {
  const rng = makeRng(0x1234abcd);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const times = ["09:30", "10:30", "11:15", "12:00", "17:00", "17:45", "18:30"];

  return Array.from({ length: 14 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + (Math.floor(i / 2) % 7));
    const [h, m] = times[i % times.length].split(":").map(Number);
    day.setHours(h, m, 0, 0);
    const doctor = doctors[i % doctors.length];
    let status = "confirmed";
    if (day.getTime() < Date.now()) status = "completed";
    if (i === 5) status = "rescheduled";
    if (i === 9) status = "cancelled";
    return {
      id: `apt-${String(i + 1).padStart(3, "0")}`,
      patientName: NAMES[(i * 3 + 1) % NAMES.length],
      phone: `+91 ${70000 + Math.floor(rng() * 29999)} ${10000 + Math.floor(rng() * 89999)}`,
      doctorId: doctor.id,
      startsAt: day.toISOString(),
      durationMin: doctor.slotDurationMin,
      reason: REASONS[i % REASONS.length],
      status,
      bookedBy: i % 5 === 0 ? "staff" : "ai",
      whatsappSent: status !== "cancelled",
    };
  }).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

/**
 * Returns a fresh copy of the dataset.
 *
 * `demo: true` (the tests, and SEED_DEMO_DATA=true) adds 25 sample calls, a
 * week of appointments, live calls and campaign numbers so the dashboard looks
 * busy. `demo: false` is what a real clinic starts with: its configuration
 * (clinic, doctors, FAQs, knowledge) and no invented activity.
 */
export function seed({ demo = true } = {}) {
  const doctors = [
    {
      id: "doc-sharma",
      name: "Dr. Anil Sharma",
      speciality: "General Physician",
      fee: 500,
      slotDurationMin: 15,
      availability: [
        ...[1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "09:00", end: "13:00" })),
        ...[1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "17:00", end: "20:00" })),
      ],
    },
    {
      id: "doc-verma",
      name: "Dr. Priya Verma",
      speciality: "Gynaecologist",
      fee: 700,
      slotDurationMin: 20,
      availability: [1, 3, 5].map((day) => ({ day, start: "10:00", end: "14:00" })),
    },
    {
      id: "doc-khan",
      name: "Dr. Imran Khan",
      speciality: "Paediatrician",
      fee: 600,
      slotDurationMin: 15,
      availability: [2, 4, 6].map((day) => ({ day, start: "16:00", end: "20:00" })),
    },
  ];

  const faqs = [
    {
      id: "faq-1",
      question: "What are the clinic timings?",
      answer: "Monday to Saturday, 9:00 AM to 8:00 PM. Closed on Sundays.",
      hits: 41,
    },
    {
      id: "faq-2",
      question: "What is the consultation fee?",
      answer: "Dr. Sharma ₹500, Dr. Verma ₹700 and Dr. Khan ₹600 per consultation.",
      hits: 33,
    },
    {
      id: "faq-3",
      question: "Do you accept walk-in patients?",
      answer: "Walk-ins are welcome, but appointments are given priority.",
      hits: 18,
    },
    {
      id: "faq-4",
      question: "Where is the clinic located?",
      answer: "C-14, Green Park Extension, New Delhi 110016, near Green Park metro gate 2.",
      hits: 12,
    },
    {
      id: "faq-5",
      question: "Do you offer follow-up discounts?",
      answer: "A follow-up within 7 days is charged at 50% of the standard fee.",
      hits: 9,
    },
  ];

  const clinic = {
    name: "Sharma Family Clinic",
    address: "C-14, Green Park Extension, New Delhi 110016",
    phone: "+91 98110 22334",
    languages: ["Hindi", "English", "Hinglish"],
    greeting:
      "Namaste! Sharma Family Clinic mein aapka swagat hai. Main Dhwani hoon. Kaise madad kar sakti hoon?",
    faqs,
    escalation: {
      phone: "+91 98110 22334",
      triggers: ["emergency keywords", "patient asks for a human", "ai not confident"],
    },
    agent: {
      name: "Dhwani",
      voice: "Meera (warm, Indian English + Hindi)",
      speed: 1,
      greeting:
        "Namaste! Sharma Family Clinic mein aapka swagat hai. Main Dhwani hoon. Kaise madad kar sakti hoon?",
      fallback:
        "Sorry, main yeh samajh nahi payi. Main aapko clinic staff se connect kar deti hoon.",
      guardrails: [
        "Never gives medical advice or a diagnosis",
        "Never shares other patients' details",
        "Always routes emergencies to 108",
        "Announces recording at the start of every call",
      ],
      recordingConsent: true,
    },
  };

  const now = Date.now();

  const data = {
    clinic,
    doctors,
    calls: buildCalls(),
    appointments: buildAppointments(doctors),
    knowledge: [
      {
        id: "kb-1",
        title: "Insurance and TPA accepted",
        body: "We accept Star Health, HDFC Ergo and Care Health. TPA claims need a pre-authorisation form.",
        source: "staff",
        updatedAt: new Date(now - 6 * 864e5).toISOString(),
      },
      {
        id: "kb-2",
        title: "Fasting instructions for blood tests",
        body: "For a lipid profile or fasting sugar, come after 10 to 12 hours of fasting. Water is fine.",
        source: "document",
        updatedAt: new Date(now - 12 * 864e5).toISOString(),
      },
      {
        id: "kb-3",
        title: "Public holidays in October",
        body: "Closed on 2 October and 20 October. Dr. Sharma is on leave 24 to 26 October.",
        source: "staff",
        updatedAt: new Date(now - 2 * 864e5).toISOString(),
      },
      {
        id: "kb-4",
        title: "Vaccination schedule",
        body: "Child vaccinations are done Tuesdays and Thursdays, 10 AM to 1 PM. Bring the immunisation card.",
        source: "faq",
        updatedAt: new Date(now - 20 * 864e5).toISOString(),
      },
    ],
    liveCalls: [
      {
        id: "live-1",
        callerName: "Anjali Nair",
        phone: "+91 98107 33421",
        language: "Hinglish",
        intent: "New appointment",
        sentiment: "positive",
        startedAt: new Date(now - 96_000).toISOString(),
        durationSec: 96,
        phase: "booking",
        confidence: 0.91,
        currentLine: "Dr. Sharma ke paas kal 12:00 PM free hai. Book kar doon?",
        waveform: Array.from({ length: 44 }, (_, i) =>
          Math.round(18 + 82 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.29)))
        ),
      },
      {
        id: "live-2",
        callerName: "Rakesh Sharma",
        phone: "+91 99530 71188",
        language: "English",
        intent: "Reschedule",
        sentiment: "neutral",
        startedAt: new Date(now - 34_000).toISOString(),
        durationSec: 34,
        phase: "question",
        confidence: 0.78,
        currentLine: "Let me check Thursday morning for Dr. Verma.",
        waveform: Array.from({ length: 38 }, (_, i) =>
          Math.round(18 + 82 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.4)))
        ),
      },
    ],
    campaigns: [
      {
        id: "camp-1",
        name: "Appointment reminders",
        type: "reminder",
        status: "active",
        channel: "voice",
        audience: 42,
        contacted: 38,
        connected: 31,
        converted: 27,
        script: "Remind the patient about tomorrow's appointment and offer to reschedule.",
      },
      {
        id: "camp-2",
        name: "Waitlist backfill",
        type: "waitlist",
        status: "active",
        channel: "voice",
        audience: 12,
        contacted: 12,
        connected: 9,
        converted: 6,
        script: "A slot just opened up. Offer it to the waitlist in order.",
      },
      {
        id: "camp-3",
        name: "6-month recall",
        type: "recall",
        status: "scheduled",
        channel: "voice",
        audience: 88,
        contacted: 0,
        connected: 0,
        converted: 0,
        scheduledAt: new Date(now + 2 * 864e5).toISOString(),
        script: "It has been six months. Offer a routine check-up this week.",
      },
      {
        id: "camp-4",
        name: "Post-visit feedback",
        type: "feedback",
        status: "active",
        channel: "whatsapp",
        audience: 30,
        contacted: 24,
        connected: 19,
        converted: 17,
        script: "Ask how the visit went on a 1 to 5 scale.",
      },
    ],
    usage: {
      plan: "Clinic Pro",
      minutesUsed: 342,
      minutesIncluded: 500,
      ratePerMinute: 6,
      renewsAt: new Date(now + 18 * 864e5).toISOString(),
    },
    onboarding: [
      { id: "ob-1", label: "Clinic details", description: "Name, address and languages", done: true },
      { id: "ob-2", label: "Doctors and timings", description: "Who callers can book with", done: true, to: "/app/settings" },
      { id: "ob-3", label: "Greeting and FAQs", description: "What the agent says first", done: true, to: "/app/agent" },
      { id: "ob-4", label: "Connect your clinic number", description: "Forward calls to the agent", done: false, to: "/app/settings" },
      { id: "ob-5", label: "Make a test call", description: "Hear the agent before going live", done: false, to: "/app/agent" },
    ],
    savedViews: [
      { id: "v-all", label: "All calls", filters: {} },
      { id: "v-review", label: "Needs review", filters: { needsReview: true } },
      { id: "v-booked", label: "Booked", filters: { outcome: "booked" } },
      { id: "v-human", label: "Handed to human", filters: { outcome: "human" } },
      { id: "v-missed", label: "Missed", filters: { outcome: "missed" } },
    ],
  };

  if (demo) return data;
  return {
    ...data,
    calls: [],
    appointments: [],
    liveCalls: [],
    campaigns: [
      {
        id: "camp-reminders",
        name: "Appointment reminders",
        type: "reminder",
        status: "paused",
        channel: "whatsapp",
        audience: 0,
        contacted: 0,
        connected: 0,
        converted: 0,
        script:
          "Every evening, send tomorrow's patients a WhatsApp reminder with the doctor, time and address.",
      },
    ],
    usage: { ...data.usage, plan: "Starter", minutesUsed: 0 },
    onboarding: data.onboarding.map((s) => ({ ...s, done: false })),
  };
}
