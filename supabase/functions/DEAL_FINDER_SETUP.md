# Deal Finder — going live with real data

The Deal Finder runs on synthetic data with zero config. To pull **real
listings + Nashville public records**, set these in your own deployment
(this managed sandbox blocks outbound calls to these hosts, so live data
only flows in your Supabase project).

## Secrets (Supabase → Project Settings → Edge Functions → Secrets)

| Secret | Purpose | Where |
|---|---|---|
| `RENTCAST_API_KEY` | Listings, AVM value, long-term rent, price history | rentcast.io (free tier ~50 calls/mo) |
| `RECORDS_PROVIDER` | `attom` or `batchdata` — turns on lien/free-and-clear/pre-foreclosure | optional |
| `ATTOM_API_KEY` / `BATCHDATA_API_KEY` | Key for the chosen records provider | attomdata.com / batchdata.com |
| `ENRICH_LIMIT` | How many listings to enrich per scan (default `10`) — protects free tiers | optional |
| `DAVIDSON_PARCELS_URL` | Override the Nashville parcel query endpoint | optional |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Set automatically by Supabase | — |

## Data sources by signal

- **Listings, DOM, price cuts, AVM, rent** → RentCast (`scan-properties`).
- **Owner name, out-of-state/absentee, assessed value, tenure** → Davidson
  County ArcGIS parcels, free, no key (`scan-properties/county.ts`).
- **Free & clear / mortgage liens / tax liens / pre-foreclosure** → set
  `RECORDS_PROVIDER=attom` (or `batchdata`) + the key. `scan-properties/
  records.ts` then populates `has_open_mortgage`, balance, origination
  vintage, tax liens, and pre-foreclosure, and recomputes equity. Without a
  provider these stay conservative (assumed financed) — the parcel layer has
  no lien data and the Register of Deeds has no clean free API.
- **Owner phone/email (skip trace)** → paid provider (BatchData, REISkip).
  The demo uses a deterministic stub.

## Deploy

```bash
supabase functions deploy scan-properties
supabase functions deploy run-scheduled-scans
supabase functions deploy daily-digest
supabase db push        # applies migrations 007 + 008
```

## Automation (recurring scans)

Enable `pg_cron` + `pg_net` and schedule `run-scheduled-scans` hourly — see
the commented snippet at the bottom of `migrations/008_automation.sql`.
`daily-digest` can be scheduled the same way (once daily) and wired to an
email provider (Resend/Postmark) for the morning lead email.

## Compliance reminders

- Outreach defaults to the **listing agent** (low TCPA risk). Owner-direct
  contact and skip-traced calling/texting carry TCPA/DNC obligations.
- Subject-to (due-on-sale) and seller financing (Dodd-Frank/SAFE Act) have
  real legal considerations — the tool surfaces opportunities; structure
  deals with a real estate attorney.
