// Tracque — Davidson County (Nashville) public-records adapter
// ============================================================
// Enriches a listing with owner + assessment data from Metro Nashville's
// free ArcGIS parcel service (no API key). This fills the ownership
// signals RentCast can't: owner name, mailing state (→ out-of-state /
// absentee), assessed value, and land use.
//
// HONEST LIMITATION: mortgage/deed-of-trust liens are NOT in the parcel
// layer — "free & clear" ground truth lives in the Register of Deeds,
// which has no clean free API. So has_open_mortgage stays UNKNOWN here
// unless a paid records provider (ATTOM/BatchData) or a Register-of-Deeds
// scraper is wired in. We flag it rather than guess.
//
// Endpoint (overridable via env DAVIDSON_PARCELS_URL):
//   https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer/0/query

const PARCELS_URL = Deno.env.get('DAVIDSON_PARCELS_URL')
  ?? 'https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer/0/query'

export interface CountyEnrichment {
  owner_name: string | null
  owner_mailing_state: string | null
  owner_out_of_state: boolean | null
  assessed_value: number | null
  land_use: string | null
  last_sale_price: number | null
  last_sale_year: number | null
  matched: boolean
}

// Parcel schemas vary; probe common field-name variants so the adapter
// survives a schema rename without code changes.
function firstField(attrs: Record<string, unknown>, candidates: string[]): unknown {
  const keys = Object.keys(attrs)
  for (const c of candidates) {
    const hit = keys.find(k => k.toUpperCase() === c.toUpperCase())
    if (hit != null && attrs[hit] != null && attrs[hit] !== '') return attrs[hit]
  }
  return null
}

function esc(s: string): string { return s.replace(/'/g, "''") }

export async function enrichFromDavidsonCounty(address: string): Promise<CountyEnrichment> {
  const empty: CountyEnrichment = {
    owner_name: null, owner_mailing_state: null, owner_out_of_state: null,
    assessed_value: null, land_use: null, last_sale_price: null, last_sale_year: null, matched: false,
  }

  // Match on house number + street name (uppercased), tolerant LIKE.
  const m = address.match(/^(\d+)\s+(.+)$/)
  if (!m) return empty
  const [, num, street] = m
  const streetName = street.replace(/\b(dr|rd|st|ave|blvd|ln|pike|ct|pl|way)\b\.?/gi, '').trim()

  // Try likely address field names in the WHERE clause.
  const addrFields = ['PropAddr', 'PropLocation', 'PropStreet', 'LOCADDR', 'SITEADDRESS', 'ADDRESS']
  for (const field of addrFields) {
    const where = `UPPER(${field}) LIKE '%${esc(num)} ${esc(streetName).toUpperCase()}%'`
    const url = `${PARCELS_URL}?where=${encodeURIComponent(where)}&outFields=*&returnGeometry=false&resultRecordCount=1&f=json`
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      if (data?.error) continue                    // field doesn't exist on this layer → try next
      const feat = data?.features?.[0]
      if (!feat?.attributes) continue

      const a = feat.attributes as Record<string, unknown>
      const mailState = firstField(a, ['MailState', 'OwnState', 'OWNERSTATE', 'MAIL_STATE']) as string | null
      const saleDate = firstField(a, ['SaleDate', 'LastSaleDate', 'SALEDT'])
      let saleYear: number | null = null
      if (typeof saleDate === 'number') saleYear = new Date(saleDate).getUTCFullYear()   // epoch ms
      else if (typeof saleDate === 'string') { const y = parseInt(saleDate.slice(0, 4), 10); if (y > 1900) saleYear = y }

      return {
        owner_name: (firstField(a, ['OwnerName', 'OWNER', 'OWNER1', 'Owner']) as string | null) ?? null,
        owner_mailing_state: mailState ?? null,
        owner_out_of_state: mailState ? mailState.trim().toUpperCase() !== 'TN' : null,
        assessed_value: (firstField(a, ['TotlAppr', 'TotalAppr', 'ApprTotal', 'ASSESSEDVALUE', 'TOTALVALUE']) as number | null) ?? null,
        land_use: (firstField(a, ['LandUse', 'LUC', 'LandUseDesc']) as string | null) ?? null,
        last_sale_price: (firstField(a, ['SalePrice', 'LastSalePrice', 'SALEPRICE']) as number | null) ?? null,
        last_sale_year: saleYear,
        matched: true,
      }
    } catch {
      // network/parse failure — try next field name, then fall through to empty
    }
  }
  return empty
}
