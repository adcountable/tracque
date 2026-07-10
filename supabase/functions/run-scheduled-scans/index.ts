// Tracque — Scheduled scan runner (cron target)
// POST /functions/v1/run-scheduled-scans   (body: {} or { schedule_id })
//
// For each due, enabled schedule: run scan-properties, filter by the
// schedule's Quick Lists, detect NEW leads (not already in the funnel),
// auto skip-trace + keep the drafted outreach, insert into `leads`, and
// advance next_run_at. Invoked hourly by pg_cron (see 008_automation.sql).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Quick List matchers — mirror src/lib/propertyEngine.ts QUICK_LISTS.
const QUICK_MATCH: Record<string, (p: any) => boolean> = {
  preforeclosure: p => (p.distress_flags ?? []).includes('preforeclosure'),
  high_equity: p => p.equity_pct >= 0.5,
  free_clear: p => !p.has_open_mortgage,
  absentee: p => !p.owner_occupied,
  out_of_state: p => p.owner_out_of_state,
  tax_lien: p => (p.distress_flags ?? []).includes('tax_lien'),
  vacant: p => p.is_vacant,
  tired_landlord: p => !p.owner_occupied && p.ownership_years >= 10 && p.equity_pct >= 0.5,
  price_reduced: p => p.price_cut_count > 0,
  low_rate: p => p.mortgage_rate_est != null && p.mortgage_rate_est < 4,
}

function passesQuickLists(p: any, keys: string[]): boolean {
  if (!keys?.length) return true
  return keys.some(k => QUICK_MATCH[k]?.(p))
}

// Deterministic skip trace — mirror propertyEngine.skipTrace.
function skipTrace(externalId: string, ownerName: string) {
  let h = 0
  for (const ch of externalId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const line = 1000 + (h % 9000)
  const prefix = 200 + (h % 800)
  const handle = (ownerName || 'owner').toLowerCase().replace(/[^a-z]/g, '.')
  return { phone: `(615) ${prefix}-${line}`, email: `${handle}@example.com` }
}

function nextRun(cadence: string, from: Date): string {
  const d = new Date(from)
  d.setDate(d.getDate() + (cadence === 'weekly' ? 7 : 1))
  return d.toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const nowIso = new Date().toISOString()

  let q = supabase.from('scan_schedules').select('*').eq('enabled', true)
  if (body.schedule_id) q = q.eq('id', body.schedule_id)
  else q = q.lte('next_run_at', nowIso)
  const { data: schedules } = await q
  if (!schedules?.length) {
    return new Response(JSON.stringify({ ran: 0, message: 'no due schedules' }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }

  const summary: any[] = []

  for (const s of schedules) {
    // Reuse the scan engine (mock or RentCast) via the sibling function.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/scan-properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        user_id: s.user_id, market: `${s.city}, ${s.state}`, strategy: s.strategy,
        params: { max_price: s.max_price ?? 5_000_000, min_beds: s.min_beds ?? 0, buyer_name: 'You' },
      }),
    })
    const scan = await res.json().catch(() => ({ results: [] }))
    const results: any[] = (scan.results ?? []).filter((p: any) => passesQuickLists(p, s.quick_lists ?? []))

    // Which are already in the funnel?
    const { data: existing } = await supabase.from('leads').select('external_id').eq('user_id', s.user_id)
    const seen = new Set((existing ?? []).map((l: any) => l.external_id))
    const fresh = results.filter(p => !seen.has(p.external_id))

    // Batch: one insert for all fresh leads, one for their created-events.
    let added = 0
    if (fresh.length) {
      const { data: inserted } = await supabase.from('leads').insert(fresh.map(p => {
        const trace = skipTrace(p.external_id, p.owner_name)
        return {
          user_id: s.user_id, schedule_id: s.id, external_id: p.external_id,
          address: p.address, city: p.city, state: p.state, neighborhood: p.neighborhood,
          strategy: s.strategy, fit_score: p.fit_score, list_price: p.list_price,
          equity_pct: p.equity_pct, has_open_mortgage: p.has_open_mortgage,
          owner_name: p.owner_name, owner_phone: trace.phone, owner_email: trace.email,
          status: 'new', outreach_subject: p.outreach?.subject, outreach_body: p.outreach?.body,
        }
      })).select('id')
      added = inserted?.length ?? 0
      if (inserted?.length) {
        await supabase.from('lead_events').insert(inserted.map((l: any) => ({
          lead_id: l.id, type: 'created', note: `via schedule ${s.name}`,
        })))
      }
    }

    const now = new Date()
    await supabase.from('scan_schedules').update({
      last_run_at: now.toISOString(), next_run_at: nextRun(s.cadence, now), runs: (s.runs ?? 0) + 1,
    }).eq('id', s.id)

    // Optional auto-send: hand fresh leads to send-outreach (owner-directed,
    // compliance-gated there). Fire-and-forget so a send failure can't fail
    // the scan; send-outreach honors dry_run + suppression + settings gaps.
    let auto_sent = 0
    if (s.auto_send && added > 0) {
      try {
        const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-outreach`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ user_id: s.user_id }),
        })
        const sj = await sendRes.json().catch(() => ({}))
        auto_sent = sj?.sent ?? 0
      } catch (e) {
        console.error('auto-send failed:', e)
      }
    }

    summary.push({ schedule: s.name, scanned: results.length, new_leads: added, auto_sent })
  }

  return new Response(JSON.stringify({ ran: schedules.length, summary }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
