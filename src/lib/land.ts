// ============================================================
// Tracque — Land flipping / wholesale engine
// ============================================================
// PRINCIPAL wholesaling only: you put the parcel under contract (real
// equitable interest), then assign or double-close. This module scores
// motivated land sellers, runs the wholesale spread math, and generates
// Tennessee SB 909 (Public Chapter 72, 2025) disclosures + the mandatory
// 3-business-day assignment notice.
//
// NOT for brokering: marketing property you don't control, or taking a fee
// to connect buyer↔seller without being a principal, is unlicensed
// brokerage in TN. The UI enforces the "you must control it" guardrail.
// Not legal advice — confirm SB 909 mechanics with a TN RE attorney.

export interface LandParcel {
  external_id: string
  apn: string
  location: string           // road / area description (land rarely has a street #)
  county: string
  state: string
  acres: number
  // value
  assessed_value: number
  market_ppa: number         // estimated market $/acre (comps)
  market_value: number       // acres × market_ppa, adjusted for attributes
  asking_price: number | null // if listed; null = off-market
  // attributes that move resale value
  road_access: boolean
  utilities: boolean         // power/water at or near lot
  in_floodplain: boolean
  buildable: boolean         // not all-flood, has access
  // ownership / distress (the motivation)
  owner_name: string
  owner_out_of_state: boolean
  ownership_years: number
  has_open_mortgage: boolean // land is often free & clear
  tax_delinquent: boolean    // the #1 land-flip signal
  distress_flags: string[]
}

export interface WholesaleMath {
  market_value: number
  offer_price: number        // what you contract to buy at (% of market)
  offer_pct: number
  resale_price: number       // quick-sale exit
  closing_costs: number
  gross_spread: number       // resale − offer − costs
  assignment_fee: number     // your target fee (the spread, principal)
}

export interface LandScore {
  parcel: LandParcel
  fit_score: number          // 0–100 (motivation + flip-ability)
  reasons: string[]
  math: WholesaleMath
}

// ── Deterministic RNG (stable demo) ────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ROADS = ['Old Clarksville Pike', 'Cane Ridge Rd', 'Couchville Pike', 'Burkitt Rd',
  'Sawyer Brown Rd', 'Whites Creek Pike', 'Pettus Rd', 'Une Rd', 'Bidwell Rd', 'Lickton Pike']
const COUNTIES = ['Davidson', 'Wilson', 'Rutherford', 'Cheatham', 'Robertson', 'Sumner', 'Maury']
const FIRST = ['Earl', 'Wanda', 'Cletus', 'Marge', 'Roy', 'Estelle', 'Hank', 'Dolores', 'Vernon', 'Opal']
const LAST = ['Tackett', 'Hollis', 'Crowder', 'Pruitt', 'Ferris', 'Stroud', 'Beasley', 'Vance', 'Ott', 'Rledge']

// ── Market-ish mock generator ──────────────────────────────
export function generateLandParcels(count = 18, seed = 77): LandParcel[] {
  const rnd = mulberry32(seed)
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const btw = (lo: number, hi: number) => lo + rnd() * (hi - lo)
  const year = 2026
  const out: LandParcel[] = []

  for (let i = 0; i < count; i++) {
    const acres = +btw(0.4, 25).toFixed(2)
    const county = pick(COUNTIES)
    // Rural land $/acre bands; closer-in counties pricier.
    const basePpa = county === 'Davidson' ? btw(28000, 90000)
      : county === 'Wilson' || county === 'Rutherford' || county === 'Sumner' ? btw(14000, 45000)
      : btw(6000, 22000)
    const road = rnd() > 0.25
    const utilities = road && rnd() > 0.4
    const flood = rnd() > 0.82
    const buildable = road && !flood
    // Attribute adjustments to market value.
    let ppa = basePpa
    if (!road) ppa *= 0.55
    if (!utilities) ppa *= 0.85
    if (flood) ppa *= 0.6
    ppa = Math.round(ppa / 100) * 100
    const marketValue = Math.round((acres * ppa) / 500) * 500

    const own = Math.floor(btw(2, 34))
    const outOfState = rnd() > 0.5   // land skews absentee/inherited
    const taxDelinquent = rnd() > 0.72
    const freeClear = rnd() > 0.35   // land often owned free & clear
    const listed = rnd() > 0.55
    const askingPpa = ppa * btw(0.9, 1.25)
    const asking = listed ? Math.round((acres * askingPpa) / 500) * 500 : null

    const flags: string[] = []
    if (taxDelinquent) flags.push('tax_delinquent')
    if (outOfState) flags.push('out_of_state_owner')
    if (own > 25) flags.push('long_tenure')

    out.push({
      external_id: `LAND-${(seed * 1000 + i).toString(36).toUpperCase()}`,
      apn: `${Math.floor(btw(10, 180))}-${Math.floor(btw(100, 999))}-${Math.floor(btw(1, 99))}`,
      location: `${Math.floor(btw(0, 9))} parcel off ${pick(ROADS)}`,
      county, state: 'TN', acres,
      assessed_value: Math.round((marketValue * btw(0.5, 0.85)) / 500) * 500,
      market_ppa: ppa, market_value: marketValue, asking_price: asking,
      road_access: road, utilities, in_floodplain: flood, buildable,
      owner_name: `${pick(FIRST)} ${pick(LAST)}`,
      owner_out_of_state: outOfState, ownership_years: own,
      has_open_mortgage: !freeClear, tax_delinquent: taxDelinquent,
      distress_flags: flags,
    })
  }
  return out
}

// ── Wholesale math ─────────────────────────────────────────
// Land wholesalers buy low (a % of market) and resell near market, keeping
// the spread as an assignment fee. Offer % is lower for harder-to-move land.
export function wholesaleMath(p: LandParcel, offerPctOverride?: number): WholesaleMath {
  // Base offer 55% of market; adjust for how sellable the exit is.
  let offerPct = offerPctOverride ?? 0.55
  if (!offerPctOverride) {
    if (!p.road_access) offerPct -= 0.10
    if (p.in_floodplain) offerPct -= 0.08
    if (p.tax_delinquent) offerPct -= 0.05   // more motivated → buy cheaper
    offerPct = Math.max(0.3, Math.min(0.7, offerPct))
  }
  const offer = Math.round((p.market_value * offerPct) / 500) * 500
  // Resale: quick sale slightly under market (buildable land holds value better).
  const resalePct = p.buildable ? 0.92 : 0.82
  const resale = Math.round((p.market_value * resalePct) / 500) * 500
  const closing = Math.round((offer * 0.03 + resale * 0.03) / 100) * 100  // both legs ~3%
  const spread = resale - offer - closing
  return {
    market_value: p.market_value, offer_price: offer, offer_pct: +(offerPct).toFixed(2),
    resale_price: resale, closing_costs: closing, gross_spread: spread,
    assignment_fee: Math.max(0, spread),
  }
}

// ── Scorer ─────────────────────────────────────────────────
export function scoreLand(p: LandParcel): LandScore {
  const reasons: string[] = []
  let fit = 0
  if (p.tax_delinquent) { fit += 28; reasons.push('Tax delinquent — top land-flip motivation signal') }
  if (p.owner_out_of_state) { fit += 24; reasons.push('Out-of-state owner — often forgotten/inherited land') }
  if (p.ownership_years >= 20) { fit += 16; reasons.push(`Owned ${p.ownership_years} yrs — long-held, low basis`) }
  else if (p.ownership_years >= 10) { fit += 8; reasons.push(`Owned ${p.ownership_years} yrs`) }
  if (!p.has_open_mortgage) { fit += 10; reasons.push('Free & clear — no lien to clear at close') }
  // Flip-ability: buildable land actually resells.
  if (p.buildable) { fit += 14; reasons.push('Buildable (road access, not floodplain) — resells fast') }
  else { reasons.push(p.in_floodplain ? 'In floodplain — discount, slower resale' : 'No road access — landlocked, harder exit') }
  // Spread has to be worth doing.
  const math = wholesaleMath(p)
  if (math.assignment_fee >= 8000) { fit += 12; reasons.push(`Workable spread — ~$${Math.round(math.assignment_fee / 1000)}k assignment fee`) }
  else reasons.push(`Thin spread (~$${Math.round(math.assignment_fee / 1000)}k) — low priority`)
  return { parcel: p, fit_score: Math.min(100, fit), reasons, math }
}

export function runLandScan(seed = 77): LandScore[] {
  return generateLandParcels(20, seed).map(scoreLand).sort((a, b) => b.fit_score - a.fit_score)
}

// ============================================================
// Tennessee SB 909 (2025) — wholesaling disclosures
// ============================================================
// Three required disclosures + a 3-business-day assignment notice. These
// generate the text; a TN attorney should review your actual contracts.

export interface DealParties {
  wholesaler: string
  seller: string
  end_buyer?: string
  property: string           // location / APN
  contract_date: string      // ISO date the purchase contract is signed
}

// Add N business days (skip Sat/Sun). Holidays not accounted for — verify.
export function addBusinessDays(fromISO: string, n: number): string {
  const d = new Date(fromISO + 'T12:00:00')
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return d.toISOString().slice(0, 10)
}

// Earliest date an assignment may take effect: ≥3 business days after notice.
export function earliestAssignmentDate(noticeISO: string): string {
  return addBusinessDays(noticeISO, 3)
}

// (1) To the SELLER, before the purchase contract is signed.
export function intentToAssignDisclosure(p: DealParties): string {
  return `NOTICE OF EQUITABLE INTEREST AND INTENT TO ASSIGN (TN SB 909 / Pub. Ch. 72)

To: ${p.seller} (Seller)
Property: ${p.property}
Date: ${p.contract_date}

${p.wholesaler} ("Buyer") is entering into a contract to purchase the above property. Buyer is acquiring an EQUITABLE INTEREST (a contractual right to purchase), and Buyer is NOT the current owner of the property.

Buyer intends to MARKET AND ASSIGN this contract / equitable interest to a subsequent purchaser, and may profit from that assignment. Buyer will provide at least three (3) business days' written notice before any assignment takes effect.

Seller acknowledges receiving this disclosure before signing the purchase contract.`
}

// (2) To the END BUYER: nature of the equitable interest.
export function equitableInterestDisclosure(p: DealParties): string {
  return `DISCLOSURE OF EQUITABLE INTEREST (TN SB 909 / Pub. Ch. 72)

To: ${p.end_buyer ?? '[End Buyer]'}
Property: ${p.property}

${p.wholesaler} holds an EQUITABLE INTEREST in the above property under a purchase contract dated ${p.contract_date}. ${p.wholesaler} is NOT the record owner. What is being offered to you is an ASSIGNMENT of ${p.wholesaler}'s contractual right to purchase — not a direct sale of the property by its owner.`
}

// (3) The 3-business-day assignment notice to the seller.
export function assignmentNotice(p: DealParties, noticeDateISO: string): { text: string; effective_on: string } {
  const eff = earliestAssignmentDate(noticeDateISO)
  return {
    effective_on: eff,
    text: `NOTICE OF ASSIGNMENT (TN SB 909 / Pub. Ch. 72)

To: ${p.seller} (Seller)
Property: ${p.property}
Notice date: ${noticeDateISO}

${p.wholesaler} will ASSIGN the purchase contract for the above property to a subsequent purchaser. Per TN law, this assignment will not take effect until at least three (3) business days after the date of this notice.

Earliest effective date of assignment: ${eff}.`,
  }
}
