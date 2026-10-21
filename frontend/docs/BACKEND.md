# Backend guide

You are building the one service that both the voice agent and the dashboard call. It owns the
data, it is the only writer, and it is the only thing that talks to Google Sheets and WhatsApp.

Everything you must expose is in [API-CONTRACT.md](API-CONTRACT.md). This document is about how to
build it.

---

## 1. Quick start

The backend ships in `server/`. It has no dependencies, implements the whole contract, and stores
data in Google Sheets when `SHEET_ID` and a service account are set (a JSON file otherwise). The step
by step to production is [GO-LIVE.md](GO-LIVE.md).

```bash
node server/index.mjs            # http://localhost:8787
curl http://localhost:8787/health

npm test                         # 111 checks, including the Sheets store
```

Then point the dashboard at it:

```bash
# .env.local in the frontend
VITE_API_BASE_URL=http://localhost:8787
npm run dev
```

Storage is `server/store/sheets.mjs` (Google Sheets), `file.mjs` (a JSON file) or `memory.mjs`
(tests). Routes only touch the in-memory copy in `state.mjs`; the store persists it.

---

## 2. The rules that actually matter

**One writer.** The dashboard never touches Sheets. The agent never touches Sheets. Only this
service does. The moment the dashboard writes a row directly, the two views disagree and nobody
trusts the product.

**The double-booking guard must be atomic.** This is the single most important behaviour in the
system. A patient and the front desk can try to take the same slot at the same moment.

```
check the slot and write the row as one operation
```

If you read, then check, then write as three steps, two requests can both pass the check. In the
server the check and write happen in memory in one synchronous step, and Sheets is written after. Against Sheets alone, it is not
safe by default:

- Sheets has no transactions, and two concurrent writers can both append a row.
- Options, in increasing order of effort: keep an in-process lock around appointment writes; use a
  `LockService` in Apps Script; or move appointments to a real database (SQLite, Postgres, or a
  hosted option like Supabase) and keep Sheets as a mirror for the humans who like spreadsheets.
- For a 15 day hackathon with one clinic, an in-process lock is enough. Write it down as a known
  limitation rather than pretending it is solved.

**Dates go out as ISO 8601.** Sheets will happily reformat a date cell, so store appointment times
as text, or normalise on read. The dashboard renders `Invalid Date` otherwise.

**Units differ.** `Appointment.durationMin` is minutes. `Call.durationSec` is seconds.
`Doctor.slotDurationMin` is minutes. This has already caused one bug.

**Empty is `200 []`, not `404`.** `404` means "that specific record does not exist" and the
dashboard shows an error state.

**Errors are for humans.** The dashboard puts `error` straight into a toast that a clinic owner
reads. `{ "error": "That slot is already taken. Please pick another time." }`, not
`{ "error": "E11000 duplicate key" }`.

---

## 3. Google Sheets

### Create the file

One spreadsheet, five tabs, headers in row 1 exactly as below. The backend reads them by header name,
so the order does not matter but the spelling does.

| Tab | Headers |
| --- | --- |
| `Appointments` | `id` `patient` `phone` `doctor` `start time` `status` `booked by` `whatsapp sent` |
| `Calls` | `id` `phone` `time` `duration` `language` `outcome` `summary` `transcript` `follow-up flag` |
| `Doctors` | `name` `speciality` `fee` `weekly availability` `slot length` |
| `FAQs` | `question` `answer` |
| `Clinic` | `name` `address` `greeting` `escalation phone number` |

The column to JSON mapping, including the traps, is in
[API-CONTRACT.md](API-CONTRACT.md#google-sheets-mapping).

### Access

Use a service account, share the sheet with its email, and keep the credentials in an environment
variable, never in the repo:

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=...        # or a whole JSON blob in GOOGLE_CREDENTIALS
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
SHEET_ID=1AbC...
```

Simplest library path is `googleapis` with `spreadsheets.values.get` and `.append` / `.update`. A
read of one tab is one HTTP call, so read a tab once per request rather than once per row.

### Caching

`GET /api/slots` runs while the patient is on the line. Do not read the Sheet on every call to it.

- Cache the doctors and the day's appointments for 10 to 30 seconds, or for the duration of a call.
- Invalidate the cache on any write.
- The dashboard is fine with slightly stale reads; the agent is not fine with a slow one.

### Transcripts are big

Sheets caps a cell at about 50,000 characters. A 3 minute call is usually fine, but a long one is
not. Either keep the last N turns in the cell, or store the full transcript elsewhere and put a link
in the cell. The dashboard only needs enough to be useful.

---

## 4. WhatsApp and SMS

The contract just says `whatsappSent` on the appointment. Sending it is your job.

**Provider.** WhatsApp Business Cloud API for the real thing, Twilio for speed, or Gupshup / Interakt
for an India-first option. All three have the same shape: a template, an approved sender, and a
message id back.

**The confirmation message.** WhatsApp requires a pre-approved template for business-initiated
messages. Something like:

```
Namaste {{1}}! Aapka appointment {{2}} par {{3}} ke saath confirm ho gaya hai.
Address: {{4}}. Reschedule karne ke liye is number par call karein.
```

Keep it to one template so approval is quick.

**SMS fallback.** Approval takes time and can be refused. Build the SMS path at the same time, behind
the same function, and switch on a failure or a config flag:

```js
async function sendConfirmation(appointment) {
  try {
    await sendWhatsApp(appointment);
    return true;
  } catch (err) {
    console.warn("WhatsApp failed, falling back to SMS", err);
    await sendSms(appointment);
    return true;
  }
}
```

**Do not let a messaging failure fail the booking.** The appointment is real even if the message
does not go out. Set `whatsappSent` to what actually happened, and let the dashboard show it.

---

## 5. Hosting

Bolna cannot reach `localhost`, so the API needs a public HTTPS URL.

| Stage | What to do |
| --- | --- |
| Development | `ngrok http 8787` and give Bolna the ngrok URL. Note that it changes on every restart, so update the agent's tool URLs each time |
| Demo | Render or Railway free tier. Both give HTTPS and a stable URL |
| Production | The same, or any Node host. Add a real database and the CORS allowlist |

The full list of environment variables is in `server/.env.example`. The basics:

```bash
PORT=8787
CORS_ORIGINS=*                       # comma separated in production
# CORS_ORIGINS=https://app.dhwani.in,http://localhost:5173
```

Also needed once Sheets and messaging are wired: the `GOOGLE_*` and `SHEET_ID` variables above, plus
the WhatsApp provider's token and sender id.

Health check: `GET /health` returns `{ "ok": true }`. Point the host's uptime check at it, and keep
it fast, because the platform restarts the service if it is slow.

---

## 6. CORS

The dashboard is served from a different origin than the API in every environment, including local
development (`5173` calling `8787`). Without CORS headers the dashboard shows "Could not reach the
server" and the console shows a CORS error.

```
Access-Control-Allow-Origin: <dashboard origin, or * in development>
Access-Control-Allow-Methods: GET,POST,PATCH,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type,Authorization
```

Answer `OPTIONS` with `204` and no body. `server/index.mjs` already does this; copy the approach.

---

## 7. Order to build in

1. Stand up the API with the in-memory store. That unblocks the frontend and the agent on day 1.
2. Replace the store with Sheets, one tab at a time. `Doctors`, `Clinic` and `FAQs` first, because
   they are read-only from the agent's point of view and nothing can break.
3. `GET /api/slots` and `POST /api/appointments`, with the double-booking guard. Test the `409` case
   before you move on.
4. `POST /api/calls/webhook`. Once this works the dashboard fills itself.
5. WhatsApp, then SMS as the fallback.
6. The dashboard write endpoints: `PUT /api/clinic`, the doctor routes, knowledge.

---

## 8. Go live checklist

- [ ] `npm run test:api` passes against your implementation, not just the reference one
- [ ] Two `POST /api/appointments` for the same slot: the first is `201`, the second is `409`
- [ ] `GET /api/slots` answers in under 300 ms with a warm cache
- [ ] Every timestamp that leaves the API is ISO 8601
- [ ] `durationSec` is seconds, `durationMin` is minutes
- [ ] `POST /api/calls/webhook` is idempotent enough that a retry does not duplicate the call
- [ ] A webhook with a malformed transcript still saves the call
- [ ] The API answers `OPTIONS` and the dashboard can call it from its own origin
- [ ] `GET /health` responds quickly
- [ ] Credentials are in environment variables, never in the repo
- [ ] A WhatsApp failure does not fail the booking, and `whatsappSent` tells the truth
