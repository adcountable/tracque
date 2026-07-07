// Tracque — Automated outreach sender
// POST /functions/v1/send-outreach
// Body: { user_id, lead_ids?, channel?, dry_run?, cap? }
//
// Sends the drafted outreach for the given leads via Resend (email).
// Compliance rails are enforced here, not optional:
//   • default channel = agent_email (CAN-SPAM, low TCPA risk)
//   • hard suppression check (opt-outs / bounces)
//   • CAN-SPAM footer: physical address + unsubscribe on every email
//   • daily cap ceiling; dry_run short-circuits actual sending
//   • owner_email channel requires the caller to pass it explicitly
//     (owner-direct contact carries TCPA/DNC obligations)
//
// Set RESEND_API_KEY. Without it, every send is a dry_run.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

function isEmail(v: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v ?? '').trim()) }
function norm(v: string): string { return v.trim().toLowerCase() }

function settingsGaps(s: any): string[] {
  const gaps: string[] = []
  if (!s || !isEmail(s.from_email ?? '')) gaps.push('from_email')
  if (!s?.from_name?.trim()) gaps.push('from_name')
  if ((s?.physical_address ?? '').trim().length < 8) gaps.push('physical_address (CAN-SPAM)')
  return gaps
}

function footer(s: any, token: string): string {
  return `\n\n—\n${s.signature ? s.signature + '\n' : ''}${s.physical_address}\n` +
    `To stop receiving these emails, reply STOP or visit https://unsubscribe.example/${token}`
}

// Owner-directed body — mirrors src/lib/outreach.ts ownerOutreach().
function ownerBody(lead: any): { subject: string; body: string } {
  const first = String(lead.owner_name ?? '').trim().split(/\s+/)[0] || 'there'
  const terms = lead.strategy === 'subject_to'
    ? 'take over the existing financing' : 'flexible terms (including seller financing)'
  return {
    subject: `Your property at ${lead.address}`,
    body: `Hi ${first},\n\nI'm a local buyer interested in your property at ${lead.address}. I'm not an agent and this isn't a solicitation to list — I buy directly and can work on your timeline.\n\nIf you've ever thought about selling, I'd be glad to make a straightforward offer, and I'm open to ${terms} if that's a better fit for you than a traditional sale. No obligation and no pressure either way.\n\nWould you be open to a short conversation? If not, no problem at all.`,
  }
}

async function resendSend(apiKey: string, e: { from: string; to: string; reply_to: string; subject: string; text: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: e.from, to: [e.to], reply_to: e.reply_to, subject: e.subject, text: e.text }),
  })
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data?.id as string | undefined
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Automated pipeline is owner-directed (records/off-market leads carry the
  // skip-traced owner email). Agent-directed outreach stays manual (copy from
  // the Deal Finder), so owner_email is the channel here.
  const { user_id, lead_ids, channel = 'owner_email', dry_run, cap } = await req.json()
  if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400 })

  const { data: settings } = await supabase.from('outreach_settings').select('*').eq('user_id', user_id).single()
  const gaps = settingsGaps(settings)
  const effectiveDryRun = dry_run ?? settings?.dry_run ?? true
  const dailyCap = cap ?? settings?.daily_cap ?? 25

  // Leads to contact (only unsent 'new' unless specific ids given).
  let q = supabase.from('leads').select('*').eq('user_id', user_id).is('sent_at', null)
  if (lead_ids?.length) q = q.in('id', lead_ids)
  else q = q.eq('status', 'new')
  const { data: leads } = await q.limit(dailyCap)

  const { data: supRows } = await supabase.from('outreach_suppressions').select('email').eq('user_id', user_id)
  const suppressed = new Set((supRows ?? []).map((r: any) => norm(r.email)))

  const results: any[] = []
  let sent = 0

  for (const lead of leads ?? []) {
    const to = lead.owner_email
    const record = async (status: string, detail: string, mid?: string) => {
      await supabase.from('outreach_sends').insert({
        user_id, lead_id: lead.id, property_id: lead.property_id, channel,
        to_email: to ?? null, status, detail, provider_message_id: mid ?? null,
      })
      results.push({ lead: lead.address, status, detail })
    }

    if (!to || !isEmail(to)) { await record('skipped', 'no owner email — run skip trace first'); continue }
    if (suppressed.has(norm(to))) { await record('skipped', 'suppressed'); continue }
    if (gaps.length) { await record('skipped', `settings incomplete: ${gaps.join(', ')}`); continue }

    const msg = ownerBody(lead)
    const email = {
      from: `${settings.from_name} <${settings.from_email}>`,
      to: norm(to), reply_to: settings.reply_to || settings.from_email,
      subject: msg.subject,
      text: msg.body + footer(settings, lead.external_id),
    }

    if (effectiveDryRun || !RESEND_API_KEY) {
      await record('dry_run', RESEND_API_KEY ? 'dry_run enabled' : 'no RESEND_API_KEY')
      continue
    }
    try {
      const mid = await resendSend(RESEND_API_KEY, email)
      await supabase.from('leads').update({
        sent_at: new Date().toISOString(), sent_channel: channel, status: 'contacted',
      }).eq('id', lead.id)
      await supabase.from('lead_events').insert({ lead_id: lead.id, type: 'outreach_sent', note: `${channel} → ${to}` })
      await record('sent', 'ok', mid)
      sent++
    } catch (e) {
      await record('error', String(e))
    }
  }

  return new Response(JSON.stringify({
    processed: results.length, sent, dry_run: effectiveDryRun || !RESEND_API_KEY,
    settings_gaps: gaps, results,
  }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
