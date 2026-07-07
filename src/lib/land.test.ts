import { describe, it, expect } from 'vitest'
import {
  generateLandParcels, wholesaleMath, scoreLand, runLandScan,
  addBusinessDays, earliestAssignmentDate, assignmentNotice, intentToAssignDisclosure,
  type LandParcel, type DealParties,
} from './land'

describe('land generator', () => {
  it('is deterministic for a seed', () => {
    expect(generateLandParcels(8, 3)).toEqual(generateLandParcels(8, 3))
  })
  it('produces TN parcels with acreage and value', () => {
    for (const p of generateLandParcels(12, 1)) {
      expect(p.state).toBe('TN')
      expect(p.acres).toBeGreaterThan(0)
      expect(p.market_value).toBeGreaterThan(0)
    }
  })
})

describe('wholesale math', () => {
  const base: LandParcel = {
    ...generateLandParcels(1, 5)[0],
    market_value: 100000, road_access: true, in_floodplain: false, buildable: true, tax_delinquent: false,
  }
  it('offer is a discount, spread is resale − offer − costs', () => {
    const m = wholesaleMath(base)
    expect(m.offer_price).toBeLessThan(m.market_value)
    expect(m.gross_spread).toBe(m.resale_price - m.offer_price - m.closing_costs)
  })
  it('harder-to-exit land gets a lower offer %', () => {
    const easy = wholesaleMath({ ...base, road_access: true, in_floodplain: false })
    const hard = wholesaleMath({ ...base, road_access: false, in_floodplain: true, tax_delinquent: true })
    expect(hard.offer_pct).toBeLessThan(easy.offer_pct)
  })
})

describe('land scoring', () => {
  it('ranks a tax-delinquent, out-of-state, free-and-clear, buildable parcel high', () => {
    const strong: LandParcel = {
      ...generateLandParcels(1, 2)[0],
      tax_delinquent: true, owner_out_of_state: true, ownership_years: 26,
      has_open_mortgage: false, road_access: true, in_floodplain: false, buildable: true,
      market_value: 120000,
    }
    const s = scoreLand(strong)
    expect(s.fit_score).toBeGreaterThanOrEqual(75)
    expect(s.reasons.join(' ')).toMatch(/Tax delinquent/)
  })
  it('runLandScan sorts by fit desc', () => {
    const r = runLandScan()
    for (let i = 1; i < r.length; i++) expect(r[i - 1].fit_score).toBeGreaterThanOrEqual(r[i].fit_score)
  })
})

describe('SB 909 disclosures', () => {
  const parties: DealParties = {
    wholesaler: 'John Buyer', seller: 'Earl Tackett', end_buyer: 'Acme Land LLC',
    property: 'APN 12-345-6 off Cane Ridge Rd', contract_date: '2026-07-06',
  }
  it('adds business days skipping weekends', () => {
    // 2026-07-03 is a Friday → +3 business days = Wed 2026-07-08
    expect(addBusinessDays('2026-07-03', 3)).toBe('2026-07-08')
  })
  it('earliest assignment date is ≥3 business days out', () => {
    // Monday 2026-07-06 → Thu 2026-07-09
    expect(earliestAssignmentDate('2026-07-06')).toBe('2026-07-09')
  })
  it('intent-to-assign disclosure names both parties and the statute', () => {
    const t = intentToAssignDisclosure(parties)
    expect(t).toContain('Earl Tackett')
    expect(t).toContain('EQUITABLE INTEREST')
    expect(t).toMatch(/SB 909/)
    expect(t).toMatch(/three \(3\) business days/)
  })
  it('assignment notice computes the effective date', () => {
    const n = assignmentNotice(parties, '2026-07-06')
    expect(n.effective_on).toBe('2026-07-09')
    expect(n.text).toContain('2026-07-09')
  })
})
