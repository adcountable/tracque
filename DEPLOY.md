# Deal Finder — 15-minute deployment runbook

Copy-paste path from zero to real Nashville data. Prereqs: a
[supabase.com](https://supabase.com) account (free tier is fine), Node or
Bun locally, and a [rentcast.io](https://rentcast.io) API key (free tier).

## 1. Supabase project (~3 min)

Create a project at supabase.com → note the **project ref** (in the URL)
and, from Project Settings → API: the **URL**, **anon key**, and
**service_role key**.

```bash
npm i -g supabase          # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

## 2. Database (~1 min)

```bash
supabase db push           # applies migrations 001–008
```

## 3. Edge functions + secrets (~3 min)

```bash
supabase functions deploy scan-properties
supabase functions deploy run-scheduled-scans
supabase functions deploy daily-digest

# Real listings + AVM + rent:
supabase secrets set RENTCAST_API_KEY=<your_rentcast_key>

# Optional — lien ground truth (free & clear / pre-foreclosure / tax liens):
# supabase secrets set RECORDS_PROVIDER=attom ATTOM_API_KEY=<key>
# or: supabase secrets set RECORDS_PROVIDER=batchdata BATCHDATA_API_KEY=<key>

# Optional — protect free tiers (default 10 enriched listings per scan):
# supabase secrets set ENRICH_LIMIT=10
```

## 4. Smoke test (~1 min)

```bash
./scripts/smoke-test.sh https://<YOUR_PROJECT_REF>.supabase.co <SERVICE_ROLE_KEY>
```

Expected: JSON with `"source": "rentcast"` (or `"mock"` if no key) and a
ranked `results` array. If `source` is `mock` with a key set, check the
secret name and redeploy the function.

## 5. Frontend (~4 min)

```bash
cp .env.example .env       # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
bun install && bun dev     # local

# Production (Vercel):
npm i -g vercel && vercel
# set the two VITE_ vars in Vercel → Project → Settings → Environment Variables
```

Open the app → **Deal Finder** → Scan market. With the key set, results
are live Nashville listings.

## 6. Automation (~3 min, optional)

In the Supabase SQL editor, enable extensions and schedule the runner
(full snippet at the bottom of `supabase/migrations/008_automation.sql`):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- then the cron.schedule(...) block from 008_automation.sql,
-- with your project ref + service key stored in Vault
```

Create a schedule in the **Pipeline** page; the hourly cron picks up due
schedules, ingests new leads, and `daily-digest` summarizes the last 24h
(wire Resend/Postmark in `daily-digest/index.ts` to get it as email).

## Cost at MVP scale

| Item | Cost |
|---|---|
| Supabase free tier | $0 |
| Vercel hobby | $0 |
| RentCast free tier | $0 (~50 calls/mo — one scan a day with ENRICH_LIMIT=10 will exceed this; the $74/mo tier removes the ceiling) |
| ATTOM / BatchData (liens) | paid, optional — the one real cost for free-and-clear truth |

## Troubleshooting

- **`source: "mock"` with a key set** → secret name typo or function not
  redeployed after setting secrets.
- **RentCast 401/429** → bad key / free-tier quota exhausted; scan falls
  back to mock automatically.
- **County enrichment empty** → maps.nashville.gov occasionally rate-limits;
  the adapter degrades gracefully and the scan still completes.
