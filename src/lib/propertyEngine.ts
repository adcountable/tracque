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
// PropStream-style query layer on top: Quick Lists, rich filters,
// equity/owner-type/vacancy signals, comps, and portfolio summary.
// ============================================================

export type AssetType = 'sfh' | 'rv_park' | 'mh_park' | 'land' | 'multifamily'
export type Strategy = 'seller_finance' | 'subject_to' | 'rent_instead_of_sell'
export type OwnerType = 'owner_occupied' | 'absentee_in_state' | 'absentee_out_of_state'

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
  // ── ownership / public-records signals (county records) ──
  last_sale_price: number
  last_sale_year: number
  ownership_years: number
  has_open_mortgage: boolean     // false ⇒ owned free & clear
  mortgage_origination_year: number | null
  mortgage_rate_est: number | null   // annual %, for subto attractiveness
  est_mortgage_balance: number | null
  equity: number                 // avm − balance (avm if free & clear)
  equity_pct: number             // 0–1
  owner_occupied: boolean
  owner_out_of_state: boolean
  owner_type: OwnerType
  is_vacant: boolean
  distress_flags: string[]       // 'preforeclosure' | 'tax_lien' | 'probate' | 'code_violation' | 'vacant'
  // ── owner contact (populated by skip trace) ──
  owner_name: string
  owner_phone: string | null
  owner_email: string | null
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

export interface Comp {
  address: string
  sqft: number
  sale_or_list: number
  price_per_sqft: number
}

export interface PropertyScore {
  property: Property
  strategy: Strategy
  fit_score: number          // 0–100
  motivation_score: number   // 0–100
  signals: ScoreSignal[]
  reasons: string[]          // the human "why"
  deal_math: DealMath
  comps: { comps: Comp[]; avg_ppsf: number; subject_ppsf: number }
  outreach: { subject: string; body: string }
}

export interface ScanParams {
  strategy: Strategy
  city: string
  state: string
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

// Generic districts for any non-Nashville market (nationwide support).
const GENERIC_DISTRICTS = [
  { name: 'Downtown', zip: '00001', tier: 1.2 },
  { name: 'Northside', zip: '00002', tier: 0.95 },
  { name: 'Westside', zip: '00003', tier: 1.1 },
  { name: 'Eastside', zip: '00004', tier: 0.9 },
  { name: 'Southside', zip: '00005', tier: 0.8 },
  { name: 'Midtown', zip: '00006', tier: 1.05 },
  { name: 'Riverside', zip: '00007', tier: 0.85 },
  { name: 'Heights', zip: '00008', tier: 1.0 },
]

const STREETS = ['Riverside Dr', 'Main St', 'Oak Ave', 'Porter Rd', 'Eastland Ave',
  'Maple Ln', 'Elm St', 'Ewing Dr', 'Cedar Rd', 'Anderson Rd', 'Bell Rd',
  'Highland Blvd', 'Charlotte Ave', 'Franklin Pike', 'Dupont Ave', 'Park Ave']

const BROKERAGES = ['Zeitlin Sotheby\'s', 'Benchmark Realty', 'Keller Williams',
  'Compass', 'Parks Realty', 'Village Real Estate', 'The Ashton Group']

const FIRST = ['Sarah', 'Mike', 'Angela', 'Derrick', 'Tom', 'Priya', 'Jamal', 'Karen', 'Luis', 'Beth']
const LAST = ['Whitfield', 'Nguyen', 'Carter', 'Boyd', 'Alvarez', 'Freeman', 'Patel', 'Sullivan', 'Reed', 'Cole']

// ── Market-parameterized mock generator ────────────────────
// Realistic enough to demo ranking; deterministic by seed.

export function generateProperties(city = 'Nashville', state = 'TN', count = 18, seed = 42): Property[] {
  const rnd = mulberry32(seed)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo)
  const currentYear = 2026
  const isNashville = city.toLowerCase().includes('nashville')
  const hoods = isNashville ? NASHVILLE_NEIGHBORHOODS : GENERIC_DISTRICTS

  const props: Property[] = []
  for (let i = 0; i < count; i++) {
    const hood = pick(hoods)
    const beds = 2 + Math.floor(rnd() * 4)
    const baths = Math.max(1, beds - 1 + Math.round(rnd()))
    const sqft = Math.round(between(950, 2600) * (0.9 + hood.tier * 0.2))
    const yearBuilt = Math.floor(between(1948, 2016))

    const avm = Math.round((160000 + sqft * between(140, 240)) * hood.tier)
    const listVsAvm = between(0.92, 1.06)
    const listPrice = Math.round((avm * listVsAvm) / 1000) * 1000

    const dom = Math.floor(between(4, 190))
    const priceCuts = dom > 60 ? Math.floor(between(0, 3)) : Math.floor(between(0, 1.4))
    const totalCutPct = priceCuts > 0 ? +(between(2, 9) * priceCuts * 0.6).toFixed(1) : 0

    const rentEstimate = Math.round((avm * between(0.0045, 0.0062)) / 25) * 25

    const ownershipYears = Math.floor(between(1, 28))
    const lastSaleYear = currentYear - ownershipYears
    const lastSalePrice = Math.round((avm / Math.pow(1.045, ownershipYears)) / 1000) * 1000

    const freeAndClearChance = ownershipYears >= 12 ? 0.62 : ownershipYears >= 7 ? 0.3 : 0.12
    const hasMortgage = rnd() > freeAndClearChance
    let origYear: number | null = null
    let rateEst: number | null = null
    let balance: number | null = null
    if (hasMortgage) {
      origYear = Math.max(lastSaleYear, currentYear - Math.floor(between(1, 12)))
      rateEst = origYear <= 2019 ? +between(3.6, 4.6).toFixed(2)
        : origYear <= 2021 ? +between(2.6, 3.2).toFixed(2)
        : +between(6.1, 7.3).toFixed(2)
      const yearsPaid = currentYear - origYear
      balance = Math.round((lastSalePrice * 0.8 * Math.pow(0.985, yearsPaid)) / 1000) * 1000
    }
    const equity = Math.max(0, avm - (balance ?? 0))
    const equityPct = +(equity / avm).toFixed(3)

    const ownerOccupied = rnd() > 0.42
    const ownerOutOfState = !ownerOccupied && rnd() > 0.55
    const ownerType: OwnerType = ownerOccupied ? 'owner_occupied'
      : ownerOutOfState ? 'absentee_out_of_state' : 'absentee_in_state'
    const isVacant = !ownerOccupied && rnd() > 0.7

    const flags: string[] = []
    if (rnd() > 0.9) flags.push('preforeclosure')
    if (rnd() > 0.88) flags.push('tax_lien')
    if (ownershipYears > 20 && rnd() > 0.8) flags.push('probate')
    if (rnd() > 0.93) flags.push('code_violation')
    if (isVacant) flags.push('vacant')

    const status: Property['status'] = priceCuts > 0 ? 'price_reduced'
      : dom > 120 ? 'back_on_market' : 'active'

    props.push({
      external_id: `${(isNashville ? 'NSH' : city.slice(0, 3).toUpperCase())}-${(seed * 1000 + i).toString(36).toUpperCase()}`,
      source: 'mock',
      asset_type: 'sfh',
      address: `${Math.floor(between(100, 4999))} ${pick(STREETS)}`,
      neighborhood: hood.name,
      city,
      state,
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
      equity,
      equity_pct: equityPct,
      owner_occupied: ownerOccupied,
      owner_out_of_state: ownerOutOfState,
      owner_type: ownerType,
      is_vacant: isVacant,
      distress_flags: flags,
      owner_name: `${pick(FIRST)} ${pick(LAST)}`,
      owner_phone: null,   // resolved by skip trace
      owner_email: null,
      agent_name: `${pick(FIRST)} ${pick(LAST)}`,
      agent_brokerage: pick(BROKERAGES),
      listing_url: '#',
    })
  }
  return props
}

// Back-compat alias.
export function generateNashvilleProperties(count = 16, seed = 42): Property[] {
  return generateProperties('Nashville', 'TN', count, seed)
}

// ── Quick Lists (one-click PropStream-style presets) ───────

export interface QuickList {
  key: string
  label: string
  desc: string
  match: (p: Property) => boolean
}

export const QUICK_LISTS: QuickList[] = [
  { key: 'preforeclosure', label: 'Pre-Foreclosure', desc: 'Notice of default / lis pendens on record',
    match: p => p.distress_flags.includes('preforeclosure') },
  { key: 'high_equity', label: 'High Equity', desc: '≥ 50% equity — room to structure a deal',
    match: p => p.equity_pct >= 0.5 },
  { key: 'free_clear', label: 'Free & Clear', desc: 'No mortgage — ideal seller-finance candidate',
    match: p => !p.has_open_mortgage },
  { key: 'absentee', label: 'Absentee Owner', desc: 'Owner does not live in the property',
    match: p => !p.owner_occupied },
  { key: 'out_of_state', label: 'Out-of-State Owner', desc: 'Owner mailing address in another state',
    match: p => p.owner_out_of_state },
  { key: 'tax_lien', label: 'Tax Delinquent', desc: 'Delinquent property taxes on record',
    match: p => p.distress_flags.includes('tax_lien') },
  { key: 'vacant', label: 'Vacant', desc: 'Likely vacant property',
    match: p => p.is_vacant },
  { key: 'tired_landlord', label: 'Tired Landlord', desc: 'Absentee owner, 10+ yrs, high equity',
    match: p => !p.owner_occupied && p.ownership_years >= 10 && p.equity_pct >= 0.5 },
  { key: 'price_reduced', label: 'Price Reduced', desc: 'One or more price cuts',
    match: p => p.price_cut_count > 0 },
  { key: 'low_rate', label: 'Low-Rate Loan', desc: 'Sub-4% mortgage — subject-to target',
    match: p => p.mortgage_rate_est != null && p.mortgage_rate_est < 4 },
]

// ── Rich filters ───────────────────────────────────────────

export interface PropertyFilters {
  quickLists: string[]         // OR-combined preset keys
  minPrice?: number
  maxPrice?: number
  minBeds?: number
  minBaths?: number
  minSqft?: number
  minYear?: number
  minEquityPct?: number        // 0–100 (UI %), converted internally
  minOwnershipYears?: number
  ownerType?: OwnerType | 'any'
  distressFlags?: string[]     // AND: property must include all
  statuses?: string[]          // OR
}

export function applyFilters(props: Property[], f: PropertyFilters): Property[] {
  return props.filter(p => {
    if (f.minPrice != null && p.list_price < f.minPrice) return false
    if (f.maxPrice != null && p.list_price > f.maxPrice) return false
    if (f.minBeds != null && p.beds < f.minBeds) return false
    if (f.minBaths != null && p.baths < f.minBaths) return false
    if (f.minSqft != null && p.sqft < f.minSqft) return false
    if (f.minYear != null && p.year_built < f.minYear) return false
    if (f.minEquityPct != null && p.equity_pct * 100 < f.minEquityPct) return false
    if (f.minOwnershipYears != null && p.ownership_years < f.minOwnershipYears) return false
    if (f.ownerType && f.ownerType !== 'any' && p.owner_type !== f.ownerType) return false
    if (f.distressFlags?.length && !f.distressFlags.every(flag => p.distress_flags.includes(flag))) return false
    if (f.statuses?.length && !f.statuses.includes(p.status)) return false
    if (f.quickLists?.length) {
      const lists = QUICK_LISTS.filter(q => f.quickLists.includes(q.key))
      if (!lists.some(q => q.match(p))) return false
    }
    return true
  })
}

// ── Portfolio summary (stat bar) ───────────────────────────

export interface PortfolioSummary {
  count: number
  avg_equity_pct: number
  free_clear_count: number
  distressed_count: number
  avg_dom: number
  avg_price: number
}

export function summarize(props: Property[]): PortfolioSummary {
  if (props.length === 0) return { count: 0, avg_equity_pct: 0, free_clear_count: 0, distressed_count: 0, avg_dom: 0, avg_price: 0 }
  const n = props.length
  return {
    count: n,
    avg_equity_pct: +(props.reduce((s, p) => s + p.equity_pct, 0) / n * 100).toFixed(0),
    free_clear_count: props.filter(p => !p.has_open_mortgage).length,
    distressed_count: props.filter(p => p.distress_flags.length > 0).length,
    avg_dom: Math.round(props.reduce((s, p) => s + p.days_on_market, 0) / n),
    avg_price: Math.round(props.reduce((s, p) => s + p.list_price, 0) / n),
  }
}

// ── Comps ──────────────────────────────────────────────────

export function computeComps(subject: Property, universe: Property[]): { comps: Comp[]; avg_ppsf: number; subject_ppsf: number } {
  const comps = universe
    .filter(p => p.external_id !== subject.external_id && p.neighborhood === subject.neighborhood)
    .filter(p => Math.abs(p.sqft - subject.sqft) <= 500 && Math.abs(p.beds - subject.beds) <= 1)
    .slice(0, 4)
    .map(p => ({ address: p.address, sqft: p.sqft, sale_or_list: p.list_price, price_per_sqft: +(p.list_price / p.sqft).toFixed(0) }))
  const avg = comps.length ? Math.round(comps.reduce((s, c) => s + c.price_per_sqft, 0) / comps.length) : 0
  return { comps, avg_ppsf: avg, subject_ppsf: +(subject.list_price / subject.sqft).toFixed(0) }
}

// ── Skip trace (provider-ready stub) ───────────────────────
// Production calls a skip-trace provider (BatchData, REISkip, etc.).
// Deterministic mock so the demo shows resolved contact info.

export function skipTrace(p: Property): { owner_phone: string; owner_email: string } {
  let h = 0
  for (const ch of p.external_id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const area = 615
  const line = 1000 + (h % 9000)
  const prefix = 200 + (h % 800)
  const handle = p.owner_name.toLowerCase().replace(/[^a-z]/g, '.')
  return { owner_phone: `(${area}) ${prefix}-${line}`, owner_email: `${handle}@example.com` }
}

// ── Deal math ──────────────────────────────────────────────

function amortizedMonthly(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12
  const n = years * 12
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

function computeDealMath(p: Property, strategy: Strategy, budget: number): DealMath {
  const taxes = (p.avm_value * 0.0065) / 12
  const insurance = 105

  if (strategy === 'subject_to' && p.has_open_mortgage && p.mortgage_rate_est != null && p.est_mortgage_balance != null) {
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
    { key: 'distress', label: 'Public distress flags', weight: 12, present: p.distress_flags.some(f => f !== 'vacant'),
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

export function scoreProperty(p: Property, params: ScanParams, universe: Property[] = []): PropertyScore {
  const signals = params.strategy === 'subject_to' ? subjectToSignals(p) : sellerFinanceSignals(p)
  const raw = signals.reduce((sum, s) => sum + (s.present ? s.weight : 0), 0)
  const max = signals.reduce((sum, s) => sum + s.weight, 0)
  const fit = Math.round((raw / max) * 100)

  const reasons = signals.filter(s => s.present).map(s => `${s.label} — ${s.detail}`)
  const deal = computeDealMath(p, params.strategy, params.monthly_budget)
  const outreach = draftOutreach(p, params, deal)
  const comps = computeComps(p, universe)

  return {
    property: p, strategy: params.strategy, fit_score: fit,
    motivation_score: motivationScore(p), signals, reasons,
    deal_math: deal, comps, outreach,
  }
}

export function runScan(params: ScanParams, seed = 42): PropertyScore[] {
  const universe = generateProperties(params.city, params.state, 24, seed)
  return universe
    .filter(p => p.list_price <= params.max_price && p.beds >= params.min_beds)
    .map(p => scoreProperty(p, params, universe))
    .sort((a, b) => b.fit_score - a.fit_score || b.motivation_score - a.motivation_score)
}

// ── Outreach templater (agent-directed = low TCPA risk) ────

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

// ── CSV export ─────────────────────────────────────────────

export function toCSV(scores: PropertyScore[]): string {
  const headers = ['address', 'neighborhood', 'city', 'state', 'zip', 'list_price', 'avm_value',
    'equity_pct', 'beds', 'baths', 'sqft', 'year_built', 'days_on_market', 'owner_type',
    'ownership_years', 'has_open_mortgage', 'mortgage_rate_est', 'distress_flags', 'fit_score',
    'motivation_score', 'owner_name', 'owner_phone', 'owner_email']
  const rows = scores.map(s => {
    const p = s.property
    return [p.address, p.neighborhood, p.city, p.state, p.zip, p.list_price, p.avm_value,
      Math.round(p.equity_pct * 100), p.beds, p.baths, p.sqft, p.year_built, p.days_on_market,
      p.owner_type, p.ownership_years, p.has_open_mortgage, p.mortgage_rate_est ?? '',
      p.distress_flags.join('|'), s.fit_score, s.motivation_score, p.owner_name,
      p.owner_phone ?? '', p.owner_email ?? '']
      .map(v => {
        const str = String(v)
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
      }).join(',')
  })
  return [headers.join(','), ...rows].join('\n')
}
