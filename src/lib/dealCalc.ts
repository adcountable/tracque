// ============================================================
// Tracque — Deal Calculator (the go/no-go money math)
// ============================================================
// Turns a lead into a decision. Three calculators:
//   1. House wholesale — MAO via the 70% rule, assignment fee, verdict
//   2. Land wholesale  — offer % of market value, spread, verdict
//   3. Seller-finance buy — monthly PITI vs budget/rent, verdict
// Pure math, no I/O. Conservative by default: bad deals should fail here,
// not at the closing table.

export type Verdict = 'go' | 'thin' | 'no_go'

export interface VerdictDetail {
  verdict: Verdict
  headline: string
  notes: string[]
}

const money = (n: number) => '$' + Math.round(n).toLocaleString()

// ── 1. House wholesale (70% rule / MAO) ────────────────────
// MAO = ARV × ruleFactor − repairs − yourFee. You contract at ≤ MAO and
// assign to a flipper who still clears their margin.

export interface HouseWholesaleInput {
  arv: number               // after-repair value
  repairs: number           // estimated rehab cost
  target_fee: number        // the assignment fee you want
  rule_factor?: number      // investor discount, default 0.70
  contract_price?: number   // what you think you can contract at (optional)
}

export interface HouseWholesaleResult {
  mao: number               // max allowable offer (your ceiling)
  investor_ceiling: number  // what the end-buyer can pay (ARV×factor − repairs)
  fee_at_contract: number | null  // fee if you contract at contract_price
  detail: VerdictDetail
}

export function houseWholesale(i: HouseWholesaleInput): HouseWholesaleResult {
  const factor = i.rule_factor ?? 0.7
  const investorCeiling = i.arv * factor - i.repairs
  const mao = investorCeiling - i.target_fee
  const feeAtContract = i.contract_price != null ? investorCeiling - i.contract_price : null

  const notes: string[] = [
    `End-buyer ceiling: ${money(investorCeiling)} (ARV ${money(i.arv)} × ${Math.round(factor * 100)}% − repairs ${money(i.repairs)})`,
    `Your max offer (MAO): ${money(mao)} to keep a ${money(i.target_fee)} fee`,
  ]

  let verdict: Verdict
  let headline: string
  if (mao <= 0) {
    verdict = 'no_go'
    headline = 'No room — repairs eat the whole spread at this ARV.'
  } else if (feeAtContract != null) {
    if (feeAtContract >= i.target_fee) { verdict = 'go'; headline = `Contract at ${money(i.contract_price!)} → ~${money(feeAtContract)} assignment fee.` }
    else if (feeAtContract >= 3000) { verdict = 'thin'; headline = `Fee at this price is ~${money(feeAtContract)} — below your ${money(i.target_fee)} target.` }
    else { verdict = 'no_go'; headline = `Fee at this price is ~${money(feeAtContract)} — not worth the risk.` }
    notes.push(`At your contract price of ${money(i.contract_price!)}, the spread to the end-buyer ceiling is ${money(feeAtContract)}.`)
  } else {
    verdict = mao >= 20000 ? 'go' : mao >= 5000 ? 'thin' : 'no_go'
    headline = `Offer at or below ${money(mao)}.`
  }
  return { mao: Math.round(mao), investor_ceiling: Math.round(investorCeiling), fee_at_contract: feeAtContract != null ? Math.round(feeAtContract) : null, detail: { verdict, headline, notes } }
}

// ── 2. Land wholesale ──────────────────────────────────────

export interface LandDealInput {
  market_value: number
  contract_price: number
  buildable?: boolean       // affects resale %, default true
  closing_cost_pct?: number // both legs combined, default 0.06
  min_fee?: number          // default 8000
}

export interface LandDealResult {
  resale_price: number
  closing_costs: number
  spread: number
  detail: VerdictDetail
}

export function landDeal(i: LandDealInput): LandDealResult {
  const resalePct = (i.buildable ?? true) ? 0.92 : 0.82
  const resale = i.market_value * resalePct
  const costs = (i.contract_price + resale) * ((i.closing_cost_pct ?? 0.06) / 2)
  const spread = resale - i.contract_price - costs
  const minFee = i.min_fee ?? 8000
  const pctOfMarket = i.market_value > 0 ? i.contract_price / i.market_value : 1

  const notes = [
    `Quick-sale resale: ${money(resale)} (${Math.round(resalePct * 100)}% of market)`,
    `Your contract is ${Math.round(pctOfMarket * 100)}% of market value`,
    `Closing costs (both legs): ~${money(costs)}`,
  ]
  let verdict: Verdict; let headline: string
  if (spread >= minFee) { verdict = 'go'; headline = `~${money(spread)} spread — clears your ${money(minFee)} minimum.` }
  else if (spread >= minFee * 0.5) { verdict = 'thin'; headline = `~${money(spread)} spread — under your minimum; renegotiate or pass.` }
  else { verdict = 'no_go'; headline = `~${money(spread)} spread — not worth doing.` }
  if (pctOfMarket > 0.7) notes.push('Contracting above 70% of market rarely leaves an assignable spread.')
  return { resale_price: Math.round(resale), closing_costs: Math.round(costs), spread: Math.round(spread), detail: { verdict, headline, notes } }
}

// ── 3. Seller-finance buy (for your own house) ─────────────

export interface SellerFinanceInput {
  price: number
  down_pct: number          // 0–1
  rate: number              // annual %
  term_years: number
  taxes_insurance_monthly: number
  market_rent: number
  monthly_budget: number
}

export interface SellerFinanceResult {
  down_payment: number
  monthly_pi: number
  monthly_total: number
  vs_rent: number           // negative = cheaper than renting
  detail: VerdictDetail
}

export function sellerFinanceBuy(i: SellerFinanceInput): SellerFinanceResult {
  const down = i.price * i.down_pct
  const principal = i.price - down
  const r = i.rate / 100 / 12
  const n = i.term_years * 12
  const pi = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n))
  const total = pi + i.taxes_insurance_monthly
  const vsRent = total - i.market_rent

  const notes = [
    `Down: ${money(down)} (${Math.round(i.down_pct * 100)}%) · financed ${money(principal)} at ${i.rate}% / ${i.term_years}yr`,
    `Monthly P&I ${money(pi)} + taxes/ins ${money(i.taxes_insurance_monthly)} = ${money(total)}`,
    vsRent <= 0 ? `${money(Math.abs(vsRent))}/mo cheaper than renting (${money(i.market_rent)})` : `${money(vsRent)}/mo above market rent (${money(i.market_rent)})`,
  ]
  let verdict: Verdict; let headline: string
  if (total <= i.monthly_budget && vsRent <= 200) { verdict = 'go'; headline = `${money(total)}/mo — within budget and near/below rent parity.` }
  else if (total <= i.monthly_budget * 1.1) { verdict = 'thin'; headline = `${money(total)}/mo — close to budget; negotiate rate/term/price.` }
  else { verdict = 'no_go'; headline = `${money(total)}/mo — over budget (${money(i.monthly_budget)}).` }
  return { down_payment: Math.round(down), monthly_pi: Math.round(pi), monthly_total: Math.round(total), vs_rent: Math.round(vsRent), detail: { verdict, headline, notes } }
}
