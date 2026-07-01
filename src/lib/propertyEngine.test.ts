import { describe, it, expect } from 'vitest'
import {
  generateNashvilleProperties, scoreProperty, runScan, type ScanParams, type Property,
} from './propertyEngine'

const baseParams: ScanParams = {
  strategy: 'seller_finance', max_price: 900000, min_beds: 1, monthly_budget: 4000, buyer_name: 'John',
}

describe('generateNashvilleProperties', () => {
  it('is deterministic for a given seed', () => {
    const a = generateNashvilleProperties(10, 7)
    const b = generateNashvilleProperties(10, 7)
    expect(a).toEqual(b)
  })

  it('produces Nashville TN properties', () => {
    const props = generateNashvilleProperties(12, 1)
    expect(props).toHaveLength(12)
    for (const p of props) {
      expect(p.state).toBe('TN')
      expect(p.city).toBe('Nashville')
      expect(p.list_price).toBeGreaterThan(0)
    }
  })
})

describe('seller_finance scoring', () => {
  it('scores a free-and-clear, long-tenure, motivated owner higher than a fresh financed listing', () => {
    const strong: Property = {
      ...generateNashvilleProperties(1, 1)[0],
      has_open_mortgage: false, ownership_years: 18, owner_occupied: false, owner_out_of_state: true,
      days_on_market: 140, price_cut_count: 2, total_price_cut_pct: 6, distress_flags: ['preforeclosure'],
    }
    const weak: Property = {
      ...generateNashvilleProperties(1, 2)[0],
      has_open_mortgage: true, ownership_years: 2, owner_occupied: true, owner_out_of_state: false,
      days_on_market: 8, price_cut_count: 0, total_price_cut_pct: 0, distress_flags: [],
    }
    const s1 = scoreProperty(strong, baseParams)
    const s2 = scoreProperty(weak, baseParams)
    expect(s1.fit_score).toBeGreaterThan(s2.fit_score)
    expect(s1.fit_score).toBeGreaterThanOrEqual(80)
    expect(s1.reasons.join(' ')).toContain('free & clear')
  })
})

describe('subject_to scoring', () => {
  it('rewards a low-rate 2020-21 vintage loan', () => {
    const golden: Property = {
      ...generateNashvilleProperties(1, 3)[0],
      has_open_mortgage: true, mortgage_origination_year: 2021, mortgage_rate_est: 2.8,
      est_mortgage_balance: 240000, avm_value: 400000, days_on_market: 90,
    }
    const s = scoreProperty(golden, { ...baseParams, strategy: 'subject_to' })
    expect(s.fit_score).toBeGreaterThanOrEqual(60)
    expect(s.reasons.join(' ')).toMatch(/Low interest rate|sub-3%/)
    // subject_to deal math should finance the existing balance, not 90% of list
    expect(s.deal_math.financed_amount).toBe(240000)
  })
})

describe('runScan', () => {
  it('returns results sorted by fit_score descending and respects filters', () => {
    const results = runScan({ ...baseParams, max_price: 500000, min_beds: 3 })
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].fit_score).toBeGreaterThanOrEqual(results[i].fit_score)
    }
    for (const r of results) {
      expect(r.property.list_price).toBeLessThanOrEqual(500000)
      expect(r.property.beds).toBeGreaterThanOrEqual(3)
    }
  })

  it('drafts agent outreach containing the address and buyer name', () => {
    const [top] = runScan(baseParams)
    expect(top.outreach.body).toContain(top.property.address)
    expect(top.outreach.body).toContain('John')
  })
})
