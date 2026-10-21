# The API

The one service the phone agent and the dashboard both call. Zero dependencies, Node 20+.

```bash
cp server/.env.example server/.env   # every key is optional; see docs/GO-LIVE.md
node server/index.mjs                # http://localhost:8787
npm test                             # 111 checks
```

On start it prints what is connected:

```
  storage    sheets: Connected to Google Sheets
  phone      Bolna, agent 3c1f…
  public url https://dhwani-api.onrender.com
  messages   Twilio WhatsApp, Twilio SMS
  chat agent Gemini gemini-3.5-flash-lite
  login      required
```

## Modules

| File | What it does |
| --- | --- |
| `index.mjs` | HTTP server and every route, with access control per route |
| `config.mjs`, `env.mjs` | Reads `server/.env` and the environment |
| `state.mjs` | The in-memory working copy every route reads and writes |
| `domain.mjs` | Booking rules: slots, the overlap-aware double-booking guard, reschedule, cancel |
| `time.mjs` | Clinic time (IST) regardless of the server's zone; parses "kal", "shaam 5 baje", "22 Oct" |
| `store/sheets.mjs` | Google Sheets as the system of record: creates tabs, upserts rows, re-reads edits |
| `store/file.mjs`, `store/memory.mjs` | JSON file storage without Sheets; in-memory for tests |
| `store/schema.mjs` | Sheet columns to JSON, including human-readable doctor hours |
| `agent/tools.mjs` | The receptionist's tools, shared by the phone agent and the chat agent |
| `agent/prompt.mjs` | The system prompt, built from the clinic's live data |
| `agent/brain.mjs`, `agent/gemini.mjs` | The Gemini chat agent behind the dashboard dock and test console |
| `bolna/*.mjs` | The Bolna agent definition, API client and sync |
| `calls.mjs` | Turns Bolna's webhook into call logs (idempotent), and the live-calls feed |
| `messaging.mjs` | WhatsApp (Meta or Twilio) with SMS fallback |
| `analytics.mjs` | Every dashboard number, computed from the tables |
| `reminders.mjs` | Daily reminders for tomorrow's appointments |
| `auth.mjs` | Dashboard login tokens, and Bolna's shared secret |

## Endpoints beyond docs/API-CONTRACT.md

| Endpoint | Who | What |
| --- | --- | --- |
| `GET/POST /api/bolna/tools/:name` | Bolna, mid-call | `check_slots`, `book_appointment`, `find_appointments`, `reschedule_appointment`, `cancel_appointment`, `get_clinic_info`. Bearer `BOLNA_SECRET` |
| `POST /api/bolna/webhook?token=` | Bolna, every status change | Live calls while ringing and talking, then one call log per execution |
| `POST /api/auth/login`, `GET /api/auth/status` | Dashboard | Password login when `ADMIN_PASSWORD` is set |
| `GET /api/public/config` | Landing page | The real number to dial |
| `GET /api/integrations` | Dashboard | What is connected |
| `POST /api/integrations/bolna/sync`, `/link-number` | Dashboard | Create or update the phone agent; link the clinic number |
| `POST /api/agent/call` | Dashboard | "Call me": the phone agent rings a number |
| `GET /api/calls/:id/recording` | Dashboard | The call recording, proxied with Bolna's auth |
| `POST /api/reminders/run` | Dashboard | Send tomorrow's reminders now |
