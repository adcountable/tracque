// Tracque — Records / lien provider adapter
// ============================================================
// The outbound stack's missing piece: mortgage-lien + distress ground
// truth that free public parcel/listing data doesn't carry. This is what
// turns the #1 seller-finance signal — FREE & CLEAR — from a guess into a
// fact, plus tax liens and pre-foreclosure.
//
// Provider-agnostic: set RECORDS_PROVIDER + the matching key.
//   RECORDS_PROVIDER = 'attom'      -> ATTOM_API_KEY
//   RECORDS_PROVIDER = 'batchdata'  -> BATCHDATA_API_KEY
// No provider set -> returns "unknown" (caller keeps conservative defaults).
//
// NOTE: exact endpoint paths/field names vary by provider plan and API
// version — verify against your account. Everything is wrapped so a bad
// response degrades to "unknown" instead of breaking the scan.

const PROVIDER = (Deno.env.get('RECORDS_PROVIDER') ?? '').toLowerCase()
const ATTOM_KEY = Deno.env.get('ATTOM_API_KEY')
const BATCHDATA_KEY = Deno.env.get('BATCHDATA_API_KEY')

export interface RecordsEnrichment {
  known: boolean
  has_open_mortgage: boolean | null
  est_mortgage_balance: number | null
  mortgage_origination_year: number | null
  mortgage_rate_est: number | null
  lien_flags: string[]            // 'tax_lien' | 'preforeclosure' | 'judgment'
  last_sale_price: number | null
  last_sale_year: number | null
}

const EMPTY: RecordsEnrichment = {
  known: false, has_open_mortgage: null, est_mortgage_balance: null,
  mortgage_origination_year: null, mortgage_rate_est: null, lien_flags: [],
  last_sale_price: null, last_sale_year: null,
}

export function recordsProviderConfigured(): boolean {
  return (PROVIDER === 'attom' && !!ATTOM_KEY) || (PROVIDER === 'batchdata' && !!BATCHDATA_KEY)
}

export async function enrichFromRecords(address: string): Promise<RecordsEnrichment> {
  try {
    if (PROVIDER === 'attom' && ATTOM_KEY) return await fromAttom(address)
    if (PROVIDER === 'batchdata' && BATCHDATA_KEY) return await fromBatchData(address)
  } catch (e) {
    console.error('records provider failed:', e)
  }
  return EMPTY
}

function yearFrom(dateish: unknown): number | null {
  if (typeof dateish === 'string') { const y = parseInt(dateish.slice(0, 4), 10); return y > 1900 ? y : null }
  if (typeof dateish === 'number') { const y = new Date(dateish).getUTCFullYear(); return y > 1900 ? y : null }
  return null
}

// ── ATTOM ──────────────────────────────────────────────────
// Property detail (owner/mortgage), + pre-foreclosure lookup.
async function fromAttom(address: string): Promise<RecordsEnrichment> {
  const base = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0'
  const headers = { apikey: ATTOM_KEY!, Accept: 'application/json' }
  const q = `address=${encodeURIComponent(address)}`

  const detailRes = await fetch(`${base}/property/detailmortgage?${q}`, { headers })
  const detail = detailRes.ok ? await detailRes.json() : null
  const prop = detail?.property?.[0]

  // Mortgage / lien
  const mortgage = prop?.mortgage?.lender ?? prop?.mortgage ?? null
  const amount = mortgage?.amount ?? prop?.mortgage?.FirstConcurrent?.amount ?? null
  const origDate = mortgage?.date ?? prop?.mortgage?.FirstConcurrent?.date ?? null
  const hasMortgage = amount != null ? Number(amount) > 0 : null

  // Sale history
  const sale = prop?.sale ?? null
  const salePrice = sale?.amount?.saleamt ?? null
  const saleYear = yearFrom(sale?.saleTransDate ?? sale?.salesearchdate)

  // Pre-foreclosure (separate endpoint; ignore if plan lacks it)
  const flags: string[] = []
  try {
    const pfRes = await fetch(`${base}/property/preforeclosuredetails?${q}`, { headers })
    if (pfRes.ok) {
      const pf = await pfRes.json()
      if (pf?.property?.length || pf?.status?.total > 0) flags.push('preforeclosure')
    }
  } catch { /* plan may not include pre-foreclosure */ }

  const rate = origDate ? estimateRate(yearFrom(origDate)) : null
  return {
    known: !!prop,
    has_open_mortgage: hasMortgage,
    est_mortgage_balance: amount != null ? Math.round(Number(amount)) : null,
    mortgage_origination_year: yearFrom(origDate),
    mortgage_rate_est: rate,
    lien_flags: flags,
    last_sale_price: salePrice != null ? Number(salePrice) : null,
    last_sale_year: saleYear,
  }
}

// ── BatchData ──────────────────────────────────────────────
// Single property lookup returns owner + open-lien + foreclosure signals.
async function fromBatchData(address: string): Promise<RecordsEnrichment> {
  const res = await fetch('https://api.batchdata.com/api/v1/property/lookup/all-attributes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${BATCHDATA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ address: { street: address } }] }),
  })
  if (!res.ok) return EMPTY
  const data = await res.json()
  const p = data?.results?.properties?.[0] ?? data?.results?.[0] ?? null
  if (!p) return EMPTY

  const openLien = p?.openLien ?? p?.mortgage ?? null
  const balance = openLien?.totalOpenLienBalance ?? openLien?.estimatedBalance ?? openLien?.amount ?? null
  const hasMortgage = balance != null ? Number(balance) > 0 : (p?.quickLists?.freeAndClear === true ? false : null)

  const flags: string[] = []
  const ql = p?.quickLists ?? {}
  if (ql.taxLien || ql.taxDelinquent) flags.push('tax_lien')
  if (ql.preforeclosure || ql.foreclosure || ql.auction) flags.push('preforeclosure')
  if (ql.judgment) flags.push('judgment')

  const origYear = yearFrom(openLien?.recordingDate ?? openLien?.date)
  return {
    known: true,
    has_open_mortgage: hasMortgage,
    est_mortgage_balance: balance != null ? Math.round(Number(balance)) : null,
    mortgage_origination_year: origYear,
    mortgage_rate_est: origYear ? estimateRate(origYear) : null,
    lien_flags: flags,
    last_sale_price: p?.sale?.lastSale?.price ?? null,
    last_sale_year: yearFrom(p?.sale?.lastSale?.date),
  }
}

// Rate isn't always in records; estimate by origination vintage so the
// subto scorer still works (2020–21 = sub-3% golden vintage).
function estimateRate(year: number | null): number | null {
  if (year == null) return null
  if (year <= 2019) return 4.2
  if (year <= 2021) return 2.9
  if (year <= 2022) return 5.0
  return 6.8
}
