import { describe, it, expect } from 'vitest'
import { TOP_COUNTIES, countiesByState, countyByFips, totalCoveredPopulation } from './counties'

describe('county registry', () => {
  it('has valid 5-digit FIPS codes', () => {
    for (const c of TOP_COUNTIES) expect(c.fips).toMatch(/^\d{5}$/)
  })
  it('FIPS codes are unique', () => {
    const set = new Set(TOP_COUNTIES.map(c => c.fips))
    expect(set.size).toBe(TOP_COUNTIES.length)
  })
  it('is sorted by population descending', () => {
    for (let i = 1; i < TOP_COUNTIES.length; i++) {
      expect(TOP_COUNTIES[i - 1].population).toBeGreaterThanOrEqual(TOP_COUNTIES[i].population)
    }
  })
  it('includes the home county (Davidson, TN)', () => {
    const d = countyByFips('47037')
    expect(d?.name).toBe('Davidson')
    expect(d?.state).toBe('TN')
  })
  it('countiesByState filters correctly', () => {
    const tx = countiesByState('TX')
    expect(tx.length).toBeGreaterThanOrEqual(4)
    expect(tx.every(c => c.state === 'TX')).toBe(true)
  })
  it('covers tens of millions of people', () => {
    expect(totalCoveredPopulation()).toBeGreaterThan(50_000_000)
  })
})
