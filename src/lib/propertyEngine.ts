// ============================================================
// Tracque — Property Opportunity Engine
// ============================================================
// Pure, dependency-free logic shared by the demo (client) path and
// documented for the production edge function (scan-properties).
//
// Two dimensions, so RV parks / seller-finance / subto drop in later
// without a schema rewrite:
//   asset_type: 'sfh' | 'rv_park' | 'mh_park' | 'land' | 'multifamily'
//   strategy:   'seller_finance' | 'subject_to' | 'rent_instead_of_sell'
//
// Phase 1 ships single-family (`sfh`) + `seller_finance` / `subject_to`,
// scored against realistic Nashville / Davidson County mock data.
// ============================================================

export type AssetType = 'sfh' | 'rv_park' | 'mh_park' | 'land' | 'multifamily'
export type Strategy = 'seller_finance' | 'subject_to' | 'rent_instead_of_sell'

export interface Property {
  external_id: string
  source: 'mock' | 'rentcast' | 'county'
  asset_type: AssetType
  address: string
  neighborhood: string
  city: string
  state: string
  zip: string
  beds: number
  baths: number
  sqft: number
  year_built: number
  list_price: number
  days_on_market: number
  price_cut_count: number
  total_price_cut_pct: number   // cumulative % off original list
  status: 'active' | 'back_on_market' | 'price_reduced'
  avm_value: number             // estimated market value
  rent_estimate: number         // estimated monthly market rent
  // ── ownership / public-records signals (Davidson County) ──
  last_sale_price: number
  last_sale_year: number
  ownership_years: number
  has_open_mortgage: boolean     // false ⇒ owned free & clear
  mortgage_origination_year: number | null
  mortgage_rate_est: number | null   // annual %, for subto attractiveness
  est_mortgage_balance: number | null
  owner_occupied: boolean
  owner_out_of_state: boolean
  distress_flags: string[]       // 'preforeclosure' | 'tax_lien' | 'probate' | 'code_violation'
  // ── listing contact ──
  agent_name: string
  agent_brokerage: string
  listing_url: string
}

export interface ScoreSignal {
  key: string
  label: string
  weight: number        // points contributed
  present: boolean
  detail: string
}

export interface DealMath {
  strategy: Strategy
  down_payment: number
  financed_amount: number
  interest_rate: number      // annual %
  term_years: number
  monthly_pi: number
  monthly_taxes: number
  monthly_insurance: number
  monthly_total: number      // PITI-ish
  vs_rent_estimate: number   // monthly_total − rent_estimate (negative = cheaper than renting)
  fits_budget: boolean | null
}

export interface PropertyScore {
  property: Property
  strategy: Strategy
  fit_score: number          // 0–100
  motivation_score: number   // 0–100
  signals: ScoreSignal[]
  reasons: string[]          // the human "why"
  deal_math: DealMath
  outreach: { subject: string; body: string }
}

export interface ScanParams {
  strategy: Strategy
  max_price: number
  min_beds: number
  monthly_budget: number     // buyer's target monthly payment
  buyer_name: string
}

// ── Deterministic RNG (stable results across renders) ──────

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NASHVILLE_NEIGHBORHOODS = [
  { name: 'East Nashville', zip: '37206', tier: 1.15 },
  { name: 'Inglewood', zip: '37216', tier: 1.05 },
  { name: 'The Nations', zip: '37209', tier: 1.2 },
  { name: 'Germantown', zip: '37208', tier: 1.35 },
  { name: 'Donelson', zip: '37214', tier: 0.9 },
  { name: 'Madison', zip: '37115', tier: 0.72 },
  { name: 'Hermitage', zip: '37076', tier: 0.82 },
  { name: 'Antioch', zip: '37013', tier: 0.68 },
  { name: 'Old Hickory', zip: '37138', tier: 0.78 },
  { name: 'Goodlettsville', zip: '37072', tier: 0.75 },
  { name: 'Bellevue', zip: '37221', tier: 0.95 },
  { name: 'Whites Creek', zip: '37189', tier: 0.7 },
]

const STREETS = ['Riverside Dr', 'Gallatin Pike', 'Dickerson Pike', 'Porter Rd', 'Eastland Ave',
  'McGavock Pike', 'Trinity Ln', 'Ewing Dr', 'Neelys Bend Rd', 'Anderson Rd', 'Bell Rd',
  'Old Hickory Blvd', 'Charlotte Ave', 'Clarksville Pike', 'Dupont Ave', 'Larkin Springs Rd']

const BROKERAGES = ['Zeitlin Sotheby\'s', 'Benchmark Realty', 'Keller Williams Nashville',
  'Compass TN', 'Parks Realty', 'Village Real Estate', 'The Ashton Real Estate Group']

const FIRST = ['Sarah', 'Mike', 'Angela', 'Derrick', 'Tom', 'Priya', 'Jamal', 'Karen', 'Luis', 'Beth']
const LAST = ['Whitfield', 'Nguyen', 'Carter', 'Boyd', 'Alvarez', 'Freeman', 'Patel', 'Sullivan', 'Reed', 'Cole']

// ── Nashville-calibrated mock generator ────────────────────
// Realistic enough to demo the ranking; deterministic by seed.

export function generateNashvilleProperties(count = 16, seed = 42): Property[] {
  const rnd = mulberry32(seed)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo)
  const currentYear = 2026

  const props: Property[] = []
  for (let i = 0; i < count; i++) {
    const hood = pick(NASHVILLE_NEIGHBORHOODS)
    const beds = 2 + Math.floor(rnd() * 4)
    const baths = Math.max(1, beds - 1 + Math.round(rnd()))
    const sqft = Math.round(between(950, 2600) * (0.9 + hood.tier * 0.2))
    const yearBuilt = Math.floor(between(1948, 2016))

    // Market value driven by neighborhood tier + size
    const avm = Math.round((160000 + sqft * between(140, 240)) * hood.tier)
    // List price wanders around AVM; some list below (motivated)
    const listVsAvm = between(0.92, 1.06)
    const listPrice = Math.round((avm * listVsAvm) / 1000) * 1000

    const dom = Math.floor(between(4, 190))
    const priceCuts = dom > 60 ? Math.floor(between(0, 3)) : Math.floor(between(0, 1.4))
    const totalCutPct = priceCuts > 0 ? +(between(2, 9) * priceCuts * 0.6).toFixed(1) : 0

    const rentEstimate = Math.round((avm * between(0.0045, 0.0062)) / 25) * 25

    // Ownership / records
    const ownershipYears = Math.floor(between(1, 28))
    const lastSaleYear = currentYear - ownershipYears
    const lastSalePrice = Math.round((avm / Math.pow(1.045, ownershipYears)) / 1000) * 1000

    // Free & clear likelier with long tenure
    const freeAndClearChance = ownershipYears >= 12 ? 0.62 : ownershipYears >= 7 ? 0.3 : 0.12
    const hasMortgage = rnd() > freeAndClearChance
    let origYear: number | null = null
    let rateEst: number | null = null
    let balance: number | null = null
    if (hasMortgage) {
      origYear = Math.max(lastSaleYear, currentYear - Math.floor(between(1, 12)))
      // Rate tracks vintage: 2020–21 refis are the sub-3% golden subto loans
      rateEst = origYear <= 2019 ? +between(3.6, 4.6).toFixed(2)
        : origYear <= 2021 ? +between(2.6, 3.2).toFixed(2)
        : +between(6.1, 7.3).toFixed(2)
      const yearsPaid = currentYear - origYear
      balance = Math.round((lastSalePrice * 0.8 * Math.pow(0.985, yearsPaid)) / 1000) * 1000
    }

    const ownerOccupied = rnd() > 0.42
    const ownerOutOfState = !ownerOccupied && rnd() > 0.55

    const flags: string[] = []
    if (rnd() > 0.9) flags.push('preforeclosure')
    if (rnd() > 0.88) flags.push('tax_lien')
    if (ownershipYears > 20 && rnd() > 0.8) flags.push('probate')
    if (rnd() > 0.93) flags.push('code_violation')

    const status: Property['status'] = priceCuts > 0 ? 'price_reduced'
      : dom > 120 ? 'back_on_market' : 'active'

    props.push({
      external_id: `NSH-${(seed * 1000 + i).toString(36).toUpperCase()}`,
      source: 'mock',
      asset_type: 'sfh',
      address: `${Math.floor(between(100, 4999))} ${pick(STREETS)}`,
      neighborhood: hood.name,
      city: 'Nashville',
      state: 'TN',
      zip: hood.zip,
      beds,
      baths,
      sqft,
      year_built: yearBuilt,
      list_price: listPrice,
      days_on_market: dom,
      price_cut_count: priceCuts,
      total_price_cut_pct: totalCutPct,
      status,
      avm_value: avm,
      rent_estimate: rentEstimate,
      last_sale_price: lastSalePrice,
      last_sale_year: lastSaleYear,
      ownership_years: ownershipYears,
      has_open_mortgage: hasMortgage,
      mortgage_origination_year: origYear,
      mortgage_rate_est: rateEst,
      est_mortgage_balance: balance,
      owner_occupied: ownerOccupied,
      owner_out_of_state: ownerOutOfState,
      distress_flags: flags,
      agent_name: `${pick(FIRST)} ${pick(LAST)}`,
      agent_brokerage: pick(BROKERAGES),
      listing_url: '#',
    })
  }
  return props
}

// ── Deal math ──────────────────────────────────────────────

function amortizedMonthly(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12
  const n = years * 12
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

function computeDealMath(p: Property, strategy: Strategy, budget: number): DealMath {
  const taxes = (p.avm_value * 0.0065) / 12   // Davidson County ~0.65%/yr effective
  const insurance = 105

  if (strategy === 'subject_to' && p.has_open_mortgage && p.mortgage_rate_est != null && p.est_mortgage_balance != null) {
    // Take over existing loan; small cash-to-seller assumed separately
    const yearsLeft = Math.max(15, 30 - (2026 - (p.mortgage_origination_year ?? 2026)))
    const pi = amortizedMonthly(p.est_mortgage_balance, p.mortgage_rate_est, yearsLeft)
    const total = pi + taxes + insurance
    return {
      strategy, down_payment: Math.round(p.list_price - p.est_mortgage_balance),
      financed_amount: p.est_mortgage_balance, interest_rate: p.mortgage_rate_est,
      term_years: yearsLeft, monthly_pi: Math.round(pi), monthly_taxes: Math.round(taxes),
      monthly_insurance: insurance, monthly_total: Math.round(total),
      vs_rent_estimate: Math.round(total - p.rent_estimate),
      fits_budget: budget > 0 ? total <= budget : null,
    }
  }

  // seller_finance (default): 10% down, seller carries at a negotiated rate
  const rate = 6.0
  const down = Math.round(p.list_price * 0.1)
  const financed = p.list_price - down
  const pi = amortizedMonthly(financed, rate, 30)
  const total = pi + taxes + insurance
  return {
    strategy, down_payment: down, financed_amount: financed, interest_rate: rate,
    term_years: 30, monthly_pi: Math.round(pi), monthly_taxes: Math.round(taxes),
    monthly_insurance: insurance, monthly_total: Math.round(total),
    vs_rent_estimate: Math.round(total - p.rent_estimate),
    fits_budget: budget > 0 ? total <= budget : null,
  }
}

// ── Scorers ────────────────────────────────────────────────

function sellerFinanceSignals(p: Property): ScoreSignal[] {
  return [
    { key: 'free_clear', label: 'Owned free & clear', weight: 35, present: !p.has_open_mortgage,
      detail: p.has_open_mortgage ? 'Open mortgage on record' : 'No mortgage lien — owner can carry a note' },
    { key: 'tenure', label: 'Long ownership', weight: Math.min(15, Math.round(p.ownership_years * 0.9)),
      present: p.ownership_years >= 10, detail: `Owned ${p.ownership_years} yrs (since ${p.last_sale_year})` },
    { key: 'absentee', label: 'Absentee / out-of-state owner', weight: 10,
      present: !p.owner_occupied, detail: p.owner_out_of_state ? 'Owner mailing address out of state' : p.owner_occupied ? 'Owner-occupied' : 'Non-owner-occupied' },
    { key: 'dom', label: 'Stale listing', weight: 10, present: p.days_on_market >= 75,
      detail: `${p.days_on_market} days on market` },
    { key: 'cuts', label: 'Price reductions', weight: 8, present: p.price_cut_count > 0,
      detail: p.price_cut_count > 0 ? `${p.price_cut_count} cut(s), ${p.total_price_cut_pct}% off` : 'No price cuts' },
    { key: 'distress', label: 'Public distress flags', weight: 12, present: p.distress_flags.length > 0,
      detail: p.distress_flags.length ? p.distress_flags.join(', ') : 'None on record' },
  ]
}

function subjectToSignals(p: Property): ScoreSignal[] {
  const lowRate = p.mortgage_rate_est != null && p.mortgage_rate_est < 4.0
  const golden = p.mortgage_origination_year != null && p.mortgage_origination_year >= 2020 && p.mortgage_origination_year <= 2021
  const equity = p.avm_value - (p.est_mortgage_balance ?? 0)
  return [
    { key: 'has_loan', label: 'Existing mortgage to take over', weight: 20, present: p.has_open_mortgage,
      detail: p.has_open_mortgage ? `~$${Math.round((p.est_mortgage_balance ?? 0) / 1000)}k balance` : 'Free & clear — no loan to assume (use seller finance)' },
    { key: 'low_rate', label: 'Low interest rate', weight: 25, present: lowRate,
      detail: p.mortgage_rate_est != null ? `~${p.mortgage_rate_est}% rate` : 'Unknown' },
    { key: 'golden_vintage', label: '2020–21 sub-3% vintage', weight: 12, present: golden,
      detail: p.mortgage_origination_year ? `Originated ${p.mortgage_origination_year}` : 'Unknown' },
    { key: 'equity', label: 'Workable equity spread', weight: 10, present: equity > 25000 && equity < p.avm_value * 0.45,
      detail: p.has_open_mortgage ? `~$${Math.round(equity / 1000)}k equity` : 'n/a' },
    { key: 'motivation', label: 'Motivation (DOM / cuts / distress)', weight: 15,
      present: p.days_on_market >= 75 || p.price_cut_count > 0 || p.distress_flags.length > 0,
      detail: `${p.days_on_market} DOM · ${p.price_cut_count} cuts · ${p.distress_flags.join(', ') || 'no flags'}` },
  ]
}

function motivationScore(p: Property): number {
  let s = 0
  if (p.days_on_market >= 120) s += 35
  else if (p.days_on_market >= 75) s += 22
  else if (p.days_on_market >= 45) s += 10
  s += Math.min(25, p.price_cut_count * 10 + p.total_price_cut_pct)
  s += p.distress_flags.length * 15
  if (!p.owner_occupied) s += 12
  return Math.min(100, Math.round(s))
}

export function scoreProperty(p: Property, params: ScanParams): PropertyScore {
  const signals = params.strategy === 'subject_to' ? subjectToSignals(p) : sellerFinanceSignals(p)
  const raw = signals.reduce((sum, s) => sum + (s.present ? s.weight : 0), 0)
  const max = signals.reduce((sum, s) => sum + s.weight, 0)
  const fit = Math.round((raw / max) * 100)

  const reasons = signals.filter(s => s.present).map(s => `${s.label} — ${s.detail}`)
  const deal = computeDealMath(p, params.strategy, params.monthly_budget)
  const outreach = draftOutreach(p, params, deal)

  return {
    property: p, strategy: params.strategy, fit_score: fit,
    motivation_score: motivationScore(p), signals, reasons,
    deal_math: deal, outreach,
  }
}

export function runScan(params: ScanParams, seed = 42): PropertyScore[] {
  return generateNashvilleProperties(18, seed)
    .filter(p => p.list_price <= params.max_price && p.beds >= params.min_beds)
    .map(p => scoreProperty(p, params))
    .sort((a, b) => b.fit_score - a.fit_score || b.motivation_score - a.motivation_score)
}

// ── Outreach templater (agent-directed = low TCPA risk) ────
// Production path drafts this with Claude via the edge function; this
// template mirrors the tone so demo output is representative.

export function draftOutreach(p: Property, params: ScanParams, deal: DealMath): { subject: string; body: string } {
  const strat = params.strategy === 'subject_to' ? 'take over the existing financing' : 'a seller-financing structure'
  const subject = `${p.address} — offer on ${p.neighborhood} home (creative terms)`
  const body = `Hi ${p.agent_name.split(' ')[0]},

I'm interested in your listing at ${p.address} in ${p.neighborhood}. I'm a serious, ready buyer looking to purchase a home to live in, and I'd like to explore ${strat} rather than a conventional bank purchase.

Given the home has been on the market ${p.days_on_market} days${p.price_cut_count > 0 ? ` with ${p.price_cut_count} price adjustment(s)` : ''}, a creative structure could get your seller a strong price and a clean, fast close. A rough outline of what I can offer:

  • Purchase near list ($${p.list_price.toLocaleString()})
  • ~$${deal.down_payment.toLocaleString()} down
  • ${deal.interest_rate}% over ${deal.term_years} years (≈ $${deal.monthly_pi.toLocaleString()}/mo to the seller)

Happy to put this in writing and provide proof of funds for the down payment. Could we set up a quick call this week? Whatever works for you and your seller.

Thanks,
${params.buyer_name}`
  return { subject, body }
}
