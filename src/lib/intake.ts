// ============================================================
// Tracque — Inbound seller intake (opt-in lead capture)
// ============================================================
// The resellable-lead model: a seller fills out this form themselves, so
// the submission IS the opt-in. We capture TCPA consent (text + timestamp)
// and the ad attribution (UTM) so leads are (a) compliant to contact and
// (b) measurable by campaign. Pure logic here; UI in pages/SellYourHouse.

export type SellReason =
  | 'foreclosure' | 'behind_payments' | 'inherited' | 'tired_landlord'
  | 'relocation' | 'divorce' | 'repairs' | 'financial' | 'other'

export type Timeline = 'asap' | '30_days' | '90_days' | 'exploring'
export type Condition = 'needs_work' | 'average' | 'updated'
export type Occupancy = 'owner' | 'vacant' | 'rented'
export type PriceFlex = 'firm' | 'somewhat' | 'flexible'

export interface IntakeForm {
  name: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  reason: SellReason
  timeline: Timeline
  condition: Condition
  occupancy: Occupancy
  price_flex: PriceFlex
  asking_price: number | null
  open_to_creative: boolean   // open to seller-finance / flexible terms
  notes: string
}

export interface Consent {
  tcpa: boolean
  text: string          // the exact disclosure the seller agreed to
  at: string            // ISO timestamp
  user_agent: string
}

export interface Attribution {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  gclid: string | null
  referrer: string | null
  landing_path: string | null
}

// The exact consent language a seller agrees to (store verbatim per lead).
export const TCPA_CONSENT_TEXT =
  'By submitting, I agree to be contacted about my property by phone, text, and email — including via automated technology — at the number and email I provided. Consent is not a condition of any purchase. Message/data rates may apply.'

// ── Intent scoring (0–100) — motivation from what the seller told us ──

const REASON_WEIGHT: Record<SellReason, number> = {
  foreclosure: 30, behind_payments: 28, financial: 24, inherited: 20,
  tired_landlord: 18, divorce: 18, relocation: 14, repairs: 12, other: 6,
}
const TIMELINE_WEIGHT: Record<Timeline, number> = { asap: 30, '30_days': 22, '90_days': 10, exploring: 2 }
const CONDITION_WEIGHT: Record<Condition, number> = { needs_work: 12, average: 6, updated: 2 }
const OCCUPANCY_WEIGHT: Record<Occupancy, number> = { vacant: 12, rented: 6, owner: 3 }
const FLEX_WEIGHT: Record<PriceFlex, number> = { flexible: 16, somewhat: 8, firm: 0 }

export function scoreIntake(f: IntakeForm): number {
  let s = REASON_WEIGHT[f.reason] + TIMELINE_WEIGHT[f.timeline]
    + CONDITION_WEIGHT[f.condition] + OCCUPANCY_WEIGHT[f.occupancy]
    + FLEX_WEIGHT[f.price_flex]
  if (f.open_to_creative) s += 10   // ideal for seller-finance / subto
  return Math.max(0, Math.min(100, Math.round(s)))
}

// Stable id from contact + address (no RNG) so re-submits dedupe.
export function intakeId(f: IntakeForm): string {
  const key = `${f.email}|${f.phone}|${f.address}`.toLowerCase()
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `IN-${h.toString(36).toUpperCase()}`
}

const REASON_LABEL: Record<SellReason, string> = {
  foreclosure: 'Facing foreclosure', behind_payments: 'Behind on payments',
  inherited: 'Inherited property', tired_landlord: 'Tired landlord',
  relocation: 'Relocating', divorce: 'Divorce', repairs: 'Needs repairs',
  financial: 'Financial hardship', other: 'Other',
}
export function reasonLabel(r: SellReason): string { return REASON_LABEL[r] }

export function readAttribution(): Attribution {
  const q = new URLSearchParams(window.location.search)
  return {
    utm_source: q.get('utm_source'), utm_medium: q.get('utm_medium'),
    utm_campaign: q.get('utm_campaign'), utm_term: q.get('utm_term'),
    utm_content: q.get('utm_content'), gclid: q.get('gclid'),
    referrer: document.referrer || null, landing_path: window.location.pathname,
  }
}
