import { addDays, addMinutes, format, set, startOfWeek, subDays } from "date-fns";
import type {
  Appointment,
  AppointmentStatus,
  AvailabilityBlock,
  Call,
  CallOutcome,
  Campaign,
  Clinic,
  Doctor,
  Language,
  KnowledgeItem,
  LiveCall,
  AgentMetrics,
  OnboardingStep,
  SavedView,
  Sentiment,
  TranscriptLine,
  Usage,
} from "@/types";

// ---------------------------------------------------------------------------
// Deterministic pseudo-random generator: the demo data is stable across
// reloads, while every date is computed relative to today so it never looks
// stale. Replace this whole file with the real API later.
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rng = makeRng(0x4aa7d0c);
const rand = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

export const DEMO_PHONE = "+91 00000 00000";

// ---------------------------------------------------------------------------
// Clinic
// ---------------------------------------------------------------------------
const clinic: Clinic = {
  name: "Sharma Family Clinic",
  address: "C-14, Green Park Extension, New Delhi 110016",
  phone: "+91 98110 22334",
  languages: ["Hindi", "English", "Hinglish"],
  greeting:
    "Namaste! Sharma Family Clinic mein aapka swagat hai. Main Dhwani hoon, aapki AI receptionist. Aap Hindi, English ya Hinglish mein baat kar sakte hain. Kaise madad kar sakti hoon?",
  faqs: [
    {
      id: "faq-1",
      question: "What are the clinic timings?",
      answer:
        "The clinic is open Monday to Saturday, 9:00 AM to 8:00 PM. We are closed on Sundays.",
      hits: 41,
    },
    {
      id: "faq-2",
      question: "What is the consultation fee?",
      answer:
        "Dr. Anil Sharma charges ₹500, Dr. Priya Verma ₹700 and Dr. Imran Khan ₹600 per consultation.",
      hits: 33,
    },
    {
      id: "faq-3",
      question: "Do you accept walk-in patients?",
      answer:
        "Walk-ins are welcome but appointments are given priority. We recommend booking a slot to reduce your waiting time.",
      hits: 18,
    },
    {
      id: "faq-4",
      question: "Where is the clinic located?",
      answer:
        "We are at C-14, Green Park Extension, New Delhi 110016, near the Green Park metro station gate 2.",
      hits: 12,
    },
    {
      id: "faq-5",
      question: "Do you offer follow-up discounts?",
      answer:
        "Yes, a follow-up visit within 7 days of your first consultation is charged at 50% of the standard fee.",
      hits: 9,
    },
  ],
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

const knowledge: KnowledgeItem[] = [
  {
    id: "kb-1",
    title: "Insurance and TPA accepted",
    body: "We accept Star Health, HDFC Ergo and Care Health. TPA claims need a pre-authorisation form, which the front desk fills in on the day of admission.",
    source: "staff",
    updatedAt: new Date(Date.now() - 6 * 864e5).toISOString(),
  },
  {
    id: "kb-2",
    title: "Fasting instructions for blood tests",
    body: "For a lipid profile or fasting sugar, come after 10 to 12 hours of fasting. Water is fine. Please carry your previous reports.",
    source: "document",
    updatedAt: new Date(Date.now() - 12 * 864e5).toISOString(),
  },
  {
    id: "kb-3",
    title: "Public holidays in October",
    body: "The clinic is closed on 2 October and 20 October. Dr. Sharma is on leave from 24 to 26 October.",
    source: "staff",
    updatedAt: new Date(Date.now() - 2 * 864e5).toISOString(),
  },
  {
    id: "kb-4",
    title: "Vaccination schedule",
    body: "Child vaccinations are done on Tuesdays and Thursdays between 10 AM and 1 PM. Bring the immunisation card.",
    source: "faq",
    updatedAt: new Date(Date.now() - 20 * 864e5).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------
const weekdays = [1, 2, 3, 4, 5, 6];
const blocks = (days: number[], ranges: [string, string][]): AvailabilityBlock[] =>
  days.flatMap((day) => ranges.map(([start, end]) => ({ day, start, end })));

const doctors: Doctor[] = [
  {
    id: "doc-sharma",
    name: "Dr. Anil Sharma",
    speciality: "General Physician",
    fee: 500,
    slotDurationMin: 15,
    availability: blocks(weekdays, [
      ["09:00", "13:00"],
      ["17:00", "20:00"],
    ]),
  },
  {
    id: "doc-verma",
    name: "Dr. Priya Verma",
    speciality: "Gynaecologist",
    fee: 700,
    slotDurationMin: 20,
    availability: blocks([1, 3, 5], [["10:00", "14:00"]]),
  },
  {
    id: "doc-khan",
    name: "Dr. Imran Khan",
    speciality: "Paediatrician",
    fee: 600,
    slotDurationMin: 15,
    availability: blocks([2, 4, 6], [["16:00", "20:00"]]),
  },
];

// ---------------------------------------------------------------------------
// Transcript builders, written in all three languages
// ---------------------------------------------------------------------------
type Line = { speaker: "ai" | "patient"; text: string };
const first = (name: string) => name.split(" ")[0];

const GREETING: Record<Language, string> = {
  Hinglish:
    "Namaste! Sharma Family Clinic mein aapka swagat hai. Main Dhwani hoon. Kaise madad kar sakti hoon?",
  Hindi:
    "नमस्ते! शर्मा फैमिली क्लिनिक में आपका स्वागत है। मैं आवाज़डॉक हूँ। कैसे मदद कर सकती हूँ?",
  English:
    "Hello, thank you for calling Sharma Family Clinic. This is Dhwani. How may I help you?",
};

function bookingLines(name: string, lang: Language): Line[] {
  const n = first(name);
  if (lang === "English")
    return [
      { speaker: "ai", text: GREETING.English },
      { speaker: "patient", text: "Hi, I'd like to book an appointment for tomorrow." },
      { speaker: "ai", text: "Of course. Which doctor would you like to see? Dr. Sharma, Dr. Verma or Dr. Khan?" },
      { speaker: "patient", text: "Dr. Sharma, please. I've not been feeling well." },
      { speaker: "ai", text: "I understand. Tomorrow Dr. Sharma has 10:30 AM, 12:00 PM and 5:30 PM open. Which works best?" },
      { speaker: "patient", text: "12 PM is fine." },
      { speaker: "ai", text: "Noted. May I have your name, please?" },
      { speaker: "patient", text: `${name}.` },
      { speaker: "ai", text: `Thank you, ${n}. Your appointment is booked for tomorrow at 12:00 PM with Dr. Sharma. I'm sending a WhatsApp confirmation now. Take care!` },
    ];
  if (lang === "Hindi")
    return [
      { speaker: "ai", text: GREETING.Hindi },
      { speaker: "patient", text: "मुझे कल डॉक्टर को दिखाना है।" },
      { speaker: "ai", text: "जी बिलकुल। आप किस डॉक्टर से मिलना चाहेंगे? डॉ. शर्मा, डॉ. वर्मा या डॉ. खान?" },
      { speaker: "patient", text: "डॉ. शर्मा से, तबीयत ठीक नहीं लग रही।" },
      { speaker: "ai", text: "समझ गई। कल के लिए सुबह 10:30, दोपहर 12:00 और शाम 5:30 उपलब्ध हैं। कौन-सा समय ठीक रहेगा?" },
      { speaker: "patient", text: "12 बजे ठीक है।" },
      { speaker: "ai", text: "ठीक है, आपका नाम बता दीजिए।" },
      { speaker: "patient", text: `${name}।` },
      { speaker: "ai", text: `${n} जी, आपका अपॉइंटमेंट कल दोपहर 12:00 बजे डॉ. शर्मा के साथ बुक हो गया है। WhatsApp पर पुष्टि भेज रही हूँ। धन्यवाद!` },
    ];
  return [
    { speaker: "ai", text: GREETING.Hinglish },
    { speaker: "patient", text: "Haan, mujhe kal doctor ko dikhana hai." },
    { speaker: "ai", text: "Bilkul. Aap kis doctor se milna chahenge? Dr. Sharma, Dr. Verma ya Dr. Khan?" },
    { speaker: "patient", text: "Dr. Sharma se, tabiyat kuch theek nahi lag rahi." },
    { speaker: "ai", text: "Samajh gayi. Kal ke liye 10:30 AM, 12:00 PM aur 5:30 PM available hain. Kaunsa time theek rahega?" },
    { speaker: "patient", text: "12 baje ho jaye toh badhiya." },
    { speaker: "ai", text: "12:00 PM note kar liya. Aapka naam kya hai?" },
    { speaker: "patient", text: `${name}.` },
    { speaker: "ai", text: `${n} ji, aapka appointment kal 12:00 PM, Dr. Sharma ke saath book kar diya hai. WhatsApp par confirmation bhej rahi hoon. Dhanyavaad!` },
  ];
}

function faqLines(lang: Language): Line[] {
  if (lang === "English")
    return [
      { speaker: "ai", text: GREETING.English },
      { speaker: "patient", text: "What are your clinic timings?" },
      { speaker: "ai", text: "We're open Monday to Saturday, 9 AM to 8 PM. We're closed on Sundays." },
      { speaker: "patient", text: "And how much is the consultation fee?" },
      { speaker: "ai", text: "Dr. Sharma charges ₹500, Dr. Verma ₹700 and Dr. Khan ₹600. Would you like me to book an appointment?" },
      { speaker: "patient", text: "No, thank you. I'll call later." },
      { speaker: "ai", text: "No problem at all. Have a great day!" },
    ];
  if (lang === "Hindi")
    return [
      { speaker: "ai", text: GREETING.Hindi },
      { speaker: "patient", text: "क्लिनिक कितने बजे खुलती है?" },
      { speaker: "ai", text: "क्लिनिक सोमवार से शनिवार, सुबह 9 से रात 8 बजे तक खुली रहती है। रविवार बंद रहता है।" },
      { speaker: "patient", text: "परामर्श शुल्क कितना है?" },
      { speaker: "ai", text: "डॉ. शर्मा की फीस ₹500, डॉ. वर्मा ₹700 और डॉ. खान ₹600 है। क्या अपॉइंटमेंट बुक कर दूँ?" },
      { speaker: "patient", text: "नहीं, धन्यवाद। मैं बाद में कॉल करूँगा।" },
      { speaker: "ai", text: "कोई बात नहीं! आपका दिन शुभ रहे।" },
    ];
  return [
    { speaker: "ai", text: GREETING.Hinglish },
    { speaker: "patient", text: "Clinic kitne baje khulti hai?" },
    { speaker: "ai", text: "Clinic Monday se Saturday, subah 9 se raat 8 baje tak khuli rehti hai. Sunday closed hai." },
    { speaker: "patient", text: "Consultation fee kitni hai?" },
    { speaker: "ai", text: "Dr. Sharma ki fee ₹500, Dr. Verma ₹700 aur Dr. Khan ₹600 hai. Appointment book kar doon?" },
    { speaker: "patient", text: "Nahi, thank you. Main baad mein call karunga." },
    { speaker: "ai", text: "Koi baat nahi! Aapka din shubh rahe." },
  ];
}

function humanLines(lang: Language): Line[] {
  if (lang === "English")
    return [
      { speaker: "patient", text: "My father is having severe chest pain, please help!" },
      { speaker: "ai", text: "I understand, and this sounds urgent. If it is an emergency, please call 108 right away." },
      { speaker: "ai", text: "I'm connecting you to our clinic staff now. Please stay on the line." },
      { speaker: "patient", text: "Please hurry!" },
      { speaker: "ai", text: "Connecting you now. The staff line is coming on." },
    ];
  if (lang === "Hindi")
    return [
      { speaker: "patient", text: "मेरे पापा को बहुत सीने में दर्द हो रहा है!" },
      { speaker: "ai", text: "मैं समझ रही हूँ, यह आपातकालीन लगता है। कृपया तुरंत 108 पर कॉल करें।" },
      { speaker: "ai", text: "मैं आपको अभी हमारी क्लिनिक स्टाफ से जोड़ रही हूँ। कृपया लाइन पर बने रहें।" },
      { speaker: "patient", text: "जल्दी कीजिए!" },
      { speaker: "ai", text: "जोड़ रही हूँ। स्टाफ लाइन पर आ रही है।" },
    ];
  return [
    { speaker: "patient", text: "Mere papa ko bahut chest pain ho raha hai!" },
    { speaker: "ai", text: "Main samajh rahi hoon, yeh urgent lagta hai. Agar emergency hai toh kripya turant 108 par call karein." },
    { speaker: "ai", text: "Main aapko abhi hamari clinic staff se connect kar rahi hoon, please line par bane rahein." },
    { speaker: "patient", text: "Jaldi karo please!" },
    { speaker: "ai", text: "Connecting you now. Staff line par aa rahi hain." },
  ];
}

function rescheduleLines(lang: Language): Line[] {
  if (lang === "English")
    return [
      { speaker: "ai", text: GREETING.English },
      { speaker: "patient", text: "I need to reschedule my appointment." },
      { speaker: "ai", text: "Sure. Your appointment is tomorrow at 12:00 PM with Dr. Sharma. When would you like it instead?" },
      { speaker: "patient", text: "The day after tomorrow, morning." },
      { speaker: "ai", text: "I have 10:30 AM and 11:15 AM open that morning." },
      { speaker: "patient", text: "10:30 works." },
      { speaker: "ai", text: "Done. Your appointment is moved to 10:30 AM the day after tomorrow. I'm sending an updated WhatsApp confirmation." },
    ];
  return [
    { speaker: "ai", text: GREETING.Hinglish },
    { speaker: "patient", text: "Mera appointment kal 12 baje hai, usse reschedule karna hai." },
    { speaker: "ai", text: "Zaroor. Aapka appointment Dr. Sharma ke saath kal 12:00 PM par hai. Naya time kab chahiye?" },
    { speaker: "patient", text: "Parso subah." },
    { speaker: "ai", text: "Parso subah 10:30 AM aur 11:15 AM available hain." },
    { speaker: "patient", text: "10:30 chalega." },
    { speaker: "ai", text: "Ho gaya! Aapka appointment parso 10:30 AM par reschedule kar diya hai. Naya WhatsApp confirmation bhej rahi hoon." },
  ];
}

function cancelLines(lang: Language): Line[] {
  if (lang === "English")
    return [
      { speaker: "ai", text: GREETING.English },
      { speaker: "patient", text: "I'd like to cancel my appointment." },
      { speaker: "ai", text: "Certainly. Your appointment is today at 4:00 PM with Dr. Verma. Shall I confirm the cancellation?" },
      { speaker: "patient", text: "Yes, please cancel it." },
      { speaker: "ai", text: "It's cancelled. Do reach out whenever you'd like to book again. Thank you!" },
    ];
  return [
    { speaker: "ai", text: GREETING.Hinglish },
    { speaker: "patient", text: "Mujhe apna appointment cancel karna hai." },
    { speaker: "ai", text: "Zaroor, kar deti hoon. Aapka appointment Dr. Verma ke saath aaj 4:00 PM par hai. Confirm cancel karna hai?" },
    { speaker: "patient", text: "Haan, cancel kar do." },
    { speaker: "ai", text: "Cancel kar diya gaya hai. Dobara book karna ho toh bataiyega. Thank you!" },
  ];
}

function droppedLines(lang: Language): Line[] {
  return [
    { speaker: "ai", text: GREETING[lang] },
    { speaker: "patient", text: lang === "English" ? "Hi, one second…" : "Haan, ek second…" },
    { speaker: "ai", text: lang === "English" ? "Of course, take your time." : "Ji, boliye." },
  ];
}

/** Attach wall-clock timestamps and audio offsets to each line. */
function stamp(startedAt: Date, lines: Line[]): { transcript: TranscriptLine[]; lastSec: number } {
  let cursor = startedAt;
  let sec = 0;
  const transcript = lines.map((l) => {
    const line: TranscriptLine = {
      speaker: l.speaker,
      text: l.text,
      ts: new Date(cursor.getTime()).toISOString(),
      startSec: sec,
    };
    const gap = rand(5, 11);
    cursor = addMinutes(cursor, 0);
    cursor = new Date(cursor.getTime() + gap * 1000);
    sec += gap;
    return line;
  });
  return { transcript, lastSec: sec };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------
const PATIENT_NAMES = [
  "Rahul Mehta", "Ananya Gupta", "Suresh Kumar", "Priya Nair", "Mohammed Faiz",
  "Kavita Joshi", "Arjun Singh", "Neha Sharma", "Rohit Bansal", "Sunita Devi",
  "Vikram Rao", "Aisha Siddiqui", "Manish Agarwal", "Deepa Iyer", "Harpreet Kaur",
  "Sanjay Verma", "Pooja Reddy", "Tarun Malhotra", "Meera Pillai", "Gaurav Chauhan",
  "Ritu Saxena", "Imran Qureshi", "Shreya Kapoor", "Naveen Yadav", "Lakshmi Menon",
];

const OUTCOME_PLAN: CallOutcome[] = [
  "booked", "faq", "booked", "human", "booked", "faq", "dropped", "booked",
  "faq", "missed", "booked", "human", "faq", "booked", "rescheduled", "faq",
  "booked", "human", "faq", "dropped", "booked", "faq", "cancelled", "booked", "missed",
];

const REASONS = [
  "Fever and cold", "Routine check-up", "Follow-up visit", "Skin rash",
  "Stomach pain", "Vaccination", "Blood pressure review", "Joint pain",
  "Child's fever", "Persistent cough",
];

const INTENT: Record<CallOutcome, string> = {
  booked: "New appointment",
  faq: "Clinic question",
  human: "Urgent case",
  dropped: "Incomplete call",
  missed: "Missed call",
  rescheduled: "Reschedule",
  cancelled: "Cancellation",
};

const CONFIDENCE: Record<CallOutcome, [number, number]> = {
  booked: [900, 980],
  faq: [840, 950],
  rescheduled: [860, 960],
  cancelled: [850, 950],
  human: [550, 720],
  dropped: [300, 500],
  missed: [0, 0],
};

const ACTIONS: Record<CallOutcome, string[]> = {
  booked: ["Checked the doctor's calendar", "Held the slot for 5 minutes", "Sent the WhatsApp confirmation"],
  faq: ["Answered from the clinic FAQs", "Offered to book an appointment"],
  human: ["Detected an urgent phrase", "Read out the 108 guidance", "Warmed the transfer to the staff line"],
  dropped: ["Attempted to re-establish audio", "Queued a recovery SMS"],
  missed: ["Rang out with no answer", "Queued a recovery SMS"],
  rescheduled: ["Found the existing appointment", "Moved it to the new slot", "Sent an updated confirmation"],
  cancelled: ["Confirmed the cancellation", "Released the slot back to the calendar"],
};

const SUMMARY: Record<CallOutcome, (n: string) => string> = {
  booked: (n) => `Booked an appointment for ${n}; details confirmed and WhatsApp sent.`,
  faq: () => "Caller asked about clinic timings and consultation fees; answered, no booking needed.",
  human: (n) => `${n}'s call flagged as urgent and handed to clinic staff for immediate follow-up.`,
  dropped: () => "Call dropped mid-conversation before the caller's need was captured.",
  missed: () => "Missed call. Rang out with no answer. Recovery SMS sent to the caller.",
  rescheduled: (n) => `Rescheduled ${n}'s appointment to a later slot; new confirmation sent.`,
  cancelled: (n) => `${n} cancelled an existing appointment; slot released back to the calendar.`,
};

const RESOLVED: CallOutcome[] = ["booked", "faq", "rescheduled", "cancelled"];

function languageForOutcome(outcome: CallOutcome): Language {
  const r = rng();
  if (outcome === "human") return r < 0.5 ? "Hinglish" : "Hindi";
  if (r < 0.5) return "Hinglish";
  if (r < 0.82) return "Hindi";
  return "English";
}

function sentimentFor(outcome: CallOutcome): Sentiment {
  if (outcome === "human") return "negative";
  if (outcome === "dropped" || outcome === "missed") return "neutral";
  if (outcome === "booked" || outcome === "rescheduled") return "positive";
  const r = rng();
  return r < 0.6 ? "positive" : r < 0.9 ? "neutral" : "negative";
}

function buildCalls(): Call[] {
  const today = new Date();
  return PATIENT_NAMES.map((name, i) => {
    const outcome = OUTCOME_PLAN[i];
    const dayOffset = i % 7;
    const language = languageForOutcome(outcome);
    // Spread the times deterministically so the log never shows duplicate slots.
    const hour = 9 + ((i * 3) % 10);
    const minute = (i * 7) % 60;
    const startedAt = set(subDays(today, dayOffset), {
      hours: hour,
      minutes: minute,
      seconds: rand(0, 59),
      milliseconds: 0,
    });

    const lines =
      outcome === "booked" ? bookingLines(name, language)
      : outcome === "faq" ? faqLines(language)
      : outcome === "human" ? humanLines(language)
      : outcome === "rescheduled" ? rescheduleLines(language)
      : outcome === "cancelled" ? cancelLines(language)
      : outcome === "dropped" ? droppedLines(language)
      : [];

    const { transcript, lastSec } = stamp(startedAt, lines);
    const durationSec =
      outcome === "missed" ? 0
      : outcome === "dropped" ? lastSec + rand(2, 6)
      : lastSec + rand(8, 40);

    const slot = addDays(startedAt, 1);
    const extracted =
      outcome === "missed" || outcome === "dropped"
        ? {}
        : {
            name,
            reason: outcome === "faq" ? undefined : pick(REASONS),
            slot:
              outcome === "booked" || outcome === "rescheduled"
                ? format(set(slot, { hours: 12, minutes: 0 }), "EEE, d MMM · h:mm a")
                : undefined,
          };

    const [cLo, cHi] = CONFIDENCE[outcome];
    const tags = [language.toLowerCase()];
    if (outcome === "booked") tags.push("booking");
    if (outcome === "human") tags.push("escalation", "urgent");
    if (outcome === "faq") tags.push("no-action");
    if (outcome === "missed" || outcome === "dropped") tags.push("recovery");

    return {
      id: `call-${String(i + 1).padStart(3, "0")}`,
      callerName: name,
      phone: `+91 ${rand(70000, 99999)} ${rand(10000, 99999)}`,
      startedAt: startedAt.toISOString(),
      durationSec,
      language,
      outcome,
      sentiment: sentimentFor(outcome),
      summary: SUMMARY[outcome](first(name)),
      transcript,
      extracted,
      needsFollowUp: outcome === "human" || outcome === "dropped",
      recordingUrl: `/mock/recordings/call-${String(i + 1).padStart(3, "0")}.mp3`,
      intent: INTENT[outcome],
      resolved: RESOLVED.includes(outcome),
      confidence: rand(cLo, cHi) / 1000,
      tags,
      aiActions: ACTIONS[outcome],
    };
  }).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
function buildAppointments(): Appointment[] {
  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const times = ["09:30", "10:30", "11:15", "12:00", "12:45", "17:00", "17:45", "18:30"];
  const rows: Appointment[] = [];
  for (let i = 0; i < 20; i++) {
    const day = addDays(monday, Math.floor(i / 3) % 7);
    const [h, m] = pick(times).split(":").map(Number);
    const startsAt = set(day, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
    const doctor = doctors[i % doctors.length];
    let status: AppointmentStatus = "confirmed";
    if (startsAt.getTime() < today.getTime()) status = "completed";
    if (i === 6) status = "rescheduled";
    if (i === 11 || i === 17) status = "cancelled";
    rows.push({
      id: `apt-${String(i + 1).padStart(3, "0")}`,
      patientName: PATIENT_NAMES[(i * 3 + 1) % PATIENT_NAMES.length],
      phone: `+91 ${rand(70000, 99999)} ${rand(10000, 99999)}`,
      doctorId: doctor.id,
      startsAt: startsAt.toISOString(),
      durationMin: doctor.slotDurationMin,
      reason: REASONS[i % REASONS.length],
      status,
      bookedBy: i % 5 === 0 ? "staff" : "ai",
      whatsappSent: status !== "cancelled",
    });
  }
  return rows.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

// ---------------------------------------------------------------------------
// Live calls (in progress right now)
// ---------------------------------------------------------------------------
const waveform = (len = 44) =>
  Array.from({ length: len }, (_, i) =>
    Math.round(18 + 82 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.29)))
  );

function buildLiveCalls(): LiveCall[] {
  const now = Date.now();
  return [
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
      waveform: waveform(),
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
      waveform: waveform(38),
    },
    {
      id: "live-3",
      callerName: "Unknown caller",
      phone: "+91 88009 21077",
      language: "Hindi",
      intent: "Clinic question",
      sentiment: "neutral",
      startedAt: new Date(now - 9_000).toISOString(),
      durationSec: 9,
      phase: "greeting",
      confidence: 0.64,
      currentLine: "नमस्ते! शर्मा फैमिली क्लिनिक में आपका स्वागत है।",
      waveform: waveform(30),
    },
  ];
}

// ---------------------------------------------------------------------------
// Agent quality (derived from the calls so the numbers agree)
// ---------------------------------------------------------------------------
function buildAgentMetrics(calls: Call[]): AgentMetrics {
  const total = calls.length;
  const resolved = calls.filter((c) => c.resolved).length;
  const handoffs = calls.filter((c) => c.outcome === "human").length;
  const answered = calls.filter((c) => c.durationSec > 0);
  const avgHandleSec = Math.round(
    answered.reduce((s, c) => s + c.durationSec, 0) / Math.max(answered.length, 1)
  );
  const byIntent = new Map<string, { total: number; resolved: number }>();
  for (const c of calls) {
    const e = byIntent.get(c.intent) ?? { total: 0, resolved: 0 };
    e.total += 1;
    if (c.resolved) e.resolved += 1;
    byIntent.set(c.intent, e);
  }
  const intents = [...byIntent.entries()]
    .map(([intent, v]) => ({
      intent,
      total: v.total,
      resolved: v.resolved,
      accuracy: v.resolved / v.total,
    }))
    .sort((a, b) => b.total - a.total);

  const trend = [0.86, 0.88, 0.87, 0.9, 0.91, 0.93, 0.94];
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return {
    resolutionRate: resolved / total,
    containmentRate: (total - handoffs) / total,
    avgHandleSec,
    humanHandoffs: handoffs,
    needsReview: calls.filter((c) => !c.resolved).length,
    reviewQueue: calls.filter((c) => !c.resolved).map((c) => c.id),
    accuracyTrend: labels.map((label, i) => ({ label, value: trend[i] })),
    intents,
  };
}

// ---------------------------------------------------------------------------
// Outbound campaigns
// ---------------------------------------------------------------------------
const campaigns: Campaign[] = [
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
    script:
      "Remind the patient about tomorrow's appointment, confirm attendance, and offer to reschedule if they cannot make it.",
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
    script:
      "A slot just opened up. Offer it to the waitlist in order, first to accept gets it.",
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
    scheduledAt: addDays(new Date(), 2).toISOString(),
    script:
      "It has been six months since the last visit. Offer a routine check-up slot this week.",
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
    script: "Ask how the visit went on a 1 to 5 scale and route anything below 4 to the clinic manager.",
  },
  {
    id: "camp-5",
    name: "Vaccination due",
    type: "recall",
    status: "paused",
    channel: "voice",
    audience: 24,
    contacted: 10,
    connected: 8,
    converted: 5,
    script: "Remind parents that the next vaccination is due and book the Tuesday or Thursday slot.",
  },
];

const usage: Usage = {
  plan: "Clinic Pro",
  minutesUsed: 342,
  minutesIncluded: 500,
  ratePerMinute: 6,
  renewsAt: addDays(new Date(), 18).toISOString(),
};

const onboarding: OnboardingStep[] = [
  { id: "ob-1", label: "Clinic details", description: "Name, address and languages", done: true },
  { id: "ob-2", label: "Doctors and timings", description: "Who callers can book with", done: true, to: "/app/settings" },
  { id: "ob-3", label: "Greeting and FAQs", description: "What the agent says first", done: true, to: "/app/agent" },
  { id: "ob-4", label: "Connect your clinic number", description: "Forward calls to Dhwani", done: false, to: "/app/settings" },
  { id: "ob-5", label: "Make a test call", description: "Hear the agent before going live", done: false, to: "/app/agent" },
];

const savedViews: SavedView[] = [
  { id: "v-all", label: "All calls", filters: {} },
  { id: "v-review", label: "Needs review", filters: { needsReview: true } },
  { id: "v-booked", label: "Booked", filters: { outcome: "booked" } },
  { id: "v-human", label: "Handed to human", filters: { outcome: "human" } },
  { id: "v-missed", label: "Missed", filters: { outcome: "missed" } },
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export const mockClinic: Clinic = clinic;
export const mockKnowledge: KnowledgeItem[] = knowledge;
export const mockDoctors: Doctor[] = doctors;
export const mockCalls: Call[] = buildCalls();
export const mockAppointments: Appointment[] = buildAppointments();
export const mockLiveCalls: LiveCall[] = buildLiveCalls();
export const mockAgentMetrics: AgentMetrics = buildAgentMetrics(mockCalls);
export const mockCampaigns: Campaign[] = campaigns;
export const mockUsage: Usage = usage;
export const mockOnboarding: OnboardingStep[] = onboarding;
export const mockSavedViews: SavedView[] = savedViews;

/** Stable, believable waveform for the audio-player placeholder. */
export const mockWaveform: number[] = Array.from({ length: 96 }, (_, i) =>
  Math.round(16 + 84 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.31)))
);
