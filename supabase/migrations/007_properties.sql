-- ============================================================
-- TRACQUE — Deal Finder (creative-finance property engine)
-- ============================================================
-- Generalized so RV parks / seller-finance / subject-to layer on
-- without a rewrite:
--   asset_type: sfh | rv_park | mh_park | land | multifamily
--   strategy:   seller_finance | subject_to | rent_instead_of_sell
-- Phase 1 populates sfh + seller_finance/subject_to for Nashville.

-- Properties (listing + public-records snapshot) -------------
create table properties (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   text not null,
  external_id               text not null,          -- source listing/parcel id
  source                    text not null default 'mock'
                              check (source in ('mock', 'rentcast', 'county', 'mls')),
  asset_type                text not null default 'sfh'
                              check (asset_type in ('sfh', 'rv_park', 'mh_park', 'land', 'multifamily')),

  -- location
  address                   text not null,
  neighborhood              text,
  city                      text,
  state                     text,
  zip                       text,

  -- physical
  beds                      numeric,
  baths                     numeric,
  sqft                      int,
  year_built                int,

  -- listing
  list_price                numeric,
  list_date                 date,
  days_on_market            int,
  status                    text,                   -- active | price_reduced | back_on_market ...
  price_cut_count           int default 0,
  total_price_cut_pct       numeric default 0,
  avm_value                 numeric,                -- estimated market value
  rent_estimate             numeric,                -- estimated monthly rent

  -- ownership / public records (the distress + carry signals)
  last_sale_price           numeric,
  last_sale_year            int,
  ownership_years           numeric,
  has_open_mortgage         boolean,                -- false => free & clear
  mortgage_origination_year int,
  mortgage_rate_est         numeric,                -- annual %, subto attractiveness
  est_mortgage_balance      numeric,
  equity                    numeric,                -- avm − balance (avm if free & clear)
  equity_pct                numeric,                -- 0–1
  owner_occupied            boolean,
  owner_out_of_state        boolean,
  owner_type                text,                   -- owner_occupied | absentee_in_state | absentee_out_of_state
  is_vacant                 boolean default false,
  distress_flags            text[] default '{}',    -- preforeclosure | tax_lien | probate | code_violation | vacant

  -- owner contact (populated by skip trace; carries TCPA/DNC obligations)
  owner_name                text,
  owner_phone               text,
  owner_email               text,

  -- listing contact (outreach targets the agent, not the owner)
  agent_name                text,
  agent_brokerage           text,
  agent_email               text,
  agent_phone               text,
  listing_url               text,

  raw                       jsonb,                  -- full source payload for auditing
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),
  unique (user_id, source, external_id)
);

create index properties_user_city on properties(user_id, city);
create index properties_asset_type on properties(asset_type);

-- Scan runs -------------------------------------------------
create table property_scans (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null,
  market            text not null,                  -- e.g. 'Nashville, TN'
  asset_type        text not null default 'sfh',
  strategy          text not null
                      check (strategy in ('seller_finance', 'subject_to', 'rent_instead_of_sell')),
  params            jsonb,                          -- max_price, min_beds, monthly_budget, ...
  status            text not null default 'pending'
                      check (status in ('pending', 'running', 'complete', 'error')),
  properties_found  int default 0,
  error             text,
  created_at        timestamptz default now(),
  completed_at      timestamptz
);

create index property_scans_user on property_scans(user_id, created_at desc);

-- Scores (one property can be scored under multiple strategies)
create table property_scores (
  id                uuid primary key default gen_random_uuid(),
  scan_id           uuid references property_scans(id) on delete cascade,
  property_id       uuid references properties(id) on delete cascade,
  strategy          text not null,
  fit_score         numeric not null,               -- 0–100
  motivation_score  numeric,                        -- 0–100
  signals           jsonb,                          -- [{key,label,weight,present,detail}]
  reasons           text[],                         -- human "why"
  deal_math         jsonb,                          -- down, financed, rate, monthly, vs_rent
  created_at        timestamptz default now()
);

create index property_scores_scan_rank on property_scores(scan_id, fit_score desc);
create index property_scores_property on property_scores(property_id);

-- Outreach drafts -------------------------------------------
create table property_outreach (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  property_id   uuid references properties(id) on delete cascade,
  strategy      text not null,
  channel       text not null default 'agent_email'
                  check (channel in ('agent_email', 'agent_call_script', 'owner_mail')),
  subject       text,
  body          text,
  status        text not null default 'draft'
                  check (status in ('draft', 'sent', 'replied', 'dismissed')),
  created_at    timestamptz default now()
);

create index property_outreach_user on property_outreach(user_id, status);
