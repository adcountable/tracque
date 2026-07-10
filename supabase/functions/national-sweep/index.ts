// Tracque — National off-market sweep (any county, by FIPS)
// POST /functions/v1/national-sweep
// Body: { user_id, fips, max_parcels?, min_fit? }
//
// Finds DISTRESSED / UNLISTED homes nationwide by sweeping a county's
// parcel + owner records through a single national provider (Regrid or
// ReportAll), keyed by county FIPS. One key → all ~3,143 counties, so the
// same code runs the top-decile (~314 counties) without per-county work.
//
//   NATIONAL_PROVIDER = 'regrid'    -> REGRID_API_TOKEN
//   NATIONAL_PROVIDER = 'reportall' -> REPORTALL_CLIENT_KEY
// No provider set -> returns a clear error (no national free API exists).
//
// Off-market distress signals available from records alone:
//   tax delinquency · out-of-state / absentee owner · long tenure ·
//   owner-occupied flag · assessed value band · (with a lien feed) equity.
// Physical condition is NOT in records — that needs a separate signal.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const PROVIDER = (Deno.env.get('NATIONAL_PROVIDER') ?? '').toLowerCase()
const REGRID_TOKEN = Deno.env.get('REGRID_API_TOKEN')
const REPORTALL_KEY = Deno.env.get('REPORTALL_CLIENT_KEY')

const PAGE = 1000

interface Parcel {
  parcel_id: string
  address: string
  city: string
  state: string
  zip: string
  owner_name: string
  owner_mail_state: string | null
  owner_out_of_state: boolean
  owner_occupied: boolean | null
  assessed_value: number | null
  last_sale_year: number | null
  ownership_years: number | null
  tax_delinquent: boolean
  land_use: string | null
}

function yearFrom(v: unknown): number | null {
  if (typeof v === 'number') { const y = new Date(v).getUTCFullYear(); return y > 1900 ? y : null }
  if (typeof v === 'string') { const y = parseInt(v.slice(0, 4), 10); return y > 1900 ? y : null }
  return null
}

// ── Provider adapters (normalize to Parcel) ────────────────

async function fetchRegrid(fips: string, offset: number, state: string): Promise<Parcel[]> {
  // Regrid Parcel API — query by county FIPS, paginated.
  const url = new URL('https://app.regrid.com/api/v2/parcels/query')
  url.searchParams.set('token', REGRID_TOKEN!)
  url.searchParams.set('county_fips', fips)
  url.searchParams.set('limit', String(PAGE))
  url.searchParams.set('offset', String(offset))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`regrid ${res.status}`)
  const data = await res.json()
  const feats = data?.parcels?.features ?? data?.features ?? []
  const year = new Date().getFullYear()
  return feats.map((f: any) => {
    const p = f.properties?.fields ?? f.properties ?? {}
    const mailState = (p.mail_state2 ?? p.mailadd_state ?? p.owner_mailing_state ?? null)?.toString().toUpperCase() || null
    const saleYear = yearFrom(p.saledate ?? p.last_sale_date)
    return {
      parcel_id: String(p.parcelnumb ?? p.ll_uuid ?? f.id ?? ''),
      address: String(p.address ?? p.saddress ?? ''), city: String(p.scity ?? p.city ?? ''),
      state: String(p.state2 ?? state).toUpperCase(), zip: String(p.szip ?? p.zip ?? ''),
      owner_name: String(p.owner ?? p.owner_name ?? ''),
      owner_mail_state: mailState, owner_out_of_state: mailState != null && mailState !== state.toUpperCase(),
      owner_occupied: p.owner_occupied ?? null,
      assessed_value: p.parval != null ? Number(p.parval) : (p.totval != null ? Number(p.totval) : null),
      last_sale_year: saleYear, ownership_years: saleYear != null ? year - saleYear : null,
      tax_delinquent: !!(p.tax_delinquent ?? p.delinquent),
      land_use: p.usedesc ?? p.landuse ?? null,
    }
  })
}

async function fetchReportAll(fips: string, page: number, state: string): Promise<Parcel[]> {
  // ReportAll USA Parcel API — county_id via FIPS, paginated by page.
  const url = new URL('https://reportallusa.com/api/rest_services/parcels')
  url.searchParams.set('client', REPORTALL_KEY!)
  url.searchParams.set('v', '9')
  url.searchParams.set('county_id', fips)
  url.searchParams.set('rpp', String(PAGE))
  url.searchParams.set('page', String(page))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`reportall ${res.status}`)
  const data = await res.json()
  const year = new Date().getFullYear()
  return (data?.results ?? []).map((p: any) => {
    const mailState = (p.mail_state ?? p.owner_state ?? null)?.toString().toUpperCase() || null
    const saleYear = yearFrom(p.sale_date ?? p.trans_date)
    return {
      parcel_id: String(p.parcel_id ?? p.robust_id ?? ''),
      address: String(p.addr_number ? `${p.addr_number} ${p.addr_street_name ?? ''}`.trim() : (p.physical_address ?? '')),
      city: String(p.physical_city ?? p.muni_name ?? ''), state: String(p.state_abbr ?? state).toUpperCase(),
      zip: String(p.physical_zip ?? ''), owner_name: String(p.owner ?? ''),
      owner_mail_state: mailState, owner_out_of_state: mailState != null && mailState !== state.toUpperCase(),
      owner_occupied: null,
      assessed_value: p.mkt_val_tot != null ? Number(p.mkt_val_tot) : (p.assd_val_tot != null ? Number(p.assd_val_tot) : null),
      last_sale_year: saleYear, ownership_years: saleYear != null ? year - saleYear : null,
      tax_delinquent: false, land_use: p.land_use_class ?? p.std_land_use ?? null,
    }
  })
}

function scoreParcel(p: Parcel): { fit: number; reasons: string[] } {
  let fit = 0; const reasons: string[] = []
  if (p.tax_delinquent) { fit += 30; reasons.push('Tax delinquent') }
  if (p.owner_out_of_state) { fit += 28; reasons.push(`Out-of-state owner (${p.owner_mail_state})`) }
  if (p.owner_occupied === false) { fit += 12; reasons.push('Non-owner-occupied') }
  if (p.ownership_years != null) {
    if (p.ownership_years >= 20) { fit += 18; reasons.push(`Owned ${p.ownership_years} yrs`) }
    else if (p.ownership_years >= 12) { fit += 10; reasons.push(`Owned ${p.ownership_years} yrs`) }
  }
  if (p.assessed_value != null && p.assessed_value >= 100000 && p.assessed_value <= 700000) { fit += 12; reasons.push('Target value band') }
  return { fit: Math.min(100, fit), reasons }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { user_id, fips, state = '', max_parcels = 5000, min_fit = 55 } = await req.json()
  if (!user_id || !fips) return new Response(JSON.stringify({ error: 'user_id and fips required' }), { status: 400 })

  const configured = (PROVIDER === 'regrid' && REGRID_TOKEN) || (PROVIDER === 'reportall' && REPORTALL_KEY)
  if (!configured) {
    return new Response(JSON.stringify({
      error: 'No national parcel provider configured. Set NATIONAL_PROVIDER=regrid (+REGRID_API_TOKEN) or =reportall (+REPORTALL_CLIENT_KEY). There is no free national parcel API.',
    }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }

  const { data: scan } = await supabase.from('property_scans').insert({
    user_id, market: `County FIPS ${fips} sweep`, asset_type: 'sfh', strategy: 'seller_finance',
    params: { fips, provider: PROVIDER, mode: 'national_off_market' }, status: 'running',
  }).select().single()

  const kept: (Parcel & { fit: number; reasons: string[] })[] = []
  let scanned = 0
  try {
    for (let i = 0; i * PAGE < max_parcels; i++) {
      const rows = PROVIDER === 'regrid'
        ? await fetchRegrid(fips, i * PAGE, state)
        : await fetchReportAll(fips, i + 1, state)
      if (!rows.length) break
      scanned += rows.length
      for (const p of rows) {
        if (!p.parcel_id || !p.owner_name) continue
        if (p.land_use && !/RES|SINGLE|DWEL|SFR|HOME/i.test(p.land_use)) continue
        const { fit, reasons } = scoreParcel(p)
        if (fit >= min_fit) kept.push({ ...p, fit, reasons })
      }
      if (rows.length < PAGE) break
    }
    kept.sort((a, b) => b.fit - a.fit)

    if (kept.length) {
      const { data: props } = await supabase.from('properties').upsert(
        kept.map(k => ({
          user_id, external_id: `PARCEL-${k.state}-${k.parcel_id}`, source: 'county', asset_type: 'sfh',
          address: k.address, city: k.city, state: k.state, zip: k.zip, status: 'off_market',
          avm_value: k.assessed_value, last_sale_year: k.last_sale_year, ownership_years: k.ownership_years,
          owner_occupied: k.owner_occupied, owner_out_of_state: k.owner_out_of_state,
          owner_type: k.owner_out_of_state ? 'absentee_out_of_state' : null, owner_name: k.owner_name,
          distress_flags: k.tax_delinquent ? ['tax_lien'] : [],
        })),
        { onConflict: 'user_id,source,external_id' },
      ).select('id, external_id')
      const idBy = new Map((props ?? []).map((p: any) => [p.external_id, p.id]))
      const scores = kept.filter(k => idBy.has(`PARCEL-${k.state}-${k.parcel_id}`)).map(k => ({
        scan_id: scan!.id, property_id: idBy.get(`PARCEL-${k.state}-${k.parcel_id}`),
        strategy: 'seller_finance', fit_score: k.fit, reasons: k.reasons, motivation_score: null, signals: null, deal_math: null,
      }))
      if (scores.length) await supabase.from('property_scores').insert(scores)
    }

    await supabase.from('property_scans').update({
      status: 'complete', properties_found: kept.length, completed_at: new Date().toISOString(),
    }).eq('id', scan!.id)

    return new Response(JSON.stringify({
      scan_id: scan!.id, fips, provider: PROVIDER, parcels_scanned: scanned, off_market_leads: kept.length,
      top: kept.slice(0, 25).map(k => ({ address: k.address, city: k.city, state: k.state, owner: k.owner_name, fit: k.fit, reasons: k.reasons })),
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  } catch (e) {
    await supabase.from('property_scans').update({ status: 'error', error: String(e) }).eq('id', scan!.id)
    return new Response(JSON.stringify({ error: String(e), parcels_scanned: scanned }),
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
  }
})
