# Reference backend

A zero-dependency Node server that implements the whole API contract in
[../docs/API-CONTRACT.md](../docs/API-CONTRACT.md). It exists so the dashboard and the Bolna voice
agent have something real to talk to on day 1, before Google Sheets is wired up.

```bash
node server/index.mjs                 # http://localhost:8787
PORT=9000 node server/index.mjs
npm run test:api                      # 34 assertions over the contract
```

Then point the dashboard at it:

```bash
# .env.local in the frontend root
VITE_API_BASE_URL=http://localhost:8787
npm run dev
```

## What is in here

| File | What it is |
| --- | --- |
| `index.mjs` | The routes. Every endpoint in the contract, with the double-booking guard |
| `data.mjs` | Seed data, shaped like the Google Sheet tabs |
| `test.mjs` | The contract test. Run it before and after you change anything |

## Storage is in memory

Restarting resets everything. Every place that must become a Sheets read or write is marked:

```bash
grep -rn "TODO(sheets)" server/index.mjs
```

Those markers are the work list. See [../docs/BACKEND.md](../docs/BACKEND.md) for the Sheets schema,
the caching advice and the concurrency caveat.

## Useful endpoints to poke at

```bash
curl http://localhost:8787/health
curl "http://localhost:8787/api/slots?doctorId=doc-sharma&date=2026-10-20"
curl http://localhost:8787/api/calls | head -c 400

# book a slot, then try the same one again and watch the 409
curl -X POST http://localhost:8787/api/appointments -H 'Content-Type: application/json' \
  -d '{"patientName":"Test","phone":"+91 90000 00000","doctorId":"doc-sharma","startsAt":"2026-10-20T09:00:00.000Z","reason":"Check-up"}'
```

## Enabling CORS for the dashboard

Already handled. `Access-Control-Allow-Origin` is `*` unless `CORS_ORIGINS` is set:

```bash
CORS_ORIGINS=https://app.clinicvaani.in,http://localhost:5173 node server/index.mjs
```
