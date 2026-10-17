# ClinicVaani

An AI phone receptionist for small clinics. A patient calls, the AI answers in **Hindi, English or
Hinglish**, books the appointment, and sends a WhatsApp confirmation. The clinic sees every call,
booking and transcript on a dashboard.

This repo is the **frontend dashboard** plus a **working reference backend**. The voice agent is
built in Bolna. Everything is wired so the three pieces can be developed in parallel and joined with
one environment variable.

> **A note on the name.** The plan and this repo are called **ClinicVaani**. The UI currently ships
> with the working brand **AawazDoc**, which is what the mock data and the landing page say. See
> [Renaming the product](#renaming-the-product) if you want one name everywhere.

---

## Quick start

```bash
npm install
npm run dev          # dashboard on http://localhost:5173, on mock data
```

To run against a real API instead:

```bash
# terminal 1
npm run dev:api      # reference backend on http://localhost:8787

# terminal 2
cp .env.example .env.local      # sets VITE_API_BASE_URL=http://localhost:8787
npm run dev
```

That is the whole switch. With `VITE_API_BASE_URL` unset the dashboard reads mock data. With it set,
every function in `src/lib/api.ts` goes over the network. No component changes either way.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dashboard dev server |
| `npm run dev:api` | Reference backend on port 8787 |
| `npm run test:api` | 39 assertions over the API contract |
| `npm run build` | Type-check and build the dashboard |
| `npm run build:preview` | One standalone HTML file, for sharing a demo |
| `npm run typecheck` | `tsc --noEmit` |

---

## Architecture

```
 Patient (phone)
      |  dials
      v
 Telephony (Exotel / Twilio number)
      |  audio
      v
 Bolna voice agent  -------------------+
   listens, thinks, speaks             |  tool calls, mid-call
   Hindi / English / Hinglish          |  "free slots?"  "book this"
      |                                |
      |  post-call webhook             v
      +------------------>  BACKEND API  <---------  Dashboard (this repo)
                             slots, bookings,          Clinic staff, browser
                             call logs
                                  |
                     +------------+------------+
                     v            v            v
               Google Sheets  WhatsApp/SMS  (same API)
```

The backend is the only part that touches data, so the voice agent and the dashboard always agree.
The full diagram, the step by step of one booking call, the data model, the build order and the
15 day plan are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Documentation

Read these in order. Each one is written for a different person on the team.

| Document | For | What is in it |
| --- | --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Everyone | The diagram, the call sequence, the Sheet tabs, the build order, the plan and the risks |
| [docs/API-CONTRACT.md](docs/API-CONTRACT.md) | Backend, frontend | Every endpoint, request and response bodies, error codes, the Sheets column mapping |
| [docs/VOICE-AGENT.md](docs/VOICE-AGENT.md) | Voice AI | The Bolna tool definitions, the prompt skeleton, the post-call webhook, the latency budget, the edge cases |
| [docs/BACKEND.md](docs/BACKEND.md) | Backend | How to build it: Sheets, the double-booking guard, WhatsApp with an SMS fallback, hosting, CORS |
| [server/README.md](server/README.md) | Backend | The reference server, and how to point the dashboard at it |

---

## Routes

| Route | Screen |
| --- | --- |
| `/` | Landing page: hero, product preview, stats, how it works, features, the agent, outbound, safety, pricing, FAQ, footer |
| `/app` | Overview: recovered revenue, live calls, KPIs, charts, review queue, today, recent calls, go-live checklist |
| `/app/calls` | Call log with saved views, filters, keyboard nav (J/K, Enter), and a drawer whose transcript follows the audio |
| `/app/appointments` | Week calendar or agenda list, with reschedule, cancel, complete and manual booking |
| `/app/agent` | Agent quality: accuracy by intent, review queue, voice and guardrails, test console, knowledge base |
| `/app/outbound` | Campaigns: reminders, waitlist backfill, recalls and feedback, with funnels |
| `/app/settings` | Clinic, doctors, FAQs, escalation, plan and usage |

Global: a command palette (**Cmd or Ctrl + K**), an AI live/paused switch, and a light/dark toggle.
There is no authentication yet.

The five pages in the original plan (Landing, Overview, Calls, Appointments, Settings) are all here.
**Agent** and **Outbound** are additions: the first is the loop that makes the AI measurably better,
the second is where the money is, because no-shows cost a clinic more than missed calls.

---

## Who calls what

| Endpoint | Called by | Purpose |
| --- | --- | --- |
| `GET /api/slots?doctorId&date` | Bolna, mid-call | Free times for a day |
| `GET /api/slots?doctorId&startsAt` | Dashboard | Is this exact slot free? |
| `POST /api/appointments` | Bolna, dashboard | Book it, reject double bookings |
| `PATCH /api/appointments/:id` | Bolna, dashboard | Reschedule, cancel, complete |
| `GET /api/faqs`, `GET /api/clinic` | Bolna, mid-call | Answer questions from clinic data |
| `POST /api/calls/webhook` | Bolna, after the call | Save the transcript and summary |
| `GET /api/calls`, `GET /api/appointments` | Dashboard | Tables and charts |
| `PUT /api/clinic`, `/api/doctors`, `/api/knowledge` | Dashboard | Edit what the AI knows |

Bodies, status codes and the full list are in [docs/API-CONTRACT.md](docs/API-CONTRACT.md).

---

## How the swap works

`src/lib/api.ts` is the only file that touches data. Every function is async, returns a typed
promise, and names its endpoint.

```
src/lib/config.ts     reads VITE_API_BASE_URL; empty means "use mocks"
src/lib/http.ts       the fetch wrapper: base URL, auth header, error handling
src/lib/api.ts        THE CONTRACT. Dispatches to live or mock
src/lib/api.mock.ts   the demo implementation, and src/lib/mockData.ts behind it
```

Delete `api.mock.ts` and `mockData.ts` once the real backend is stable. Nothing else references them.

---

## Mock data

Generated in `src/lib/mockData.ts` from a fixed seed, with every date relative to today so it never
looks stale: Sharma Family Clinic in Delhi, three doctors, 25 calls across 7 days with real
transcripts in Hindi (Devanagari), English and Hinglish, 20 appointments this week, 3 live calls,
agent metrics derived from the call list, 5 outbound campaigns, a usage meter and a go-live
checklist.

The reference backend seeds the same shape from `server/data.mjs`, so the two feel identical.

---

## Design

Deliberately not a stock component-library starter.

- **Palette:** warm bone paper `#F4F1EA`, deep ink panels, an acid lime signal `#CDF564`, with coral,
  violet and teal for state. Full light and dark themes.
- **Type:** Instrument Serif for display headlines and hero numbers, Inter Tight for UI, JetBrains
  Mono for labels, timestamps and metrics. Figures are tabular everywhere.
- **Surfaces:** hairline borders, small radii, almost no shadow. Depth comes from the ink panels
  rather than from elevation.
- **The signature interaction:** the call drawer's player. The waveform is scrubbable, the transcript
  highlights line by line as it plays, and clicking a line seeks the audio. That is the interaction
  that sells a voice product, and it is why the webhook must send `startSec` on every line.

---

## Project structure

```
src/                    the dashboard
  components/
    ui/                 primitives: button, card, badge, dialog, sheet, tabs, toggles, atoms
    app/                Sidebar, StatusStrip, CommandPalette, TryAgentDock
    voice/              player (usePlayback + Waveform) and LiveCallCard
    landing/            PhoneCallCard, DemoNumberCard, Footer, visuals
    agent/ appointments/ settings/
  lib/
    api.ts              THE CONTRACT
    api.mock.ts         demo implementation
    http.ts config.ts   fetch wrapper and env
    mockData.ts         fixtures
    nav.ts outcome.ts datetime.ts slots.ts hooks.ts utils.ts
  pages/
    Landing.tsx
    app/                DashboardLayout, Overview, Calls, Appointments, Agent, Outbound, Settings
  types.ts              every domain type
  index.css             design tokens
server/                 reference backend, zero dependencies
docs/                   architecture, API contract, voice agent, backend
scripts/                the single-file preview build
```

---

## Renaming the product

If the team wants **ClinicVaani** everywhere instead of **AawazDoc**, these are the places:

- `src/components/Logo.tsx` splits the wordmark into two spans, so it is one edit.
- `index.html` and `preview.html` titles and meta description.
- `src/pages/Landing.tsx` and `src/components/landing/Footer.tsx` copy.
- `src/lib/mockData.ts` and `server/data.mjs` set `clinic.agent.name`, which is the name the AI
  introduces itself with. Change it in both or the demo will disagree with itself.
- `src/components/app/TryAgentDock.tsx` and `src/components/CallDrawer.tsx` labels.

---

## Not included

- No authentication.
- No real telephony, WhatsApp sending or audio files. The "Call the live agent" button, the recording
  player and the billing screen are labelled placeholders.
- The reference backend stores everything in memory. See
  [docs/BACKEND.md](docs/BACKEND.md) for the Google Sheets path and the concurrency caveat.
- AawazDoc never gives medical advice. Emergencies are directed to emergency services or a human.
