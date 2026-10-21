# API contract

Everything the dashboard and the voice agent need from the backend. `src/lib/api.ts` is the
machine-readable version of this document: each function names its endpoint, and setting
`VITE_API_BASE_URL` makes the dashboard call it for real.

`server/index.mjs` implements all of it, so you can run the contract today and swap the storage
underneath later.

---

## Conventions

| Thing | Rule |
| --- | --- |
| Base URL | `http://localhost:8787` in development. HTTPS in production. |
| Content type | `application/json` both ways. |
| Dates | ISO 8601 with an offset or `Z`, e.g. `2026-10-20T09:30:00.000Z`. `GET /api/slots` also accepts `date=YYYY-MM-DD`. |
| Times of day | `"HH:mm"`, 24 hour, clinic local time, only for `GET /api/slots`. |
| Auth | None today. Every request may carry `Authorization: Bearer <token>`; the dashboard sends it when `VITE_API_KEY` is set. |
| Errors | Any non-2xx must return `{ "error": "human readable message" }`. The dashboard shows that string in a toast, so write it for a clinic owner, not a developer. |
| Empty results | `200` with `[]`, never `404`. |
| Ids | Strings. Prefixed and readable is nice: `apt-8fa21c`, `call-004`, `doc-sharma`. |
| CORS | Required, see [CORS](#cors). |

### Error codes used

| Status | When | Example body |
| --- | --- | --- |
| `400` | The body is not valid JSON, or a required query parameter is missing | `{ "error": "doctorId is required" }` |
| `404` | The record does not exist | `{ "error": "Appointment apt-123 not found" }` |
| `409` | **The slot is already taken.** The dashboard and the agent both show this text. | `{ "error": "That slot is already taken. Please pick another time." }` |
| `422` | The body parsed but fields are missing or invalid | `{ "error": "patientName, phone, doctorId and startsAt are required" }` |
| `500` | Unexpected failure | `{ "error": "Internal server error" }` |

---

## Slots

### `GET /api/slots?doctorId=<id>&date=<YYYY-MM-DD>`

Called by **Bolna**, mid-call. Returns the free times for one doctor on one day.

```json
{
  "doctorId": "doc-sharma",
  "date": "2026-10-19",
  "slots": ["09:00", "09:15", "09:45", "17:00", "17:30"]
}
```

- Honour the doctor's weekly availability and `slotDurationMin`.
- Exclude slots already booked by a live appointment (any status except `cancelled`).
- If the doctor has no hours that day, return `{ "slots": [] }`, not a 404.

### `GET /api/slots?doctorId=<id>&startsAt=<ISO>`

Called by the **dashboard**, to check one exact slot before writing. `ignoreId` is optional and
excludes an appointment from the check, which is what makes rescheduling onto your own slot work.

```json
{ "available": true }
```

---

## Appointments

### `GET /api/appointments?from=<ISO>&to=<ISO>&status=<status>`

Called by the **dashboard**. All filters are optional. Returns `Appointment[]` sorted soonest first.

```json
[
  {
    "id": "apt-001",
    "patientName": "Rahul Mehta",
    "phone": "+91 98110 22334",
    "doctorId": "doc-sharma",
    "startsAt": "2026-10-20T09:30:00.000Z",
    "durationMin": 15,
    "reason": "Fever and cold",
    "status": "confirmed",
    "bookedBy": "ai",
    "whatsappSent": true
  }
]
```

`status` is one of `confirmed`, `rescheduled`, `cancelled`, `completed`. `bookedBy` is `ai` or
`staff`.

### `GET /api/appointments/:id`

Called by the **dashboard**. Returns one `Appointment`, or `404`.

### `POST /api/appointments`

Called by **Bolna** (when the patient agrees to a slot) and by the **dashboard** (front desk
booking). This is the endpoint that must never double-book.

Request:

```json
{
  "patientName": "Rahul Mehta",
  "phone": "+91 98110 22334",
  "doctorId": "doc-sharma",
  "startsAt": "2026-10-20T09:30:00.000Z",
  "reason": "Fever and cold",
  "bookedBy": "ai"
}
```

- Required: `patientName`, `phone`, `doctorId`, `startsAt`. Missing any of them is `422`.
- `durationMin` is optional and defaults to the doctor's `slotDurationMin`.
- **Re-check the slot inside the same operation as the write.** If it is taken, return `409` and
  change nothing. Read-then-write as two steps will double-book under load.
- Respond `201` with the created `Appointment`.
- Send the WhatsApp confirmation here, or queue it. Set `whatsappSent` to what actually happened.

### `PATCH /api/appointments/:id`

Called by **Bolna** and the **dashboard**. One endpoint covers reschedule, cancel and complete.

| Body | Effect |
| --- | --- |
| `{ "startsAt": "<ISO>" }` | Move it. Sets `status` to `rescheduled` if no status is given. Re-check the slot, `409` if taken. |
| `{ "status": "cancelled" }` | Cancel it, and set `whatsappSent` to `false`. |
| `{ "status": "completed" }` | Mark the visit done. |
| any other field | Merged onto the record. |

Returns the updated `Appointment`.

> The voice agent usually sends only the new time when a patient reschedules, so a `startsAt` change
> must imply `rescheduled`. Do not require the agent to send `status`.

---

## Calls

### `GET /api/calls?search=&outcome=&language=&from=&to=&needsReview=`

Called by the **dashboard**. Returns `Call[]`, newest first.

- `search` matches caller name, phone, summary or intent, case-insensitively.
- `outcome` is one of `booked`, `faq`, `human`, `dropped`, `missed`, `rescheduled`, `cancelled`.
- `language` is `Hindi`, `English` or `Hinglish`.
- `needsReview=true` returns only calls where `resolved` is false. This backs the review queue.

### `GET /api/calls/:id`

Called by the **dashboard**, for the transcript drawer. Returns one `Call`, or `404`.

A full `Call`:

```json
{
  "id": "call-004",
  "callerName": "Priya Nair",
  "phone": "+91 98110 22334",
  "startedAt": "2026-10-17T11:15:00.000Z",
  "durationSec": 128,
  "language": "Hinglish",
  "outcome": "booked",
  "sentiment": "positive",
  "summary": "Booked an appointment for Priya; WhatsApp confirmation sent.",
  "transcript": [
    { "speaker": "ai", "text": "Namaste! Sharma Family Clinic mein aapka swagat hai.", "ts": "2026-10-17T11:15:02.000Z", "startSec": 0 },
    { "speaker": "patient", "text": "Mujhe kal doctor ko dikhana hai.", "ts": "2026-10-17T11:15:09.000Z", "startSec": 7 }
  ],
  "extracted": { "name": "Priya Nair", "reason": "Fever and cold", "slot": "Tomorrow, 12:00 PM" },
  "needsFollowUp": false,
  "recordingUrl": "/recordings/call-004.mp3",
  "intent": "New appointment",
  "resolved": true,
  "confidence": 0.93,
  "tags": ["hinglish", "booking"],
  "aiActions": ["Checked the doctor's calendar", "Held the slot", "Sent the WhatsApp confirmation"]
}
```

| Field | Required? | If missing |
| --- | --- | --- |
| `id`, `callerName`, `phone`, `startedAt`, `durationSec`, `outcome`, `summary`, `transcript` | Yes | The row looks broken |
| `language`, `sentiment` | Preferred | Badges fall back to a neutral style |
| `transcript[].startSec` | Yes for the player | The transcript cannot follow the audio |
| `recordingUrl` | Preferred | The player is a silent simulation |
| `intent` | Preferred | Shows as blank in the table and in accuracy by intent |
| `resolved` | Yes for the review queue | Everything is treated as resolved, so the queue is empty |
| `confidence` | Preferred | Shows as `0%` |
| `tags`, `aiActions`, `extracted` | Optional | Sections are hidden or empty |

### `PATCH /api/calls/:id`

Called by the **dashboard** when staff action a call.

- `{ "needsFollowUp": false }` clears the follow-up flag.
- `{ "resolved": true }` takes the call out of the review queue and should also clear
  `needsFollowUp`.

### `POST /api/calls/webhook`: the important one

Called by **Bolna**, once, after every call ends. This is what fills the Calls table, so the
dashboard, the review queue and the agent metrics all depend on it. Full payload and the fields the
agent must send are in [VOICE-AGENT.md](VOICE-AGENT.md#3-post-call-webhook).

The server normalises whatever it gets:

- `transcript[].speaker` accepts `ai` / `agent` for the agent and anything else for the caller.
- Missing `id` gets generated, missing `startSec` is filled from the line order.
- Unknown `outcome` is stored as-is, and shows up with a neutral badge.

Respond `201` with the saved `Call`. Be forgiving: a malformed transcript must not lose the call.

---

## Clinic, FAQs and knowledge

### `GET /api/clinic`

Called by the **dashboard** (header, settings, agent identity) and by **Bolna** (greeting,
escalation number).

```json
{
  "name": "Sharma Family Clinic",
  "address": "C-14, Green Park Extension, New Delhi 110016",
  "phone": "+91 98110 22334",
  "languages": ["Hindi", "English", "Hinglish"],
  "greeting": "Namaste! Sharma Family Clinic mein aapka swagat hai...",
  "faqs": [{ "id": "faq-1", "question": "What are the clinic timings?", "answer": "Monday to Saturday, 9:00 AM to 8:00 PM.", "hits": 41 }],
  "escalation": { "phone": "+91 98110 22334", "triggers": ["emergency keywords", "patient asks for a human", "ai not confident"] },
  "agent": {
    "name": "Dhwani",
    "voice": "Meera (warm, Indian English + Hindi)",
    "speed": 1,
    "greeting": "Namaste! Sharma Family Clinic mein aapka swagat hai...",
    "fallback": "Sorry, main yeh samajh nahi payi...",
    "guardrails": ["Never gives medical advice or a diagnosis"],
    "recordingConsent": true
  }
}
```

`agent` is used by the Agent page. If you do not want to store it, the dashboard still works, but
the Agent page will show an empty identity panel.

### `PUT /api/clinic`

Called by the **dashboard**. Body is a partial `Clinic`, merged onto the record. Returns the full
clinic. Write the `Clinic` tab and the `FAQs` tab here.

### `GET /api/faqs`

Called by **Bolna** as a tool. Returns just `faqs`, so the agent can quote an answer without
pulling the whole clinic. Keep it small and fast.

### `GET /api/knowledge`, `POST /api/knowledge`, `PATCH /api/knowledge/:id`, `DELETE /api/knowledge/:id`

Called by the **dashboard**, on the Agent page. The knowledge base is the agent's second brain:
insurance, fasting rules, holidays, anything that is not a one-line FAQ. `DELETE` returns `204`.

> The agent should read the same content. Simplest approach: the agent's FAQ tool returns
> `faqs` **plus** `knowledge`, concatenated.

---

## Doctors

| Endpoint | Called by | Notes |
| --- | --- | --- |
| `GET /api/doctors` | Dashboard, Bolna | Returns `Doctor[]` |
| `POST /api/doctors` | Dashboard | `name` required, `422` without it. Returns `201` |
| `PATCH /api/doctors/:id` | Dashboard | Partial merge |
| `DELETE /api/doctors/:id` | Dashboard | Returns `204`, `404` if unknown |

```json
{
  "id": "doc-sharma",
  "name": "Dr. Anil Sharma",
  "speciality": "General Physician",
  "fee": 500,
  "slotDurationMin": 15,
  "availability": [
    { "day": 1, "start": "09:00", "end": "13:00" },
    { "day": 1, "start": "17:00", "end": "20:00" }
  ]
}
```

`day` follows JavaScript `Date.getDay()`: `0` is Sunday, `1` is Monday. A doctor can have several
blocks on the same day, which is how morning and evening hours are expressed.

---

## Dashboard aggregates

These exist so the Overview page does not have to fetch every call and add them up in the browser.
They can all be computed from the raw tables.

### `GET /api/dashboard/stats`

```json
{
  "callsToday": 6,
  "appointmentsBooked": 4,
  "missedRecovered": 2,
  "avgDurationSec": 118,
  "revenueRecovered": 23440,
  "bookedWhileClosed": 9,
  "trends": { "callsToday": 12, "appointmentsBooked": 8, "missedRecovered": 25, "avgDurationSec": -4, "revenueRecovered": 17 }
}
```

`trends` are percentages versus the previous period. `revenueRecovered` is an estimate: booked calls
times an average consultation fee, plus anything from outbound. Say so in the UI, which we do.

### `GET /api/dashboard/calls-per-day?days=7`

```json
[
  { "date": "2026-10-11T00:00:00.000Z", "label": "Sun", "answered": 3, "neededHuman": 0 }
]
```

`label` is a short day name, already formatted for the chart axis.

### `GET /api/dashboard/call-outcomes`

```json
[{ "key": "booked", "label": "Booked", "value": 9 }]
```

---

## Agent

| Endpoint | Called by | Notes |
| --- | --- | --- |
| `GET /api/agent/metrics` | Dashboard | See below |
| `POST /api/agent/test` | Dashboard | `{ utterance }` in, a simulated reply and a verdict out |
| `POST /api/agent/simulate` | Dashboard | `{ message }` in, `{ reply }` out. Backs the "Try the agent" dock |

`GET /api/agent/metrics`:

```json
{
  "resolutionRate": 0.8,
  "containmentRate": 0.88,
  "avgHandleSec": 118,
  "humanHandoffs": 3,
  "needsReview": 7,
  "reviewQueue": ["call-004", "call-009"],
  "accuracyTrend": [{ "label": "Mon", "value": 0.86 }],
  "intents": [{ "intent": "New appointment", "total": 9, "resolved": 9, "accuracy": 1 }]
}
```

`resolutionRate` is the share of calls the agent finished without a human. `containmentRate` is the
share with no handoff at all. Both are 0 to 1.

---

## Outbound, usage, onboarding

| Endpoint | Called by | Notes |
| --- | --- | --- |
| `GET /api/campaigns` | Dashboard | `Campaign[]` |
| `POST /api/campaigns` | Dashboard | `name` required, `422` without it |
| `PATCH /api/campaigns/:id` | Dashboard | `{ "status": "active" \| "paused" }` |
| `GET /api/usage` | Dashboard | Minutes used, plan, renewal date |
| `GET /api/onboarding` | Dashboard | The go-live checklist |
| `PATCH /api/onboarding/:id` | Dashboard | `{ "done": true }` |

A `Campaign` has `type` (`reminder`, `waitlist`, `recall`, `feedback`), `status` (`active`,
`scheduled`, `paused`, `completed`), `channel` (`voice`, `whatsapp`), and the funnel counts
`audience`, `contacted`, `connected`, `converted`. The Outbound page renders them as a funnel and
computes the conversion rate, so keep `audience >= contacted >= connected >= converted`.

---

## Google Sheets mapping

The backend owns Sheets. The dashboard only ever sees JSON, so this table is the backend's business,
but the naming gap is the most likely source of bugs, so here it is explicitly.

| Sheet tab | Column | JSON field | Notes |
| --- | --- | --- | --- |
| `Appointments` | `id` | `id` | |
| | `patient` | `patientName` | |
| | `phone` | `phone` | Store as a string. Leading `+` and spaces are fine. |
| | `doctor` | `doctorId` | Store the doctor id, not the display name, or matching breaks when a name changes |
| | `start time` | `startsAt` | Write ISO 8601. Sheets will reformat a date cell, so store it as text or convert on read |
| | `status` | `status` | `confirmed`, `rescheduled`, `cancelled`, `completed` |
| | `booked by` | `bookedBy` | `ai` or `staff` |
| | `whatsapp sent` | `whatsappSent` | Boolean |
| `Calls` | `id` | `id` | |
| | `phone` | `phone` | |
| | `time` | `startedAt` | ISO 8601 |
| | `duration` | `durationSec` | **Seconds, not minutes** |
| | `language` | `language` | `Hindi`, `English`, `Hinglish` |
| | `outcome` | `outcome` | One of the seven outcomes |
| | `summary` | `summary` | One or two sentences |
| | `transcript` | `transcript` | JSON string, see below |
| | `follow-up flag` | `needsFollowUp` | Boolean |
| `Doctors` | `name` | `name` | |
| | `speciality` | `speciality` | |
| | `fee` | `fee` | Number, rupees |
| | `weekly availability` | `availability` | JSON string: `[{"day":1,"start":"09:00","end":"13:00"}]` |
| | `slot length` | `slotDurationMin` | **Minutes** |
| `FAQs` | `question` | `faqs[].question` | |
| | `answer` | `faqs[].answer` | |
| `Clinic` | `name` | `name` | |
| | `address` | `address` | |
| | `greeting` | `greeting` | |
| | `escalation phone number` | `escalation.phone` | |

Two traps worth repeating:

1. **Sheets turns anything that looks like a date into a Date.** Read it back and normalise to ISO
   before returning JSON, or the dashboard will show `Invalid Date`.
2. **`duration` is seconds and `slot length` is minutes.** Different units in the same project.

The transcript column holds a JSON string:

```json
[{"speaker":"ai","text":"Namaste!","startSec":0},{"speaker":"patient","text":"Appointment chahiye","startSec":7}]
```

If a transcript is long, Sheets cells cap out around 50,000 characters. Either truncate to the last
N turns or store the full transcript in a separate store and keep a link in the cell.

---

## CORS

The dashboard runs on a different origin from the API in every environment, so the API must answer
preflight requests.

```
Access-Control-Allow-Origin: <the dashboard origin, or * in development>
Access-Control-Allow-Methods: GET,POST,PATCH,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type,Authorization
```

Answer `OPTIONS` with `204` and no body. Without this, the dashboard shows "Could not reach the
server" and the browser console shows a CORS error. `server/index.mjs` does this already.

---

## Connecting the dashboard

```bash
# .env.local in the frontend
VITE_API_BASE_URL=http://localhost:8787
```

That is the whole switch. With it unset the dashboard runs on mock data from `src/lib/api.mock.ts`.
With it set, every function in `src/lib/api.ts` goes over the network.

React Query keys, if you are debugging cache behaviour: `["clinic"]`, `["calls", filters]`,
`["call", id]`, `["appointments"]`, `["doctors"]`, `["live-calls"]`, `["agent-metrics"]`,
`["knowledge"]`, `["campaigns"]`, `["usage"]`, `["onboarding"]`, `["dashboard-stats"]`,
`["calls-per-day"]`, `["call-outcomes"]`.
