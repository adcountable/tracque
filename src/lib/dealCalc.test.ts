import { describe, it, expect } from 'vitest'
import { houseWholesale, landDeal, sellerFinanceBuy } from './dealCalc'

describe('houseWholesale (70% rule)', () => {
  it('computes MAO = ARV×0.70 − repairs − fee', () => {
    const r = houseWholesale({ arv: 300000, repairs: 40000, target_fee: 10000 })
    expect(r.investor_ceiling).toBe(170000)   // 210000 − 40000
    expect(r.mao).toBe(160000)
  })
  it('go when contract price leaves the target fee', () => {
    const r = houseWholesale({ arv: 300000, repairs: 40000, target_fee: 10000, contract_price: 155000 })
    expect(r.fee_at_contract).toBe(15000)
    expect(r.detail.verdict).toBe('go')
  })
  it('no_go when repairs kill the spread', () => {
    const r = houseWholesale({ arv: 200000, repairs: 150000, target_fee: 10000 })
    expect(r.detail.verdict).toBe('no_go')
  })
  it('thin when the fee is positive but under target', () => {
    const r = houseWholesale({ arv: 300000, repairs: 40000, target_fee: 10000, contract_price: 165000 })
    expect(r.fee_at_contract).toBe(5000)
    expect(r.detail.verdict).toBe('thin')
  })
})

describe('landDeal', () => {
  it('spread = resale − contract − costs and go over minimum', () => {
    const r = landDeal({ market_value: 100000, contract_price: 55000, buildable: true })
    expect(r.resale_price).toBe(92000)
    expect(r.spread).toBe(92000 - 55000 - r.closing_costs)
    expect(r.detail.verdict).toBe('go')
  })
  it('non-buildable resells at a discount', () => {
    const b = landDeal({ market_value: 100000, contract_price: 55000, buildable: true })
    const nb = landDeal({ market_value: 100000, contract_price: 55000, buildable: false })
    expect(nb.resale_price).toBeLessThan(b.resale_price)
  })
  it('no_go on a thin contract', () => {
    const r = landDeal({ market_value: 100000, contract_price: 89000 })
    expect(r.detail.verdict).toBe('no_go')
  })
  it('warns when contracting above 70% of market', () => {
    const r = landDeal({ market_value: 100000, contract_price: 80000 })
    expect(r.detail.notes.join(' ')).toMatch(/70%/)
  })
})

describe('sellerFinanceBuy', () => {
  it('amortizes and compares to budget and rent', () => {
    const r = sellerFinanceBuy({
      price: 400000, down_pct: 0.15, rate: 6, term_years: 30,
      taxes_insurance_monthly: 320, market_rent: 2400, monthly_budget: 2600,
    })
    // P&I on 340k @6%/30yr ≈ 2038
    expect(r.monthly_pi).toBeGreaterThan(2000)
    expect(r.monthly_pi).toBeLessThan(2080)
    expect(r.monthly_total).toBe(r.monthly_pi + 320)
    expect(['go', 'thin']).toContain(r.detail.verdict)
  })
  it('no_go when clearly over budget', () => {
    const r = sellerFinanceBuy({
      price: 700000, down_pct: 0.1, rate: 7, term_years: 30,
      taxes_insurance_monthly: 500, market_rent: 3000, monthly_budget: 2500,
    })
    expect(r.detail.verdict).toBe('no_go')
  })
  it('zero-rate edge case amortizes linearly', () => {
    const r = sellerFinanceBuy({
      price: 120000, down_pct: 0, rate: 0, term_years: 10,
      taxes_insurance_monthly: 0, market_rent: 1500, monthly_budget: 1500,
    })
    expect(r.monthly_pi).toBe(1000)
  })
})
