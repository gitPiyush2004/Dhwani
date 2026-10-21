# Go live

From a fresh clone to a patient calling a real number, booking an appointment that lands in the Google
Sheet, and the call showing up on the dashboard. That is the plan's definition of done.

```
Patient ── phone ──► Bolna (Sarvam speech-to-text ─► Gemini ─► Sarvam voice)
                        │  mid-call tools: check_slots, book_appointment, …
                        │  after the call: webhook with transcript + recording
                        ▼
                     This API (server/) ──► Google Sheet (the system of record)
                        ▲                ──► WhatsApp / SMS confirmation
                        │
                     Dashboard (src/)
```

Every integration is optional and switches on when its keys are set. **Settings > Integrations** in the
dashboard shows what is live at any moment.

---

## 1. Run it locally

```bash
cd frontend
npm install
cp server/.env.example server/.env     # then fill it in, step by step below
cp .env.example .env.local             # VITE_API_BASE_URL=http://localhost:8787

npm run dev:api                        # terminal 1: the API
npm run dev                            # terminal 2: the dashboard on :5173
npm test                               # 111 checks: the API contract and the Sheets store
```

With no keys at all, the API stores data in `server/.data/db.json` and the dashboard works end to end.

## 2. Google Sheet (the data)

1. In Google Cloud, create a project, enable the **Google Sheets API**, and create a **service account**.
   Add a JSON key and download it.
2. Create an empty Google Sheet. Share it with the service account's `client_email` as **Editor**.
3. In `server/.env`:
   ```bash
   SHEET_ID=1AbC...            # from the sheet URL: /spreadsheets/d/<SHEET_ID>/edit
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}   # the whole file on one line
   ```
4. Restart the API. It creates the tabs (`Appointments`, `Calls`, `Doctors`, `FAQs`, `Clinic`, `Knowledge`,
   `Campaigns`, `Settings`), writes the headers, and seeds the clinic's starting configuration.

The clinic can edit the sheet directly: a doctor's hours (`Mon-Sat 09:00-13:00, 17:00-20:00`), a fee, an
FAQ. The API re-reads it every `SHEETS_REFRESH_SEC` (60 s) and the phone agent's prompt is updated.
Extra columns the clinic adds are preserved. Run **exactly one** API instance: the double-booking guard
lives in its memory.

## 3. A public HTTPS URL

Bolna calls the booking tools and the webhook over the internet, so the API needs a public URL.

- **While developing:** a tunnel. `brew install cloudflared` then `cloudflared tunnel --url http://localhost:8787`
  prints an `https://….trycloudflare.com` URL. It changes on every restart: update `PUBLIC_URL` and press
  **Push latest settings** in Settings > Integrations.
- **For the demo and real use:** deploy with `render.yaml` at the repo root (Render > New > Blueprint).
  The free plan sleeps after 15 minutes idle and takes ~50 s to wake, which a caller will hear as dead air.
  Use the Starter plan, or ping `/health` every 10 minutes.

Set `PUBLIC_URL` to that URL, and `CORS_ORIGINS` to the dashboard's URL.

## 4. The phone agent (Bolna, Sarvam, Gemini)

1. Get an API key at platform.bolna.ai > Developers. Put it in `BOLNA_API_KEY`.
   `BOLNA_SECRET` is any long random string (one is generated in `server/.env` for you).
2. Create the agent, from the dashboard (**Settings > Integrations > Create the agent**) or:
   ```bash
   npm run bolna:sync
   ```
   This builds the agent from the clinic's live data:
   - Sarvam `saaras:v4` speech-to-text and Sarvam `bulbul:v3` voice (`priya`), Hindi/Hinglish
   - Gemini (`gemini-2.5-flash` through Bolna's Google provider) as the brain
   - The system prompt: doctors, hours, fees, FAQs, knowledge base and guardrails
   - Six tools pointing at this API, plus a warm transfer to `clinic.escalation.phone`
   - The webhook, so every call lands in the Calls tab
   The agent id is saved in the sheet's `Settings` tab. Later edits to doctors, FAQs or the knowledge base
   are pushed to Bolna automatically.
3. **Hear it:** Settings > Integrations > *Call me*, or `npm run bolna:sync -- --call +9198XXXXXXXX`. Your phone
   rings and you talk to the agent. The call shows up live on the Overview and then in Calls.
4. **A number patients can dial:** buy one in Bolna (Indian numbers need KYC), or connect your own
   Twilio, Plivo or Exotel account in Bolna. Set `BOLNA_PHONE_NUMBER` and `BOLNA_TELEPHONY_PROVIDER`
   (`plivo` for Bolna's Indian numbers), then **Link** it in Settings > Integrations, or run
   `npm run bolna:sync -- --link`. The landing page then shows the real number.

Bolna bills calls, Sarvam and Gemini usage to the Bolna wallet unless you connect your own Sarvam and
Google keys in Bolna's dashboard.

## 5. WhatsApp confirmations (with SMS fallback)

Without this, bookings still work and each appointment honestly shows "not sent", and the agent does not
promise a message.

- **Fastest for a demo:** the Twilio WhatsApp sandbox. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`, and join the sandbox from your phone.
- **Real:** Meta WhatsApp Cloud API with an approved template whose body has 4 variables (name,
  date and time, doctor, address): `META_WA_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `META_WA_TEMPLATE`.
- **SMS fallback:** `TWILIO_SMS_FROM`.

With messaging on, activate **Appointment reminders** on the Outbound page and tomorrow's patients get a
reminder at `REMINDER_TIME` every day.

## 6. Gemini for the dashboard (optional)

`GEMINI_API_KEY` from aistudio.google.com powers the "Try the agent" chat and the Agent test console
with the same prompt and tools as the phone line (bookings there are dry runs), and writes each call's
summary, intent, language and sentiment. Without it, the chat is rule-based and call summaries come from
Bolna and from the booking records.

## 7. Before real patients call

- [ ] `ADMIN_PASSWORD` is set: the dashboard holds patient names and numbers
- [ ] `CORS_ORIGINS` is the dashboard's URL, not `*`
- [ ] Settings > Integrations is all green
- [ ] A test call books into the Sheet, and a second booking of the same slot is refused
- [ ] "Mere papa ko chest pain ho raha hai" gets 108 and a transfer, never a booking
- [ ] The doctors, fees, hours and FAQs in the Sheet are the clinic's real ones
