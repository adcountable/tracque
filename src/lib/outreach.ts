// ============================================================
// Tracque — Outreach compliance
// ============================================================
// Automated outreach only stays safe if the compliance rails are part of
// the code, not an afterthought. Defaults target the LISTING AGENT via
// email (CAN-SPAM, low TCPA risk). Owner-direct email/SMS is gated behind
// explicit opt-in because it carries TCPA/DNC obligations.
//
// Pure logic here; the send happens in supabase/functions/send-outreach.

export type OutreachChannel = 'agent_email' | 'owner_email'

export interface OutreachSettings {
  from_name: string
  from_email: string          // must be a verified sender at your provider
  reply_to: string
  // CAN-SPAM requires a real physical postal address in every commercial email.
  physical_address: string
  signature: string
  daily_cap: number           // safety ceiling on automated sends per run
  dry_run: boolean            // when true, never actually send
}

export const DEFAULT_SETTINGS: OutreachSettings = {
  from_name: '', from_email: '', reply_to: '', physical_address: '',
  signature: '', daily_cap: 25, dry_run: true,
}

// A settings object is "send-ready" only when the legally-required fields
// are present. Missing any → we refuse to send (and say why).
export function settingsGaps(s: OutreachSettings): string[] {
  const gaps: string[] = []
  if (!isEmail(s.from_email)) gaps.push('a verified From email')
  if (!s.from_name.trim()) gaps.push('a From name')
  if (s.physical_address.trim().length < 8) gaps.push('a physical mailing address (required by CAN-SPAM)')
  return gaps
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase()
}

export function isSuppressed(email: string | null | undefined, suppressed: string[]): boolean {
  if (!email) return false
  const set = new Set(suppressed.map(normalizeEmail))
  return set.has(normalizeEmail(email))
}

// CAN-SPAM footer: physical address + a working unsubscribe path. `token`
// lets a real unsubscribe endpoint identify the recipient.
export function canSpamFooter(s: OutreachSettings, token: string): string {
  const unsub = `To stop receiving these emails, reply STOP or visit: https://unsubscribe.example/${token}`
  return `\n\n—\n${s.signature ? s.signature + '\n' : ''}${s.physical_address}\n${unsub}`
}

// Owner-directed message for the automated pipeline (records / off-market
// leads have no listing agent). Neutral, non-pressuring, and honest — no
// claims about their situation we can't back up. This is what gets sent to
// a skip-traced owner email; the agent-directed draft stays for manual use.
export function ownerOutreach(lead: {
  address: string; owner_name?: string | null; strategy?: string
}): { subject: string; body: string } {
  const first = (lead.owner_name ?? '').trim().split(/\s+/)[0] || 'there'
  const terms = lead.strategy === 'subject_to'
    ? 'take over the existing financing' : 'flexible terms (including seller financing)'
  return {
    subject: `Your property at ${lead.address}`,
    body: `Hi ${first},

I'm a local buyer interested in your property at ${lead.address}. I'm not an agent and this isn't a solicitation to list — I buy directly and can work on your timeline.

If you've ever thought about selling, I'd be glad to make a straightforward offer, and I'm open to ${terms} if that's a better fit for you than a traditional sale. No obligation and no pressure either way.

Would you be open to a short conversation? If not, no problem at all.`,
  }
}

export interface BuiltEmail {
  to: string
  from: string
  reply_to: string
  subject: string
  text: string
}

export interface Recipient {
  external_id: string
  agent_email?: string | null
  owner_email?: string | null
  outreach_subject: string
  outreach_body: string
}

// Returns a ready-to-send email, or a reason it was skipped.
export function buildEmail(
  r: Recipient, channel: OutreachChannel, s: OutreachSettings, suppressed: string[],
): { email: BuiltEmail } | { skip: string } {
  const to = channel === 'agent_email' ? r.agent_email : r.owner_email
  if (!to) return { skip: `no ${channel === 'agent_email' ? 'agent' : 'owner'} email` }
  if (!isEmail(to)) return { skip: `invalid email: ${to}` }
  if (isSuppressed(to, suppressed)) return { skip: `suppressed: ${to}` }
  const gaps = settingsGaps(s)
  if (gaps.length) return { skip: `settings incomplete: ${gaps.join(', ')}` }

  return {
    email: {
      to: normalizeEmail(to),
      from: `${s.from_name} <${s.from_email}>`,
      reply_to: s.reply_to || s.from_email,
      subject: r.outreach_subject,
      text: r.outreach_body + canSpamFooter(s, r.external_id),
    },
  }
}
