// Tracque — Google Search Console Sync
// POST /functions/v1/sync-gsc
// Body: { user_id }
//
// Pulls actual queries driving traffic to the user's site from GSC.
// These are REAL queries — better than any estimated data.
// Also identifies which queries are AI-style questions vs navigational.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to refresh token')
  return data.access_token
}

async function fetchGSCQueries(
  accessToken: string,
  siteUrl: string,
  dateRange: { startDate: string; endDate: string }
): Promise<{ query: string; clicks: number; impressions: number; position: number }[]> {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        dimensions: ['query'],
        rowLimit: 500,
        startRow: 0,
      }),
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)

  return (data.rows ?? []).map((row: any) => ({
    query: row.keys[0] as string,
    clicks: row.clicks as number,
    impressions: row.impressions as number,
    position: row.position as number,
  }))
}

// Classify queries as AI-style (questions) vs navigational
function isAIStyleQuery(query: string): boolean {
  return /^(how|what|why|which|who|when|where|best|top|vs|compare|review|alternative)/i.test(query) ||
    query.includes('?') ||
    query.split(' ').length >= 4
}

function getLast28Days(): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 28)
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }

  const { user_id } = await req.json()
  if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400 })

  // Load GSC connection
  const { data: conn, error: connErr } = await supabase
    .from('gsc_connections')
    .select('*')
    .eq('user_id', user_id)
    .single()

  if (connErr || !conn) {
    return new Response(JSON.stringify({ error: 'No GSC connection found. Connect Google Search Console in Settings.' }), { status: 400 })
  }

  // Refresh token if needed
  let accessToken = conn.access_token
  if (!accessToken || (conn.token_expiry && new Date(conn.token_expiry) < new Date())) {
    accessToken = await refreshAccessToken(conn.refresh_token)
    await supabase
      .from('gsc_connections')
      .update({ access_token: accessToken, token_expiry: new Date(Date.now() + 3600 * 1000).toISOString() })
      .eq('user_id', user_id)
  }

  const dateRange = getLast28Days()
  const queries = await fetchGSCQueries(accessToken, conn.site_url, dateRange)

  // Store all queries
  const rows = queries.map(q => ({
    user_id,
    query: q.query,
    clicks: q.clicks,
    impressions: q.impressions,
    position: q.position,
    date_range: 'last_28_days',
  }))

  await supabase.from('gsc_queries').upsert(rows, { onConflict: 'user_id,query', ignoreDuplicates: false })

  // Auto-add high-volume AI-style queries to discovered_prompts
  const aiStyleQueries = queries
    .filter(q => isAIStyleQuery(q.query) && q.impressions > 50)
    .map(q => ({
      user_id,
      phrase: q.query,
      source: 'gsc' as const,
      estimated_volume: q.impressions,
      trend_score: Math.min(q.clicks / Math.max(q.impressions, 1), 1),
    }))

  if (aiStyleQueries.length > 0) {
    await supabase
      .from('discovered_prompts')
      .upsert(aiStyleQueries, { onConflict: 'user_id,phrase,source', ignoreDuplicates: false })
  }

  return new Response(JSON.stringify({
    ok: true,
    queries_synced: queries.length,
    ai_style_queries: aiStyleQueries.length,
    date_range: dateRange,
  }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
