// Tracque — County-wide parcel sweep (off-market lead generation)
// POST /functions/v1/sweep-county
// Body: { user_id, zip?, max_parcels?, min_fit? }
//
// Pages through Metro Nashville's FREE, KEYLESS ArcGIS parcel service and
// scores every residential parcel for OFF-MARKET seller-finance potential —
// absentee/out-of-state owners with long tenure who haven't listed. This is
// the PropStream move on public data: leads exist before a listing does.
//
// Signals available from parcels alone (no listing, no paid data):
//   out-of-state owner (mailing state ≠ TN)   — strongest free absentee proxy
//   ownership tenure (last sale date)          — 15+ yrs = low basis, carry-friendly
//   assessed value band                        — target range, not luxury/teardown
//   very long tenure (25+ yrs)                 — estate/probate-adjacent
// NOT knowable for free: liens (free & clear), owner phone. Those stay null.
//
// Results upsert into `properties` (source 'county', no listing fields) and
// score into `property_scores` under a scan row, so they appear alongside
// on-market candidates in queries and future UI.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const PARCELS_URL = Deno.env.get('DAVIDSON_PARCELS_URL')
  ?? 'https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer/0/query'

const PAGE_SIZE = 1000

function pick(attrs: Record<string, unknown>, candidates: string[]): unknown {
  const keys = Object.keys(attrs)
  for (const c of candidates) {
    const hit = keys.find(k => k.toUpperCase() === c.toUpperCase())
    if (hit != null && attrs[hit] != null && attrs[hit] !== '') return attrs[hit]
  }
  return null
}

function yearFrom(v: unknown): number | null {
  if (typeof v === 'number') { const y = new Date(v).getUTCFullYear(); return y > 1900 ? y : null }
  if (typeof v === 'string') { const y = parseInt(v.slice(0, 4), 10); return y > 1900 ? y : null }
  return null
}

interface SweptParcel {
  parcel_id: string
  address: string
  zip: string
  owner_name: string
  mail_state: string | null
  out_of_state: boolean
  assessed_value: number | null
  last_sale_year: number | null
  last_sale_price: number | null
  ownership_years: number | null
  land_use: string | null
  fit: number
  reasons: string[]
}

function scoreParcel(p: Omit<SweptParcel, 'fit' | 'reasons'>): { fit: number; reasons: string[] } {
  let fit = 0
  const reasons: string[] = []
  if (p.out_of_state) { fit += 35; reasons.push(`Out-of-state owner (${p.mail_state})`) }
  if (p.ownership_years != null) {
    if (p.ownership_years >= 25) { fit += 30; reasons.push(`Owned ${p.ownership_years} yrs — estate/probate-adjacent`) }
    else if (p.ownership_years >= 15) { fit += 25; reasons.push(`Owned ${p.ownership_years} yrs — low basis, carry-friendly`) }
    else if (p.ownership_years >= 10) { fit += 15; reasons.push(`Owned ${p.ownership_years} yrs`) }
  }
  if (p.assessed_value != null && p.assessed_value >= 150_000 && p.assessed_value <= 650_000) {
    fit += 15; reasons.push(`Assessed ~$${Math.round(p.assessed_value / 1000)}k — target band`)
  }
  // Corporate/trust owners often signal investor/estate holdings — mild boost.
  if (/\b(LLC|TRUST|ESTATE|LP|INC)\b/i.test(p.owner_name)) { fit += 10; reasons.push('Entity-owned (LLC/trust/estate)') }
  return { fit: Math.min(100, fit), reasons }
}

async function fetchPage(offset: number, zip: string | null): Promise<Record<string, unknown>[]> {
  const where = zip ? `1=1` : '1=1'   // zip filtered client-side (field name varies)
  const url = `${PARCELS_URL}?where=${encodeURIComponent(where)}&outFields=*&returnGeometry=false` +
    `&resultOffset=${offset}&resultRecordCount=${PAGE_SIZE}&f=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`parcels ${res.status}`)
  const data = await res.json()
  if (data?.error) throw new Error(`parcels: ${JSON.stringify(data.error).slice(0, 200)}`)
  return (data?.features ?? []).map((f: any) => f.attributes)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { user_id, zip = null, max_parcels = 5000, min_fit = 50 } = await req.json()
  if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400 })

  const { data: scan } = await supabase.from('property_scans').insert({
    user_id, market: `Davidson County sweep${zip ? ` (${zip})` : ''}`,
    asset_type: 'sfh', strategy: 'seller_finance',
    params: { zip, max_parcels, min_fit, mode: 'off_market_sweep' }, status: 'running',
  }).select().single()

  const year = new Date().getFullYear()
  const kept: SweptParcel[] = []
  let scanned = 0

  try {
    for (let offset = 0; offset < max_parcels; offset += PAGE_SIZE) {
      const rows = await fetchPage(offset, zip)
      if (!rows.length) break
      scanned += rows.length

      for (const a of rows) {
        const parcelId = String(pick(a, ['ParID', 'ParcelID', 'PIN', 'APN', 'OBJECTID']) ?? '')
        const address = String(pick(a, ['PropAddr', 'PropLocation', 'LOCADDR', 'SITEADDRESS', 'ADDRESS']) ?? '')
        const parcelZip = String(pick(a, ['PropZip', 'SITEZIP', 'ZIP', 'ZIPCODE']) ?? '')
        const owner = String(pick(a, ['OwnerName', 'OWNER', 'OWNER1', 'Owner']) ?? '')
        const landUse = pick(a, ['LandUseDesc', 'LandUse', 'LUC']) as string | null
        if (!parcelId || !address || !owner) continue
        if (zip && parcelZip && parcelZip !== String(zip)) continue
        // Residential-ish filter when land use is available.
        if (landUse && !/RES|SINGLE|DUPLEX|DWELL/i.test(landUse)) continue

        const mailState = (pick(a, ['MailState', 'OwnState', 'OWNERSTATE', 'MAIL_STATE']) as string | null)?.trim().toUpperCase() ?? null
        const saleYear = yearFrom(pick(a, ['SaleDate', 'LastSaleDate', 'SALEDT']))
        const assessed = pick(a, ['TotlAppr', 'TotalAppr', 'ApprTotal', 'ASSESSEDVALUE', 'TOTALVALUE']) as number | null
        const salePrice = pick(a, ['SalePrice', 'LastSalePrice', 'SALEPRICE']) as number | null

        const base = {
          parcel_id: parcelId, address, zip: parcelZip, owner_name: owner,
          mail_state: mailState, out_of_state: mailState != null && mailState !== 'TN',
          assessed_value: assessed != null ? Number(assessed) : null,
          last_sale_year: saleYear, last_sale_price: salePrice != null ? Number(salePrice) : null,
          ownership_years: saleYear != null ? year - saleYear : null,
          land_use: landUse,
        }
        const { fit, reasons } = scoreParcel(base)
        if (fit >= min_fit) kept.push({ ...base, fit, reasons })
      }
      if (rows.length < PAGE_SIZE) break
    }

    kept.sort((a, b) => b.fit - a.fit)

    // Batch upsert as off-market properties + scores.
    if (kept.length) {
      const { data: props } = await supabase.from('properties').upsert(
        kept.map(k => ({
          user_id, external_id: `PARCEL-${k.parcel_id}`, source: 'county', asset_type: 'sfh',
          address: k.address, city: 'Nashville', state: 'TN', zip: k.zip,
          status: 'off_market',
          avm_value: k.assessed_value, last_sale_price: k.last_sale_price,
          last_sale_year: k.last_sale_year, ownership_years: k.ownership_years,
          owner_occupied: k.out_of_state ? false : null,  // out-of-state implies absentee; else unknown
          owner_out_of_state: k.out_of_state, owner_type: k.out_of_state ? 'absentee_out_of_state' : null,
          owner_name: k.owner_name,
          distress_flags: [],
        })),
        { onConflict: 'user_id,source,external_id' },
      ).select('id, external_id')

      const idByExt = new Map((props ?? []).map((p: any) => [p.external_id, p.id]))
      const scoreRows = kept
        .filter(k => idByExt.has(`PARCEL-${k.parcel_id}`))
        .map(k => ({
          scan_id: scan!.id, property_id: idByExt.get(`PARCEL-${k.parcel_id}`),
          strategy: 'seller_finance', fit_score: k.fit, motivation_score: null,
          reasons: k.reasons, signals: null, deal_math: null,
        }))
      if (scoreRows.length) await supabase.from('property_scores').insert(scoreRows)
    }

    await supabase.from('property_scans').update({
      status: 'complete', properties_found: kept.length, completed_at: new Date().toISOString(),
    }).eq('id', scan!.id)

    return new Response(JSON.stringify({
      scan_id: scan!.id, parcels_scanned: scanned, off_market_leads: kept.length,
      top: kept.slice(0, 25).map(k => ({
        address: k.address, zip: k.zip, owner: k.owner_name, fit: k.fit, reasons: k.reasons,
        assessed: k.assessed_value, owned_years: k.ownership_years, mail_state: k.mail_state,
      })),
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (e) {
    await supabase.from('property_scans').update({ status: 'error', error: String(e) }).eq('id', scan!.id)
    return new Response(JSON.stringify({ error: String(e), parcels_scanned: scanned }),
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
  }
})
