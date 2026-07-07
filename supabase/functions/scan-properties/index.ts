// Tracque — Deal Finder scan engine
// POST /functions/v1/scan-properties
// Body: { user_id, market?, strategy, params: { max_price, min_beds, monthly_budget, buyer_name } }
//
// Data adapters (auto-selected):
//   RENTCAST_API_KEY set  -> RentCast listings + AVM + rent (residential)
//   otherwise             -> deterministic Nashville mock (matches the demo UI)
// County records (Davidson) enrich ownership/lien/distress signals when
// DATAFINITI / ATTOM keys are present — stubbed here as TODO.
//
// Scoring mirrors src/lib/propertyEngine.ts so demo and production rank identically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enrichFromDavidsonCounty } from './county.ts'
import { enrichFromRecords, recordsProviderConfigured } from './records.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const RENTCAST_API_KEY = Deno.env.get('RENTCAST_API_KEY')

type Strategy = 'seller_finance' | 'subject_to' | 'rent_instead_of_sell'

interface Property {
  external_id: string; source: string; asset_type: string
  address: string; neighborhood: string; city: string; state: string; zip: string
  beds: number; baths: number; sqft: number; year_built: number
  list_price: number; days_on_market: number; price_cut_count: number
  total_price_cut_pct: number; status: string; avm_value: number; rent_estimate: number
  last_sale_price: number; last_sale_year: number; ownership_years: number
  has_open_mortgage: boolean; mortgage_origination_year: number | null
  mortgage_rate_est: number | null; est_mortgage_balance: number | null
  equity: number; equity_pct: number
  owner_occupied: boolean; owner_out_of_state: boolean
  owner_type: string; is_vacant: boolean; distress_flags: string[]
  owner_name: string; owner_phone: string | null; owner_email: string | null
  agent_name: string; agent_brokerage: string; listing_url: string
}

function deriveOwner(occupied: boolean, outOfState: boolean): string {
  return occupied ? 'owner_occupied' : outOfState ? 'absentee_out_of_state' : 'absentee_in_state'
}

// ── Adapters ───────────────────────────────────────────────

// How many listings to enrich with per-property API calls (owner/AVM/rent
// + county). Enrichment is the expensive part on RentCast's free tier, so
// it's capped and configurable.
const ENRICH_LIMIT = Number(Deno.env.get('ENRICH_LIMIT') ?? '10')

// RentCast per-address GET (AVM value / rent). Returns null on any error.
async function rentcastGet(path: string, address: string): Promise<any | null> {
  const url = new URL(`https://api.rentcast.io/v1${path}`)
  url.searchParams.set('address', address)
  try {
    const res = await fetch(url, { headers: { 'X-Api-Key': RENTCAST_API_KEY! } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function fetchProperties(market: string, params: any): Promise<Property[]> {
  let base: Property[]
  if (RENTCAST_API_KEY) {
    try {
      base = await fetchFromRentCast(market, params)
    } catch (e) {
      console.error('RentCast failed, falling back to mock:', e)
      base = mockNashville(18)
    }
  } else {
    base = mockNashville(18)
  }

  // Layer Davidson County public records over the top N (Nashville only).
  const isDavidson = /nashville|davidson/i.test(market)
  if (isDavidson && base.some(p => p.source !== 'mock')) {
    const toEnrich = base.slice(0, ENRICH_LIMIT)
    await Promise.all(toEnrich.map(async (p) => {
      try {
        const c = await enrichFromDavidsonCounty(p.address)
        if (!c.matched) return
        if (c.owner_name) p.owner_name = c.owner_name
        if (c.owner_out_of_state != null) {
          p.owner_out_of_state = c.owner_out_of_state
          p.owner_occupied = false
          p.owner_type = deriveOwner(false, c.owner_out_of_state)
        }
        if (c.assessed_value && !p.avm_value) p.avm_value = c.assessed_value
        if (c.last_sale_price) p.last_sale_price = c.last_sale_price
        if (c.last_sale_year) {
          p.last_sale_year = c.last_sale_year
          p.ownership_years = new Date().getFullYear() - c.last_sale_year
        }
        p.source = 'county'   // mark records-enriched
      } catch (e) {
        console.error('County enrich failed for', p.address, e)
      }
    }))
  }

  // Layer lien/records ground truth (free-and-clear, tax liens, pre-foreclosure).
  if (recordsProviderConfigured() && base.some(p => p.source !== 'mock')) {
    const toEnrich = base.slice(0, ENRICH_LIMIT)
    await Promise.all(toEnrich.map(async (p) => {
      try {
        const r = await enrichFromRecords(p.address)
        if (!r.known) return
        if (r.has_open_mortgage != null) p.has_open_mortgage = r.has_open_mortgage
        if (r.est_mortgage_balance != null) p.est_mortgage_balance = r.est_mortgage_balance
        if (r.mortgage_origination_year != null) p.mortgage_origination_year = r.mortgage_origination_year
        if (r.mortgage_rate_est != null) p.mortgage_rate_est = r.mortgage_rate_est
        if (r.last_sale_price != null) p.last_sale_price = r.last_sale_price
        if (r.last_sale_year != null) {
          p.last_sale_year = r.last_sale_year
          p.ownership_years = new Date().getFullYear() - r.last_sale_year
        }
        for (const f of r.lien_flags) if (!p.distress_flags.includes(f)) p.distress_flags.push(f)
        // Recompute equity now that we know the real balance.
        p.equity = Math.max(0, p.avm_value - (p.has_open_mortgage ? (p.est_mortgage_balance ?? 0) : 0))
        p.equity_pct = p.avm_value ? +(p.equity / p.avm_value).toFixed(3) : 0
      } catch (e) {
        console.error('Records enrich failed for', p.address, e)
      }
    }))
  }
  return base
}

// RentCast: on-market listings + value/rent estimates + price history.
// NOTE: RentCast does not expose mortgage/lien data, so free-and-clear is
// UNKNOWN from this source — county records or a paid provider fill it.
async function fetchFromRentCast(market: string, params: any): Promise<Property[]> {
  const [city, state] = market.split(',').map((s: string) => s.trim())
  const url = new URL('https://api.rentcast.io/v1/listings/sale')
  url.searchParams.set('city', city)
  url.searchParams.set('state', state || 'TN')
  url.searchParams.set('status', 'Active')
  url.searchParams.set('limit', '100')
  if (params.max_price) url.searchParams.set('maxPrice', String(params.max_price))
  if (params.min_beds) url.searchParams.set('bedrooms', String(params.min_beds))
  const res = await fetch(url, { headers: { 'X-Api-Key': RENTCAST_API_KEY! } })
  if (!res.ok) throw new Error(`RentCast ${res.status}`)
  const rows = await res.json()
  const year = new Date().getFullYear()

  const props: Property[] = []
  for (let i = 0; i < (rows as any[]).length; i++) {
    const r = (rows as any[])[i]
    const listPrice = r.price ?? 0

    // Price history → count of downward adjustments + total % off original.
    let cuts = 0, originalPrice = listPrice
    const hist = r.history && typeof r.history === 'object' ? Object.values(r.history) as any[] : []
    const priced = hist.map(h => h?.price).filter((n: any) => typeof n === 'number')
    for (let j = 1; j < priced.length; j++) if (priced[j] < priced[j - 1]) cuts++
    if (priced.length) originalPrice = Math.max(...priced)
    const totalCutPct = originalPrice > 0 ? +(((originalPrice - listPrice) / originalPrice) * 100).toFixed(1) : 0

    props.push({
      external_id: r.id ?? `RC-${i}`, source: 'rentcast', asset_type: 'sfh',
      address: r.formattedAddress ?? r.addressLine1 ?? 'Unknown',
      neighborhood: r.county ?? city, city, state: state || 'TN', zip: r.zipCode ?? '',
      beds: r.bedrooms ?? 0, baths: r.bathrooms ?? 0, sqft: r.squareFootage ?? 0,
      year_built: r.yearBuilt ?? 0, list_price: listPrice,
      days_on_market: r.daysOnMarket ?? 0, price_cut_count: cuts,
      total_price_cut_pct: Math.max(0, totalCutPct),
      status: cuts > 0 ? 'price_reduced' : 'active',
      avm_value: 0, rent_estimate: 0,   // filled by AVM enrichment below
      last_sale_price: 0, last_sale_year: year - 8,
      ownership_years: 8, has_open_mortgage: true,   // UNKNOWN → conservative; county/paid source corrects
      mortgage_origination_year: null, mortgage_rate_est: null, est_mortgage_balance: null,
      equity: 0, equity_pct: 0,
      owner_occupied: r.ownerOccupied ?? true, owner_out_of_state: false,
      owner_type: (r.ownerOccupied ?? true) ? 'owner_occupied' : 'absentee_in_state',
      is_vacant: false, distress_flags: [],
      owner_name: r.owner?.names?.[0] ?? 'Property Owner', owner_phone: null, owner_email: null,
      agent_name: r.listingAgent?.name ?? 'Listing Agent',
      agent_brokerage: r.listingOffice?.name ?? '', listing_url: r.listingUrl ?? '#',
    })
  }

  // Enrich the top N with AVM value + long-term rent estimate.
  await Promise.all(props.slice(0, ENRICH_LIMIT).map(async (p) => {
    try {
      const [val, rent] = await Promise.all([
        rentcastGet('/avm/value', p.address),
        rentcastGet('/avm/rent/long-term', p.address),
      ])
      p.avm_value = val?.price ?? p.list_price
      p.rent_estimate = rent?.rent ?? Math.round(p.list_price * 0.005)
      p.equity = Math.max(0, p.avm_value - (p.est_mortgage_balance ?? 0))
      p.equity_pct = p.avm_value ? +(p.equity / p.avm_value).toFixed(3) : 0
    } catch { /* leave AVM/rent as fallback */ }
  }))
  // Fallbacks for the un-enriched remainder.
  for (const p of props) {
    if (!p.avm_value) p.avm_value = p.list_price
    if (!p.rent_estimate) p.rent_estimate = Math.round(p.list_price * 0.005)
    if (!p.equity_pct) { p.equity = Math.round(p.avm_value * 0.3); p.equity_pct = 0.3 }
  }
  return props
}

// Deterministic mock — mirrors src/lib/propertyEngine.ts
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function mockNashville(count: number): Property[] {
  const HOODS = [
    ['East Nashville', '37206', 1.15], ['Inglewood', '37216', 1.05], ['The Nations', '37209', 1.2],
    ['Germantown', '37208', 1.35], ['Donelson', '37214', 0.9], ['Madison', '37115', 0.72],
    ['Hermitage', '37076', 0.82], ['Antioch', '37013', 0.68], ['Old Hickory', '37138', 0.78],
    ['Bellevue', '37221', 0.95],
  ] as [string, string, number][]
  const STREETS = ['Riverside Dr', 'Gallatin Pike', 'Dickerson Pike', 'Porter Rd', 'Eastland Ave',
    'McGavock Pike', 'Trinity Ln', 'Ewing Dr', 'Anderson Rd', 'Bell Rd']
  const rnd = mulberry32(42)
  const pick = (a: any[]) => a[Math.floor(rnd() * a.length)]
  const btw = (lo: number, hi: number) => lo + rnd() * (hi - lo)
  const yr = 2026
  const out: Property[] = []
  for (let i = 0; i < count; i++) {
    const h = pick(HOODS); const tier = h[2] as number
    const beds = 2 + Math.floor(rnd() * 4)
    const sqft = Math.round(btw(950, 2600) * (0.9 + tier * 0.2))
    const avm = Math.round((160000 + sqft * btw(140, 240)) * tier)
    const list = Math.round((avm * btw(0.92, 1.06)) / 1000) * 1000
    const dom = Math.floor(btw(4, 190))
    const cuts = dom > 60 ? Math.floor(btw(0, 3)) : Math.floor(btw(0, 1.4))
    const own = Math.floor(btw(1, 28)); const saleY = yr - own
    const salePrice = Math.round((avm / Math.pow(1.045, own)) / 1000) * 1000
    const fcChance = own >= 12 ? 0.62 : own >= 7 ? 0.3 : 0.12
    const hasM = rnd() > fcChance
    let oy: number | null = null, rate: number | null = null, bal: number | null = null
    if (hasM) {
      oy = Math.max(saleY, yr - Math.floor(btw(1, 12)))
      rate = oy <= 2019 ? +btw(3.6, 4.6).toFixed(2) : oy <= 2021 ? +btw(2.6, 3.2).toFixed(2) : +btw(6.1, 7.3).toFixed(2)
      bal = Math.round((salePrice * 0.8 * Math.pow(0.985, yr - oy)) / 1000) * 1000
    }
    const occ = rnd() > 0.42
    const outOfState = !occ && rnd() > 0.55
    const vacant = !occ && rnd() > 0.7
    const equity = Math.max(0, avm - (bal ?? 0))
    const flags: string[] = []
    if (rnd() > 0.9) flags.push('preforeclosure')
    if (rnd() > 0.88) flags.push('tax_lien')
    if (own > 20 && rnd() > 0.8) flags.push('probate')
    if (vacant) flags.push('vacant')
    out.push({
      external_id: `NSH-${(42000 + i).toString(36).toUpperCase()}`, source: 'mock', asset_type: 'sfh',
      address: `${Math.floor(btw(100, 4999))} ${pick(STREETS)}`, neighborhood: h[0], city: 'Nashville',
      state: 'TN', zip: h[1], beds, baths: Math.max(1, beds - 1), sqft, year_built: Math.floor(btw(1948, 2016)),
      list_price: list, days_on_market: dom, price_cut_count: cuts,
      total_price_cut_pct: cuts > 0 ? +(btw(2, 9) * cuts * 0.6).toFixed(1) : 0,
      status: cuts > 0 ? 'price_reduced' : dom > 120 ? 'back_on_market' : 'active',
      avm_value: avm, rent_estimate: Math.round((avm * btw(0.0045, 0.0062)) / 25) * 25,
      last_sale_price: salePrice, last_sale_year: saleY, ownership_years: own,
      has_open_mortgage: hasM, mortgage_origination_year: oy, mortgage_rate_est: rate, est_mortgage_balance: bal,
      equity, equity_pct: +(equity / avm).toFixed(3),
      owner_occupied: occ, owner_out_of_state: outOfState,
      owner_type: deriveOwner(occ, outOfState), is_vacant: vacant, distress_flags: flags,
      owner_name: 'Property Owner', owner_phone: null, owner_email: null,
      agent_name: 'Listing Agent', agent_brokerage: 'Nashville Realty', listing_url: '#',
    })
  }
  return out
}

// ── Scoring (mirrors propertyEngine.ts) ────────────────────

function amort(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12, n = years * 12
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n))
}

function sellerFinanceSignals(p: Property) {
  return [
    { key: 'free_clear', label: 'Owned free & clear', weight: 35, present: !p.has_open_mortgage, detail: p.has_open_mortgage ? 'Open mortgage on record' : 'No lien — can carry a note' },
    { key: 'tenure', label: 'Long ownership', weight: Math.min(15, Math.round(p.ownership_years * 0.9)), present: p.ownership_years >= 10, detail: `Owned ${p.ownership_years} yrs` },
    { key: 'absentee', label: 'Absentee owner', weight: 10, present: !p.owner_occupied, detail: p.owner_out_of_state ? 'Out-of-state owner' : p.owner_occupied ? 'Owner-occupied' : 'Non-owner-occupied' },
    { key: 'dom', label: 'Stale listing', weight: 10, present: p.days_on_market >= 75, detail: `${p.days_on_market} DOM` },
    { key: 'cuts', label: 'Price reductions', weight: 8, present: p.price_cut_count > 0, detail: `${p.price_cut_count} cut(s)` },
    { key: 'distress', label: 'Public distress flags', weight: 12, present: p.distress_flags.length > 0, detail: p.distress_flags.join(', ') || 'none' },
  ]
}

function subjectToSignals(p: Property, downBudget?: number) {
  const lowRate = p.mortgage_rate_est != null && p.mortgage_rate_est < 4.0
  const golden = p.mortgage_origination_year != null && p.mortgage_origination_year >= 2020 && p.mortgage_origination_year <= 2021
  // Seller's equity IS the entry cost — low equity wins for low-cash buyers.
  const entry = p.has_open_mortgage && p.est_mortgage_balance != null ? Math.max(0, p.list_price - p.est_mortgage_balance) : null
  const entryCap = Math.max(downBudget ?? 25000, 5000) + 10000
  return [
    { key: 'has_loan', label: 'Existing mortgage to take over', weight: 20, present: p.has_open_mortgage, detail: p.has_open_mortgage ? `~$${Math.round((p.est_mortgage_balance ?? 0) / 1000)}k balance` : 'free & clear' },
    { key: 'low_rate', label: 'Low interest rate', weight: 25, present: lowRate, detail: p.mortgage_rate_est != null ? `~${p.mortgage_rate_est}%` : 'unknown' },
    { key: 'golden_vintage', label: '2020–21 sub-3% vintage', weight: 12, present: golden, detail: p.mortgage_origination_year ? `${p.mortgage_origination_year}` : 'unknown' },
    { key: 'entry', label: 'Low entry cost (fits your cash)', weight: 15, present: entry != null && entry <= entryCap, detail: entry != null ? `~$${Math.round(entry / 1000)}k to enter (seller's equity)` : 'n/a' },
    { key: 'motivation', label: 'Motivation', weight: 15, present: p.days_on_market >= 75 || p.price_cut_count > 0 || p.distress_flags.length > 0, detail: `${p.days_on_market} DOM · ${p.price_cut_count} cuts` },
  ]
}

function motivation(p: Property): number {
  let s = 0
  if (p.days_on_market >= 120) s += 35; else if (p.days_on_market >= 75) s += 22; else if (p.days_on_market >= 45) s += 10
  s += Math.min(25, p.price_cut_count * 10 + p.total_price_cut_pct)
  s += p.distress_flags.length * 15
  if (!p.owner_occupied) s += 12
  return Math.min(100, Math.round(s))
}

function dealMath(p: Property, strategy: Strategy, budget: number, downBudget?: number) {
  const taxes = (p.avm_value * 0.0065) / 12, insurance = 105
  if (strategy === 'subject_to' && p.has_open_mortgage && p.mortgage_rate_est != null && p.est_mortgage_balance != null) {
    const yearsLeft = Math.max(15, 30 - (2026 - (p.mortgage_origination_year ?? 2026)))
    const pi = amort(p.est_mortgage_balance, p.mortgage_rate_est, yearsLeft)
    const total = pi + taxes + insurance
    return { strategy, down_payment: Math.round(p.list_price - p.est_mortgage_balance), financed_amount: p.est_mortgage_balance, interest_rate: p.mortgage_rate_est, term_years: yearsLeft, monthly_pi: Math.round(pi), monthly_taxes: Math.round(taxes), monthly_insurance: insurance, monthly_total: Math.round(total), vs_rent_estimate: Math.round(total - p.rent_estimate), fits_budget: budget > 0 ? total <= budget : null }
  }
  const rate = 6.0, down = downBudget != null ? Math.min(Math.round(downBudget), Math.round(p.list_price * 0.15)) : Math.round(p.list_price * 0.15), financed = p.list_price - down  // honors buyer cash budget; default ~15% (2025 seller-finance ≈76% LTV)
  const pi = amort(financed, rate, 30), total = pi + taxes + insurance
  return { strategy, down_payment: down, financed_amount: financed, interest_rate: rate, term_years: 30, monthly_pi: Math.round(pi), monthly_taxes: Math.round(taxes), monthly_insurance: insurance, monthly_total: Math.round(total), vs_rent_estimate: Math.round(total - p.rent_estimate), fits_budget: budget > 0 ? total <= budget : null }
}

function draftOutreach(p: Property, buyerName: string, strategy: Strategy, d: any) {
  const strat = strategy === 'subject_to' ? 'take over the existing financing' : 'a seller-financing structure'
  return {
    subject: `${p.address} — offer on ${p.neighborhood} home (creative terms)`,
    body: `Hi ${p.agent_name.split(' ')[0]},\n\nI'm interested in your listing at ${p.address} in ${p.neighborhood}. I'm a serious, ready buyer looking to purchase a home to live in, and I'd like to explore ${strat} rather than a conventional bank purchase.\n\nGiven the home has been on the market ${p.days_on_market} days${p.price_cut_count > 0 ? ` with ${p.price_cut_count} price adjustment(s)` : ''}, a creative structure could get your seller a strong price and a clean, fast close. Rough outline:\n\n  • Purchase near list ($${p.list_price.toLocaleString()})\n  • ~$${d.down_payment.toLocaleString()} down\n  • ${d.interest_rate}% over ${d.term_years} years (≈ $${d.monthly_pi.toLocaleString()}/mo to the seller)\n\nHappy to put this in writing and provide proof of funds. Could we set up a quick call this week?\n\nThanks,\n${buyerName}`,
  }
}

// ── Handler ────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { user_id, market = 'Nashville, TN', strategy = 'seller_finance', params = {} } = await req.json()
  if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400 })

  const maxPrice = params.max_price ?? 650000
  const minBeds = params.min_beds ?? 3
  const budget = params.monthly_budget ?? 0
  const downBudget = params.down_budget
  const buyerName = params.buyer_name ?? 'a buyer'

  const { data: scan } = await supabase.from('property_scans').insert({
    user_id, market, asset_type: 'sfh', strategy, params, status: 'running',
  }).select().single()

  try {
    const raw = await fetchProperties(market, params)
    const matched = raw.filter(p => p.list_price <= maxPrice && p.beds >= minBeds)

    const scored = matched.map(p => {
      const signals = strategy === 'subject_to' ? subjectToSignals(p, downBudget) : sellerFinanceSignals(p)
      const rawScore = signals.reduce((s, x) => s + (x.present ? x.weight : 0), 0)
      const maxScore = signals.reduce((s, x) => s + x.weight, 0)
      const fit = Math.round((rawScore / maxScore) * 100)
      const deal = dealMath(p, strategy, budget, downBudget)
      return {
        p, fit, motivation: motivation(p), signals,
        reasons: signals.filter(s => s.present).map(s => `${s.label} — ${s.detail}`),
        deal, outreach: draftOutreach(p, buyerName, strategy, deal),
      }
    }).sort((a, b) => b.fit - a.fit || b.motivation - a.motivation)

    // Persist in 4 batched calls instead of 3 per property.
    const { data: props } = await supabase.from('properties').upsert(
      scored.map(s => ({
        user_id, external_id: s.p.external_id, source: s.p.source, asset_type: s.p.asset_type,
        address: s.p.address, neighborhood: s.p.neighborhood, city: s.p.city, state: s.p.state, zip: s.p.zip,
        beds: s.p.beds, baths: s.p.baths, sqft: s.p.sqft, year_built: s.p.year_built,
        list_price: s.p.list_price, days_on_market: s.p.days_on_market, status: s.p.status,
        price_cut_count: s.p.price_cut_count, total_price_cut_pct: s.p.total_price_cut_pct,
        avm_value: s.p.avm_value, rent_estimate: s.p.rent_estimate,
        last_sale_price: s.p.last_sale_price, last_sale_year: s.p.last_sale_year, ownership_years: s.p.ownership_years,
        has_open_mortgage: s.p.has_open_mortgage, mortgage_origination_year: s.p.mortgage_origination_year,
        mortgage_rate_est: s.p.mortgage_rate_est, est_mortgage_balance: s.p.est_mortgage_balance,
        equity: s.p.equity, equity_pct: s.p.equity_pct,
        owner_occupied: s.p.owner_occupied, owner_out_of_state: s.p.owner_out_of_state,
        owner_type: s.p.owner_type, is_vacant: s.p.is_vacant, distress_flags: s.p.distress_flags,
        owner_name: s.p.owner_name, owner_phone: s.p.owner_phone, owner_email: s.p.owner_email,
        agent_name: s.p.agent_name, agent_brokerage: s.p.agent_brokerage, listing_url: s.p.listing_url,
      })),
      { onConflict: 'user_id,source,external_id' },
    ).select('id, external_id')

    const idByExternal = new Map((props ?? []).map((p: any) => [p.external_id, p.id]))
    const withId = scored.filter(s => idByExternal.has(s.p.external_id))

    if (withId.length) {
      await supabase.from('property_scores').insert(withId.map(s => ({
        scan_id: scan!.id, property_id: idByExternal.get(s.p.external_id), strategy, fit_score: s.fit,
        motivation_score: s.motivation, signals: s.signals, reasons: s.reasons, deal_math: s.deal,
      })))

      // Outreach: only draft for properties without an existing draft for
      // this strategy — re-scans must not pile up duplicate drafts.
      const { data: existingOutreach } = await supabase.from('property_outreach')
        .select('property_id').eq('user_id', user_id).eq('strategy', strategy)
      const hasDraft = new Set((existingOutreach ?? []).map((o: any) => o.property_id))
      const newDrafts = withId.filter(s => !hasDraft.has(idByExternal.get(s.p.external_id)))
      if (newDrafts.length) {
        await supabase.from('property_outreach').insert(newDrafts.map(s => ({
          user_id, property_id: idByExternal.get(s.p.external_id), strategy, channel: 'agent_email',
          subject: s.outreach.subject, body: s.outreach.body,
        })))
      }
    }

    await supabase.from('property_scans').update({
      status: 'complete', properties_found: scored.length, completed_at: new Date().toISOString(),
    }).eq('id', scan!.id)

    return new Response(JSON.stringify({
      scan_id: scan!.id, source: RENTCAST_API_KEY ? 'rentcast' : 'mock',
      count: scored.length,
      results: scored.map(s => ({ ...s.p, fit_score: s.fit, motivation_score: s.motivation, reasons: s.reasons, deal_math: s.deal, outreach: s.outreach, signals: s.signals })),
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (e) {
    await supabase.from('property_scans').update({ status: 'error', error: String(e) }).eq('id', scan!.id)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
  }
})
