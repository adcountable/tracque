// Tracque — Prompt Discovery Engine
// POST /functions/v1/discover-prompts
// Body: { user_id, seed_keywords: string[], brand_name: string }
//
// Sources:
//  1. Google People Also Ask (SerpAPI) — real questions people ask Google
//  2. Google Autocomplete (SerpAPI) — real-time query suggestions
//  3. Perplexity Related Questions — questions AI surfaces alongside answers
//  4. Google Trends — rising topics
//  5. Reddit — real questions from industry communities

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const SERP_API_KEY = Deno.env.get('SERP_API_KEY')
const PERPLEXITY_KEY = Deno.env.get('PERPLEXITY_API_KEY')

// ── 1. Google People Also Ask ──────────────────────────────
// Real questions people type into Google — huge overlap with AI queries

async function fetchPeopleAlsoAsk(keyword: string): Promise<{ phrase: string; volume: number }[]> {
  if (!SERP_API_KEY) return []
  try {
    const params = new URLSearchParams({
      q: keyword,
      api_key: SERP_API_KEY,
      engine: 'google',
      gl: 'us',
      hl: 'en',
    })
    const res = await fetch(`https://serpapi.com/search?${params}`)
    const data = await res.json()

    const questions = (data.related_questions ?? []).map((q: any) => ({
      phrase: q.question as string,
      volume: 0, // PAA doesn't give volume — enriched later
    }))

    return questions.slice(0, 10)
  } catch (e) {
    console.error('PAA fetch failed:', e)
    return []
  }
}

// ── 2. Google Autocomplete ─────────────────────────────────
// What Google suggests as people type — reveals high-volume queries

async function fetchAutocomplete(keyword: string): Promise<{ phrase: string; volume: number }[]> {
  if (!SERP_API_KEY) return []
  try {
    const params = new URLSearchParams({
      q: keyword,
      api_key: SERP_API_KEY,
      engine: 'google_autocomplete',
      gl: 'us',
      hl: 'en',
    })
    const res = await fetch(`https://serpapi.com/search?${params}`)
    const data = await res.json()

    return (data.suggestions ?? []).map((s: any) => ({
      phrase: s.value as string,
      volume: s.relevance ? Math.round(s.relevance * 10000) : 0,
    })).slice(0, 10)
  } catch (e) {
    console.error('Autocomplete fetch failed:', e)
    return []
  }
}

// ── 3. Perplexity Related Questions ───────────────────────
// Questions Perplexity thinks are related — directly maps to AI search behavior

async function fetchPerplexityRelated(keyword: string): Promise<{ phrase: string; volume: number }[]> {
  if (!PERPLEXITY_KEY) return []
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: keyword }],
        max_tokens: 500,
        return_related_questions: true,
      }),
    })
    const data = await res.json()

    return (data.related_questions ?? []).map((q: string) => ({
      phrase: q,
      volume: 0,
    })).slice(0, 5)
  } catch (e) {
    console.error('Perplexity related failed:', e)
    return []
  }
}

// ── 4. Google Trends — rising topics ──────────────────────

async function fetchGoogleTrends(keyword: string): Promise<{ phrase: string; trend_score: number }[]> {
  if (!SERP_API_KEY) return []
  try {
    const params = new URLSearchParams({
      q: keyword,
      api_key: SERP_API_KEY,
      engine: 'google_trends',
      data_type: 'RELATED_QUERIES',
      date: 'today 3-m',
      geo: 'US',
    })
    const res = await fetch(`https://serpapi.com/search?${params}`)
    const data = await res.json()

    const rising = (data.related_queries?.rising ?? []).map((q: any) => ({
      phrase: q.query as string,
      trend_score: Math.min((q.extracted_value ?? 0) / 1000, 1),
    }))

    return rising.slice(0, 10)
  } catch (e) {
    console.error('Trends fetch failed:', e)
    return []
  }
}

// ── 5. Reddit questions ────────────────────────────────────
// Real people asking real questions — gold for understanding AI query intent

async function fetchRedditQuestions(keyword: string): Promise<{ phrase: string }[]> {
  if (!SERP_API_KEY) return []
  try {
    const params = new URLSearchParams({
      q: `${keyword} site:reddit.com`,
      api_key: SERP_API_KEY,
      engine: 'google',
      gl: 'us',
      num: '10',
    })
    const res = await fetch(`https://serpapi.com/search?${params}`)
    const data = await res.json()

    // Extract question-like titles from Reddit results
    const results = (data.organic_results ?? [])
      .map((r: any) => r.title as string)
      .filter((t: string) => /\?|how|what|why|which|best|vs|review/i.test(t))
      .map((t: string) => ({ phrase: t.replace(/\s*[-|]\s*reddit.*/i, '').trim() }))

    return results.slice(0, 8)
  } catch (e) {
    console.error('Reddit fetch failed:', e)
    return []
  }
}

// ── Dedup + store ──────────────────────────────────────────

async function storePrompts(
  userId: string,
  prompts: { phrase: string; source: string; volume?: number; trend_score?: number }[]
) {
  if (prompts.length === 0) return

  const rows = prompts
    .filter(p => p.phrase && p.phrase.length > 5 && p.phrase.length < 200)
    .map(p => ({
      user_id: userId,
      phrase: p.phrase.toLowerCase().trim(),
      source: p.source,
      estimated_volume: p.volume ?? 0,
      trend_score: p.trend_score ?? 0,
    }))

  // Upsert — ignore duplicates (unique on user_id, phrase, source)
  await supabase
    .from('discovered_prompts')
    .upsert(rows, { onConflict: 'user_id,phrase,source', ignoreDuplicates: true })
}

// ── Main handler ───────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }

  const { user_id, seed_keywords, brand_name } = await req.json()
  if (!user_id || !seed_keywords?.length) {
    return new Response(JSON.stringify({ error: 'user_id and seed_keywords required' }), { status: 400 })
  }

  let totalDiscovered = 0
  const sourceBreakdown: Record<string, number> = {}

  for (const keyword of seed_keywords.slice(0, 5)) { // cap at 5 seeds
    const [paa, autocomplete, perplexity, trends, reddit] = await Promise.all([
      fetchPeopleAlsoAsk(keyword),
      fetchAutocomplete(keyword),
      fetchPerplexityRelated(keyword),
      fetchGoogleTrends(keyword),
      fetchRedditQuestions(keyword),
    ])

    await Promise.all([
      storePrompts(user_id, paa.map(p => ({ ...p, source: 'people_also_ask' }))),
      storePrompts(user_id, autocomplete.map(p => ({ ...p, source: 'autocomplete' }))),
      storePrompts(user_id, perplexity.map(p => ({ ...p, source: 'perplexity_related' }))),
      storePrompts(user_id, trends.map(p => ({ ...p, source: 'google_trends' }))),
      storePrompts(user_id, reddit.map(p => ({ ...p, source: 'reddit' }))),
    ])

    sourceBreakdown['people_also_ask'] = (sourceBreakdown['people_also_ask'] ?? 0) + paa.length
    sourceBreakdown['autocomplete'] = (sourceBreakdown['autocomplete'] ?? 0) + autocomplete.length
    sourceBreakdown['perplexity_related'] = (sourceBreakdown['perplexity_related'] ?? 0) + perplexity.length
    sourceBreakdown['google_trends'] = (sourceBreakdown['google_trends'] ?? 0) + trends.length
    sourceBreakdown['reddit'] = (sourceBreakdown['reddit'] ?? 0) + reddit.length

    totalDiscovered += paa.length + autocomplete.length + perplexity.length + trends.length + reddit.length
  }

  return new Response(JSON.stringify({
    ok: true,
    total_discovered: totalDiscovered,
    sources: sourceBreakdown,
  }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
