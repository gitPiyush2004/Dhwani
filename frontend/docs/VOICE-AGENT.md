# Voice agent (Bolna) integration

What the voice agent has to do, which endpoints it calls, what it must send back, and the rules it
must never break.

Read [API-CONTRACT.md](API-CONTRACT.md) for the exact request and response shapes.

---

## 1. What the agent is responsible for

| Job | How |
| --- | --- |
| Answer every call | Greet in the caller's language, in under 5 seconds |
| Understand the request | Book, reschedule, cancel, or answer a question |
| Check real availability | Always ask the backend, never guess a slot |
| Book the slot | The backend re-checks, so a double booking is impossible |
| Confirm | Say the details back, and trigger the WhatsApp message |
| Hand off when needed | Emergencies and frustration go to a human |
| Report the call | Post the transcript and summary to the webhook |

The agent is stateless. Everything it knows about the clinic comes from the backend on the call.

---

## 2. Tools the agent calls mid-call

Declare these as function-calling tools. The shapes below work as-is in Bolna and in any
OpenAI-compatible function-calling setup.

### `check_slots`

```json
{
  "name": "check_slots",
  "description": "Find the free appointment times for a doctor on a given date. Call this before offering any time to the patient. Never invent a time.",
  "parameters": {
    "type": "object",
    "properties": {
      "doctorId": { "type": "string", "description": "One of: doc-sharma, doc-verma, doc-khan" },
      "date": { "type": "string", "description": "Date in YYYY-MM-DD. Resolve 'kal' or 'tomorrow' to a real date before calling." }
    },
    "required": ["doctorId", "date"]
  }
}
```

`GET /api/slots?doctorId=<id>&date=<YYYY-MM-DD>` returns `{ "slots": ["09:00", "09:15"] }`.

Read at most three times back to the patient. If the list is empty, say the doctor is full that day
and offer the next day.

### `book_appointment`

```json
{
  "name": "book_appointment",
  "description": "Book a slot. Only call this after the patient has confirmed the doctor, the date and the time, and after you have repeated the name back to them.",
  "parameters": {
    "type": "object",
    "properties": {
      "patientName": { "type": "string", "description": "Spell-check with the patient before sending" },
      "phone": { "type": "string", "description": "Caller ID, or the number the patient gives you" },
      "doctorId": { "type": "string" },
      "startsAt": { "type": "string", "description": "ISO 8601. Convert the chosen slot to this exact value." },
      "reason": { "type": "string", "description": "Short reason for the visit, e.g. 'Fever and cold'" }
    },
    "required": ["patientName", "phone", "doctorId", "startsAt", "reason"]
  }
}
```

`POST /api/appointments` returns the created appointment, or `409` with
`"That slot is already taken. Please pick another time."`

**On 409:** apologise once, call `check_slots` again, and offer the next available time. Never
retry the same slot.

### `move_appointment` and `cancel_appointment`

```json
{
  "name": "move_appointment",
  "parameters": {
    "type": "object",
    "properties": {
      "appointmentId": { "type": "string" },
      "startsAt": { "type": "string", "description": "ISO 8601, the new time" }
    },
    "required": ["appointmentId", "startsAt"]
  }
}
```

`PATCH /api/appointments/:id` with `{ "startsAt": "..." }` or `{ "status": "cancelled" }`.

The agent needs the appointment id to do this. Add a tool that looks it up by phone number, for
example `GET /api/appointments?phone=<number>`, and only act if exactly one live appointment comes
back. If several come back, ask the patient which one.

### `answer_faq`

```json
{
  "name": "answer_faq",
  "parameters": {
    "type": "object",
    "properties": { "question": { "type": "string" } },
    "required": ["question"]
  }
}
```

Backed by `GET /api/faqs` and the knowledge base. **Load both once at the start of the call** and
keep them in context. Do not call the API for every question; it wastes latency and the content
does not change mid-call.

### `handoff_to_human`

```json
{
  "name": "handoff_to_human",
  "parameters": {
    "type": "object",
    "properties": { "reason": { "type": "string", "description": "Why the handoff is happening" } },
    "required": ["reason"]
  }
}
```

Warm-transfer the call to `clinic.escalation.phone`.

---

## 3. Post-call webhook

After the call ends, `POST /api/calls/webhook` once. This is the only thing that fills the Calls
table, so the dashboard, the review queue and the accuracy numbers all depend on it.

```json
{
  "callerName": "Priya Nair",
  "phone": "+91 98110 22334",
  "startedAt": "2026-10-17T11:15:00.000Z",
  "durationSec": 128,
  "language": "Hinglish",
  "outcome": "booked",
  "sentiment": "positive",
  "summary": "Booked an appointment for Priya with Dr. Sharma for tomorrow at 12:00 PM; WhatsApp confirmation sent.",
  "intent": "New appointment",
  "resolved": true,
  "confidence": 0.93,
  "needsFollowUp": false,
  "recordingUrl": "https://.../call-004.mp3",
  "extracted": { "name": "Priya Nair", "reason": "Fever and cold", "slot": "Tomorrow, 12:00 PM" },
  "aiActions": ["Checked Dr. Sharma's calendar", "Held the 12:00 PM slot", "Sent the WhatsApp confirmation"],
  "transcript": [
    { "speaker": "ai", "text": "Namaste! Sharma Family Clinic mein aapka swagat hai.", "startSec": 0 },
    { "speaker": "patient", "text": "Mujhe kal doctor ko dikhana hai.", "startSec": 7 }
  ]
}
```

### Field rules

| Field | Required | Why it matters |
| --- | --- | --- |
| `transcript` | Yes | The call drawer. Send `startSec` for every line, or the player cannot follow along |
| `transcript[].speaker` | Yes | `ai` (or `agent`) for the agent, anything else is treated as the caller |
| `outcome` | Yes | Drives every badge, filter and chart. One of: `booked`, `faq`, `human`, `dropped`, `missed`, `rescheduled`, `cancelled` |
| `resolved` | Yes | `false` puts the call in the **review queue** on the Agent page. Be honest: if the agent could not finish, or a human took over, send `false` |
| `durationSec` | Yes | Seconds, not minutes |
| `summary` | Yes | Two sentences maximum. This is what the clinic owner reads first |
| `intent` | Preferred | Feeds "accuracy by intent". Keep to a small fixed set, see below |
| `confidence` | Preferred | 0 to 1. The agent's own confidence. Shown in the drawer |
| `language` | Preferred | `Hindi`, `English` or `Hinglish` |
| `needsFollowUp` | Preferred | `true` for handoffs and dropped calls, so they surface on the Overview |
| `extracted`, `aiActions`, `recordingUrl` | Optional | Nice to have, sections hide themselves if absent |

### Keep `intent` to a fixed set

Free-text intents fragment the accuracy chart. Use exactly these:

`New appointment`, `Reschedule`, `Cancellation`, `Clinic question`, `Urgent case`, `Incomplete call`,
`Missed call`.

### Retry behaviour

If the webhook fails, retry with backoff. Losing a webhook loses the call from the dashboard
permanently. Send it once per call, not once per turn.

---

## 4. Latency budget

The patient is on the line waiting, so this is a hard constraint, not a nice to have.

| Call | Target | Notes |
| --- | --- | --- |
| `GET /api/slots` | p50 under 200 ms, p99 under 500 ms | Runs mid-sentence. Cache the Sheet read for the duration of the call |
| `POST /api/appointments` | under 500 ms | The patient has just said yes and is waiting for confirmation |
| `GET /api/faqs`, `GET /api/clinic` | under 300 ms | Load once at the start of the call, not per question |
| `POST /api/calls/webhook` | no budget | Fire and forget, after the call |

Three rules that follow from this:

1. **Speak while you wait.** If a tool call takes more than about 400 ms, say a short filler first:
   "Ek second, main check kar rahi hoon." Silence reads as a dropped line.
2. **Never chain tool calls in one turn.** `check_slots` then `book_appointment` in the same turn
   doubles the wait. Let the patient fill the gap.
3. **Do not call the API for things you already have.** FAQs and clinic details are loaded at call
   start.

Target under 1.2 seconds from the patient finishing a sentence to the agent starting a reply.

---

## 5. Language handling

- Detect the language from the first sentence and stay in it. Hinglish callers often switch mid-call;
  follow them rather than forcing one language.
- Hindi callers may use Devanagari words in speech. Transcribe them as spoken; the dashboard renders
  Devanagari correctly.
- Numbers: say times the Indian way. "12 baje" and "twelve o'clock" both work, but confirm with the
  date as well, because "kal" is ambiguous near midnight.
- Money: rupees, and say the amount clearly once.
- **Indian names are the biggest accuracy risk.** Always repeat the name back and ask the patient to
  correct it before booking: "Aapka naam Rahul Mehta hai, sahi?" Then send the confirmed spelling.
- Keep replies to one or two short sentences. Long turns increase the chance of being interrupted.

---

## 6. Edge cases

| Situation | What the agent does |
| --- | --- |
| Emergency phrases (chest pain, breathlessness, bleeding, accident, unconscious) | Immediately say to call 108, then hand off to the human line. **Do not** try to book, and do not advise |
| The caller asks for medical advice | Decline politely, offer an appointment instead. This is a guardrail |
| The caller asks about another patient | Refuse. Never share anyone else's details |
| Silence or no speech for a few seconds | Prompt once: "Hello, aap sun rahe hain?" Then prompt again, then end the call with outcome `dropped` |
| Heavy background noise or an unintelligible turn | Ask the caller to repeat once, then hand off |
| The caller speaks a language the agent does not have | Hand off. Do not guess |
| The caller asks for a slot that is taken | Apologise once, re-check, offer the next slot |
| The caller wants a doctor who is on leave | Say so, offer another doctor or another date |
| The caller hangs up mid-booking | Do not book anything. Post the webhook with outcome `dropped` and `resolved: false` |
| The call rings out and is never answered | Post the webhook with outcome `missed` and an empty transcript |

### Guardrails, in the agent's own words

These are also stored in `clinic.agent.guardrails` and shown on the Agent page, so keep them in sync:

- Never give medical advice or a diagnosis.
- Never share another patient's details.
- Always route emergencies to 108 first.
- Announce that the call is recorded, at the start of every call.

---

## 7. System prompt skeleton

```
You are {{clinic.agent.name}}, the receptionist for {{clinic.name}}.

Language: reply in the caller's language. Hindi, English or Hinglish. Follow them if they switch.

Opening: "{{clinic.agent.greeting}}"
Then, once: "Yeh call record ho rahi hai." (recording consent)

Clinic facts you may use, and nothing else:
- Address: {{clinic.address}}
- Timings: {{faqs[0].answer}}
- Fees: {{faqs[1].answer}}
- Other questions: answer only from the FAQs and the knowledge base you were given.
  If the answer is not there, say you will have the clinic call back, and use handoff_to_human.

Booking:
1. Ask which doctor. Offer the three by name and speciality.
2. Ask which day. Resolve "kal" and "parso" to a real date out loud.
3. Call check_slots. Offer at most three times.
4. Confirm the doctor, the date and the time, then repeat the name back and get a yes.
5. Call book_appointment. If it returns 409, apologise once and start again from step 3.
6. Confirm: "Aapka appointment {{date}} {{time}} par {{doctor}} ke saath book ho gaya hai.
   WhatsApp par confirmation bhej rahi hoon."

Never:
- Give medical advice, a diagnosis, or a dosage. If asked, offer an appointment.
- Invent a slot. Only offer times returned by check_slots.
- Share another patient's information.
- Continue after an emergency phrase. Say 108, then hand off.
```

---

## 8. How to test

**Tools, without making a call.** Start the backend, then:

```bash
curl "http://localhost:8787/api/slots?doctorId=doc-sharma&date=2026-10-20"
curl -X POST http://localhost:8787/api/appointments \
  -H 'Content-Type: application/json' \
  -d '{"patientName":"Test","phone":"+91 90000 00000","doctorId":"doc-sharma","startsAt":"2026-10-20T09:00:00.000Z","reason":"Check-up"}'
# run the same POST again: it must return 409
```

**The webhook, without making a call:**

```bash
curl -X POST http://localhost:8787/api/calls/webhook \
  -H 'Content-Type: application/json' \
  -d '{"callerName":"Curl Test","phone":"+91 90000 00001","outcome":"booked","durationSec":60,
       "summary":"Booked via curl.","transcript":[{"speaker":"ai","text":"Namaste!","startSec":0}]}'
```

Then refresh the dashboard's Calls page. The call must be there.

**A real call.** Point the agent at a public HTTPS URL (ngrok while developing, because Bolna cannot
reach localhost), then work through this script:

1. "Namaste, mujhe kal appointment chahiye" -> the agent asks which doctor.
2. Name a doctor -> it offers real times.
3. Pick a time -> it repeats the name back and books.
4. Check the dashboard: the appointment is on the calendar, the call is in the log, the transcript
   is in the drawer and the player follows the audio.
5. Check the Sheet: one new row in `Appointments`.
6. Check WhatsApp: the confirmation arrived.
7. Say "mere papa ko chest pain ho raha hai" -> the agent says 108 and hands off, and does not book.

---

## 9. Checklist before the demo

- [ ] `check_slots` never returns a slot that is already booked
- [ ] `book_appointment` returns `409` on a double booking and the agent recovers gracefully
- [ ] The webhook fires once per call, with `startSec` on every transcript line
- [ ] `resolved` is `false` for handoffs and dropped calls, so the review queue is not empty
- [ ] `outcome` is one of the seven allowed values
- [ ] Emergencies go to 108 and never to a booking
- [ ] Recording consent is announced on every call
- [ ] Names are repeated back and confirmed before booking
- [ ] Hinglish callers are not forced into pure Hindi or pure English
- [ ] A dropped call still produces a webhook
