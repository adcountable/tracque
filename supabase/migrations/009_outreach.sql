-- ============================================================
-- TRACQUE — Automated outreach (send + compliance)
-- ============================================================
-- Sending is only safe with the rails in the schema: per-user CAN-SPAM
-- settings, a suppression list, sent-tracking, and an audit log.

-- Per-user outreach settings (from identity + legal footer) -----
create table outreach_settings (
  user_id           text primary key,
  from_name         text,
  from_email        text,             -- must be a verified sender at the provider
  reply_to          text,
  physical_address  text,             -- CAN-SPAM: real postal address, required
  signature         text,
  daily_cap         int not null default 25,
  auto_send         boolean not null default false,   -- let schedules auto-send
  dry_run           boolean not null default true,    -- default OFF for real sends
  updated_at        timestamptz default now()
);

-- Suppression list (opt-outs / do-not-contact) ------------------
create table outreach_suppressions (
  user_id     text not null,
  email       text not null,
  reason      text,                   -- 'unsubscribe' | 'bounce' | 'manual' | 'complaint'
  created_at  timestamptz default now(),
  primary key (user_id, email)
);

-- Send log (audit trail of every attempt) -----------------------
create table outreach_sends (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,
  lead_id             uuid references leads(id) on delete set null,
  property_id         uuid references properties(id) on delete set null,
  channel             text not null default 'agent_email',
  to_email            text,
  status              text not null,  -- 'sent' | 'skipped' | 'error' | 'dry_run'
  detail              text,           -- skip reason / provider id / error
  provider_message_id text,
  created_at          timestamptz default now()
);

create index outreach_sends_user on outreach_sends(user_id, created_at desc);

-- Sent-tracking on leads ----------------------------------------
alter table leads add column if not exists sent_at   timestamptz;
alter table leads add column if not exists sent_channel text;

-- Let a schedule auto-send owner outreach on its new leads -------
alter table scan_schedules add column if not exists auto_send boolean not null default false;
