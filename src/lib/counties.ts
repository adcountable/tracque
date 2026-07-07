// ============================================================
// Tracque — US county registry (national off-market sweep targets)
// ============================================================
// County records surface DISTRESSED, UNLISTED homes — tax-delinquent,
// absentee, free-and-clear owners who never put a sign up. To run that
// nationally you sweep county-by-county.
//
// Reality check: there is NO single free national parcel API. Each county
// publishes differently. National coverage comes from ONE provider
// (Regrid / ReportAll) keyed off county FIPS — see functions/national-sweep.
//
// This is a seed of the largest counties by population (accurate FIPS +
// state; populations rounded, ~2023 estimates). The full top-decile
// (~314 counties ≈ 73% of US population) is generated from Census data at
// deploy time; these ~40 are the initial sweep set and cover the biggest
// metros. `sortBy: population desc`.

export interface County {
  fips: string       // 5-digit county FIPS (state + county)
  name: string
  state: string      // 2-letter
  metro: string
  population: number  // rounded estimate
}

export const TOP_COUNTIES: County[] = [
  { fips: '06037', name: 'Los Angeles', state: 'CA', metro: 'Los Angeles', population: 9700000 },
  { fips: '17031', name: 'Cook', state: 'IL', metro: 'Chicago', population: 5100000 },
  { fips: '48201', name: 'Harris', state: 'TX', metro: 'Houston', population: 4780000 },
  { fips: '04013', name: 'Maricopa', state: 'AZ', metro: 'Phoenix', population: 4500000 },
  { fips: '06073', name: 'San Diego', state: 'CA', metro: 'San Diego', population: 3280000 },
  { fips: '06059', name: 'Orange', state: 'CA', metro: 'Los Angeles', population: 3150000 },
  { fips: '12086', name: 'Miami-Dade', state: 'FL', metro: 'Miami', population: 2670000 },
  { fips: '48113', name: 'Dallas', state: 'TX', metro: 'Dallas–Fort Worth', population: 2610000 },
  { fips: '36047', name: 'Kings (Brooklyn)', state: 'NY', metro: 'New York', population: 2590000 },
  { fips: '06065', name: 'Riverside', state: 'CA', metro: 'Riverside–San Bernardino', population: 2450000 },
  { fips: '36081', name: 'Queens', state: 'NY', metro: 'New York', population: 2270000 },
  { fips: '32003', name: 'Clark', state: 'NV', metro: 'Las Vegas', population: 2320000 },
  { fips: '53033', name: 'King', state: 'WA', metro: 'Seattle', population: 2270000 },
  { fips: '06071', name: 'San Bernardino', state: 'CA', metro: 'Riverside–San Bernardino', population: 2180000 },
  { fips: '48439', name: 'Tarrant', state: 'TX', metro: 'Dallas–Fort Worth', population: 2110000 },
  { fips: '48029', name: 'Bexar', state: 'TX', metro: 'San Antonio', population: 2050000 },
  { fips: '06085', name: 'Santa Clara', state: 'CA', metro: 'San Jose', population: 1890000 },
  { fips: '12011', name: 'Broward', state: 'FL', metro: 'Miami', population: 1940000 },
  { fips: '26163', name: 'Wayne', state: 'MI', metro: 'Detroit', population: 1770000 },
  { fips: '06001', name: 'Alameda', state: 'CA', metro: 'San Francisco–Oakland', population: 1650000 },
  { fips: '12057', name: 'Hillsborough', state: 'FL', metro: 'Tampa', population: 1510000 },
  { fips: '25017', name: 'Middlesex', state: 'MA', metro: 'Boston', population: 1620000 },
  { fips: '06067', name: 'Sacramento', state: 'CA', metro: 'Sacramento', population: 1590000 },
  { fips: '12099', name: 'Palm Beach', state: 'FL', metro: 'Miami', population: 1530000 },
  { fips: '36061', name: 'New York (Manhattan)', state: 'NY', metro: 'New York', population: 1600000 },
  { fips: '12095', name: 'Orange', state: 'FL', metro: 'Orlando', population: 1450000 },
  { fips: '36103', name: 'Suffolk', state: 'NY', metro: 'New York', population: 1520000 },
  { fips: '36059', name: 'Nassau', state: 'NY', metro: 'New York', population: 1400000 },
  { fips: '36005', name: 'Bronx', state: 'NY', metro: 'New York', population: 1420000 },
  { fips: '27053', name: 'Hennepin', state: 'MN', metro: 'Minneapolis', population: 1280000 },
  { fips: '39049', name: 'Franklin', state: 'OH', metro: 'Columbus', population: 1320000 },
  { fips: '48453', name: 'Travis', state: 'TX', metro: 'Austin', population: 1310000 },
  { fips: '39035', name: 'Cuyahoga', state: 'OH', metro: 'Cleveland', population: 1240000 },
  { fips: '42003', name: 'Allegheny', state: 'PA', metro: 'Pittsburgh', population: 1230000 },
  { fips: '26125', name: 'Oakland', state: 'MI', metro: 'Detroit', population: 1270000 },
  { fips: '49035', name: 'Salt Lake', state: 'UT', metro: 'Salt Lake City', population: 1190000 },
  { fips: '51059', name: 'Fairfax', state: 'VA', metro: 'Washington DC', population: 1150000 },
  { fips: '37183', name: 'Wake', state: 'NC', metro: 'Raleigh', population: 1170000 },
  { fips: '37119', name: 'Mecklenburg', state: 'NC', metro: 'Charlotte', population: 1140000 },
  { fips: '13121', name: 'Fulton', state: 'GA', metro: 'Atlanta', population: 1070000 },
  { fips: '47157', name: 'Shelby', state: 'TN', metro: 'Memphis', population: 930000 },
  { fips: '47037', name: 'Davidson', state: 'TN', metro: 'Nashville', population: 715000 },
].sort((a, b) => b.population - a.population)

export function countiesByState(state: string): County[] {
  return TOP_COUNTIES.filter(c => c.state.toUpperCase() === state.toUpperCase())
}

export function countyByFips(fips: string): County | undefined {
  return TOP_COUNTIES.find(c => c.fips === fips)
}

export function totalCoveredPopulation(): number {
  return TOP_COUNTIES.reduce((s, c) => s + c.population, 0)
}
