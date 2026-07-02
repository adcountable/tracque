// Tracque — Daily digest
// POST /functions/v1/daily-digest   (body: { user_id, since_hours? })
//
// Summarizes NEW leads added since the window (default 24h) for a user:
// counts + top candidates by fit. Returns JSON; wire an email provider
// (Resend/Postmark) to deliver it. Pair with a daily pg_cron trigger.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { user_id, since_hours = 24 } = await req.json()
  if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400 })

  const since = new Date(Date.now() - since_hours * 3600 * 1000).toISOString()
  const { data: fresh } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', user_id)
    .gte('first_seen_at', since)
    .order('fit_score', { ascending: false })

  const leads = fresh ?? []
  const digest = {
    window_hours: since_hours,
    new_count: leads.length,
    high_fit_count: leads.filter((l: any) => (l.fit_score ?? 0) >= 75).length,
    free_clear_count: leads.filter((l: any) => !l.has_open_mortgage).length,
    top: leads.slice(0, 10).map((l: any) => ({
      address: l.address, city: l.city, fit_score: l.fit_score,
      list_price: l.list_price, equity_pct: l.equity_pct, strategy: l.strategy,
    })),
  }

  // TODO: deliver via email provider, e.g.:
  //   await fetch('https://api.resend.com/emails', { headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}` }, ... })

  return new Response(JSON.stringify(digest),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
