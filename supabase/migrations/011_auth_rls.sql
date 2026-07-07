-- ============================================================
-- TRACQUE — Account gate (Row Level Security)
-- ============================================================
-- The UI login gate alone isn't security: the anon key ships in the JS
-- bundle, so without RLS anyone could query tables directly. This locks
-- every table: anon gets nothing; signed-in (authenticated) users get
-- full access (single-operator app). Edge functions use the service
-- role, which bypasses RLS — they keep working unchanged.
--
-- IMPORTANT: after creating YOUR account, turn OFF public signups:
-- Supabase dashboard → Authentication → Sign In / Up →
-- disable "Allow new users to sign up". Otherwise anyone who signs up
-- gets in (policies below trust any authenticated user).

do $$
declare t text;
begin
  foreach t in array array[
    'brands','keywords','brand_keywords','scan_results','seo_results',
    'properties','property_scans','property_scores','property_outreach',
    'scan_schedules','leads','lead_events',
    'outreach_settings','outreach_suppressions','outreach_sends'
  ] loop
    -- Some tables may not exist in older projects; skip quietly.
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists tracque_authenticated_all on public.%I', t);
      execute format(
        'create policy tracque_authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;
