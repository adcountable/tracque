// Tracque — Real skip trace (owner phone/email for off-market leads)
// POST /functions/v1/skip-trace
// Body: { user_id, lead_ids?, limit? }
//
// County records give a mailing address but no phone/email. This function
// resolves real contact info via a skip-trace provider and writes it onto
// the leads, so send-outreach (email) can reach off-market owners.
//
//   SKIP_TRACE_PROVIDER = 'batchdata' -> BATCHDATA_API_KEY  (~$0.07–0.25/hit)
// Without a provider key this returns a clear error — the in-app "skip
// trace" stub is demo-only and must NOT be used for real outreach.
//
// Compliance: emails flow into CAN-SPAM-compliant send-outreach. Phone
// numbers are stored for YOUR manual calls — do not autodial/text (TCPA).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const PROVIDER = (Deno.env.get('SKIP_TRACE_PROVIDER') ?? '').toLowerCase()
const BATCHDATA_KEY = Deno.env.get('BATCHDATA_API_KEY')

async function traceBatchData(lead: any): Promise<{ phone: string | null; email: string | null }> {
  const res = await fetch('https://api.batchdata.com/api/v1/property/skip-trace', {
    method: 'POST',
    headers: { Authorization: `Bearer ${BATCHDATA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        propertyAddress: { street: lead.address, city: lead.city, state: lead.state },
        name: { full: lead.owner_name },
      }],
    }),
  })
  if (!res.ok) throw new Error(`batchdata ${res.status}`)
  const data = await res.json()
  const person = data?.results?.persons?.[0] ?? data?.results?.[0] ?? null
  const phone = person?.phoneNumbers?.[0]?.number ?? person?.phones?.[0]?.number ?? null
  const email = person?.emails?.[0]?.email ?? person?.emails?.[0] ?? null
  return { phone: phone ? String(phone) : null, email: email ? String(email) : null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { user_id, lead_ids, limit = 25 } = await req.json()
  if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400 })

  if (!(PROVIDER === 'batchdata' && BATCHDATA_KEY)) {
    return new Response(JSON.stringify({
      error: 'No skip-trace provider configured. Set SKIP_TRACE_PROVIDER=batchdata and BATCHDATA_API_KEY. The in-app stub is demo-only.',
    }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }

  // Leads missing contact info (or the specific ids given).
  let q = supabase.from('leads').select('*').eq('user_id', user_id).is('owner_email', null)
  if (lead_ids?.length) q = q.in('external_id', lead_ids)
  const { data: leads } = await q.limit(limit)

  const results: any[] = []
  let traced = 0
  for (const lead of leads ?? []) {
    try {
      const { phone, email } = await traceBatchData(lead)
      if (phone || email) {
        await supabase.from('leads').update({
          owner_phone: phone, owner_email: email, updated_at: new Date().toISOString(),
        }).eq('id', lead.id)
        await supabase.from('lead_events').insert({ lead_id: lead.id, type: 'skip_traced', note: `${email ?? 'no email'} · ${phone ?? 'no phone'}` })
        traced++
        results.push({ lead: lead.address, status: 'traced', email: !!email, phone: !!phone })
      } else {
        results.push({ lead: lead.address, status: 'no_match' })
      }
    } catch (e) {
      results.push({ lead: lead.address, status: 'error', detail: String(e) })
    }
  }

  return new Response(JSON.stringify({ processed: results.length, traced, results }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
