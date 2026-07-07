-- ============================================================
-- TRACQUE — Deal Finder automation (recurring scans + lead pipeline)
-- ============================================================
-- Automates the top of funnel: scheduled scans → new-lead detection →
-- auto skip-trace + drafted outreach → digest. The close stays human;
-- these tables track the pipeline the operator works by hand.

-- Recurring scan schedules -----------------------------------
create table scan_schedules (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  name          text not null,
  city          text not null,
  state         text not null,
  strategy      text not null
                  check (strategy in ('seller_finance', 'subject_to', 'rent_instead_of_sell')),
  quick_lists   text[] default '{}',
  max_price     numeric,
  min_beds      int,
  cadence       text not null default 'daily' check (cadence in ('daily', 'weekly')),
  enabled       boolean not null default true,
  created_at    timestamptz default now(),
  last_run_at   timestamptz,
  next_run_at   timestamptz default now(),
  runs          int default 0
);

create index scan_schedules_due on scan_schedules(enabled, next_run_at);

-- Leads (deduped funnel entries with pipeline status) --------
create table leads (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null,
  schedule_id       uuid references scan_schedules(id) on delete set null,
  property_id       uuid references properties(id) on delete set null,
  external_id       text not null,
  address           text,
  city              text,
  state             text,
  neighborhood      text,
  strategy          text not null,
  fit_score         numeric,
  list_price        numeric,
  equity_pct        numeric,
  has_open_mortgage boolean,
  owner_name        text,
  owner_phone       text,
  owner_email       text,
  status            text not null default 'new'
                      check (status in ('new', 'contacted', 'replied', 'negotiating', 'won', 'dead')),
  outreach_subject  text,
  outreach_body     text,
  first_seen_at     timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (user_id, external_id)
);

create index leads_user_status on leads(user_id, status, fit_score desc);
create index leads_schedule on leads(schedule_id);

-- Lead activity log ------------------------------------------
create table lead_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete cascade,
  type        text not null,     -- 'created' | 'status_change' | 'skip_traced' | 'outreach_sent' | 'note'
  note        text,
  created_at  timestamptz default now()
);

create index lead_events_lead on lead_events(lead_id, created_at desc);

-- ============================================================
-- Scheduling (production): run the scheduled-scan function on a cadence.
-- Requires the pg_cron + pg_net extensions and the service-role key in
-- Vault. Uncomment and set the values in your Supabase project:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.schedule('tracque-scheduled-scans', '0 * * * *', $$
--     select net.http_post(
--       url     := 'https://<project-ref>.supabase.co/functions/v1/run-scheduled-scans',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--       ),
--       body    := '{}'::jsonb
--     );
--   $$);
--
-- Alternatively, drive it from the existing QStash setup (queue-dispatcher)
-- with a scheduled publish to the same function URL.
-- ============================================================
