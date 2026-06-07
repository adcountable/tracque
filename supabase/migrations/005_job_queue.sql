-- ============================================================
-- TRACQUE — Job Queue for Mass Querying
-- ============================================================

-- Scan jobs — one per scan request
create table if not exists scan_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  status        text default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  runs_per_kw   int default 3,
  total_tasks   int default 0,
  done_tasks    int default 0,
  failed_tasks  int default 0,
  created_at    timestamptz default now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  error         text
);

-- Scan tasks — one per keyword × model × brand combo
create table if not exists scan_tasks (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references scan_jobs(id) on delete cascade,
  keyword_id  uuid references keywords(id) on delete cascade,
  brand_id    uuid references brands(id) on delete cascade,
  model       text not null,
  status      text default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  attempts    int default 0,
  result_id   uuid references scan_results(id),
  error       text,
  created_at  timestamptz default now(),
  started_at  timestamptz,
  completed_at timestamptz
);

create index if not exists scan_tasks_job on scan_tasks(job_id, status);
create index if not exists scan_tasks_pending on scan_tasks(status, created_at) where status = 'pending';

-- RLS
alter table scan_jobs enable row level security;
alter table scan_tasks enable row level security;

create policy "scan_jobs_owner" on scan_jobs for all using (user_id = auth.uid()::text);
create policy "scan_tasks_owner" on scan_tasks for all using (
  exists (select 1 from scan_jobs j where j.id = job_id and j.user_id = auth.uid()::text)
);

-- Function to create a full scan job (splits into tasks)
create or replace function create_scan_job(
  p_user_id    text,
  p_runs       int default 3,
  p_brand_ids  uuid[] default null,
  p_kw_ids     uuid[] default null
) returns uuid as $$
declare
  v_job_id    uuid;
  v_brand     record;
  v_kw        record;
  v_model     text;
  v_models    text[] := array['chatgpt','perplexity','gemini','claude','grok'];
  v_count     int := 0;
begin
  -- Create job
  insert into scan_jobs(user_id, runs_per_kw)
  values (p_user_id, p_runs)
  returning id into v_job_id;

  -- Create one task per keyword × brand × model
  for v_kw in (
    select id from keywords
    where user_id = p_user_id
    and (p_kw_ids is null or id = any(p_kw_ids))
  ) loop
    for v_brand in (
      select id from brands
      where user_id = p_user_id
      and (p_brand_ids is null or id = any(p_brand_ids))
    ) loop
      foreach v_model in array v_models loop
        insert into scan_tasks(job_id, keyword_id, brand_id, model)
        values (v_job_id, v_kw.id, v_brand.id, v_model);
        v_count := v_count + 1;
      end loop;
    end loop;
  end loop;

  -- Update total task count
  update scan_jobs set total_tasks = v_count where id = v_job_id;

  return v_job_id;
end;
$$ language plpgsql security definer;
