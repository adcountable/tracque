// Tracque — AI Visibility Scan Engine v2
// POST /functions/v1/run-scan
// Body: { user_id, brand_ids?, keyword_ids?, runs_per_keyword? }
//
// What makes this better than Profound:
//  1. Web-grounded calls — uses live web retrieval, not stale training data
//  2. Multi-run confidence — runs each keyword N times, reports confidence %
//  3. Structured citations — extracts exact URLs driving brand mentions
//  4. Google AI Overviews — tracks brand presence in Google's AI answers
//  5. Source intelligence — which domains are making brands get mentioned

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const SERP_API_KEY = Deno.env.get('SERP_API_KEY')

// ── Types ──────────────────────────────────────────────────

type AIModel = 'chatgpt' | 'perplexity' | 'gemini' | 'claude' | 'grok'
type Sentiment = 'positive' | 'neutral' | 'negative'

interface ModelResponse {
  text: string
  citation_urls: string[]   // structured citations (Perplexity/Gemini return these)
  web_grounded: boolean
}

interface ParsedMention {
  mentioned: boolean
  sentiment: Sentiment | null
  position: number | null
  excerpt: string | null
  sources: string[]
}

interface AggregatedResult {
  mentioned: boolean
  sentiment: Sentiment | null
  position: number | null
  excerpt: string | null
  sources: string[]
  citation_urls: string[]
  runs_total: number
  runs_mentioned: number
  confidence_pct: number
  all_sentiments: string[]
  web_grounded: boolean
  raw_response: string
}

// ── Prompt ────────────────────────────────────────────────

function buildPrompt(keyword: string): string {
  return `${keyword}

Please provide a detailed, objective answer. Name specific products, tools, or companies where relevant. Include multiple options with honest assessments.`
}

// ── Parser ────────────────────────────────────────────────

const POSITIVE_WORDS = ['leading', 'best', 'top', 'excellent', 'popular', 'recommended',
  'powerful', 'great', 'strong', 'trusted', 'widely used', 'favorite', 'robust',
  'industry-leading', 'award-winning', 'highly rated', 'well-regarded']

const NEGATIVE_WORDS = ['poor', 'bad', 'expensive', 'limited', 'worst', 'avoid',
  'problematic', 'slow', 'unreliable', 'disappointing', 'overpriced', 'clunky',
  'outdated', 'buggy', 'difficult', 'lacking', 'inferior']

function parseResponse(text: string, brandName: string): ParsedMention {
  const lower = text.toLowerCase()
  const brandLower = brandName.toLowerCase()
  const mentioned = lower.includes(brandLower)

  if (!mentioned) return { mentioned: false, sentiment: null, position: null, excerpt: null, sources: [] }

  // Position: count distinct company-like nouns before first brand mention
  const firstIdx = lower.indexOf(brandLower)
  const textBefore = text.slice(0, firstIdx)
  const properNouns = [...new Set(textBefore.match(/\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*/g) ?? [])]
  const position = properNouns.length + 1

  // Excerpt: best sentence containing brand
  const sentences = text.split(/(?<=[.!?])\s+/)
  const mentionSentence = sentences.find(s => s.toLowerCase().includes(brandLower)) ?? ''
  const excerpt = mentionSentence.slice(0, 400).trim()

  // Sentiment: weighted keyword scan in ±400 char window around mention
  const window = text.slice(Math.max(0, firstIdx - 300), firstIdx + 500).toLowerCase()
  const posScore = POSITIVE_WORDS.filter(w => window.includes(w)).length
  const negScore = NEGATIVE_WORDS.filter(w => window.includes(w)).length
  const sentiment: Sentiment = posScore > negScore ? 'positive' : negScore > posScore ? 'negative' : 'neutral'

  // Sources from plain URLs in response
  const urlMatches = [...text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)]
  const sources = [...new Set(urlMatches.map(m => m[1].replace(/^www\./, '')))]

  return { mentioned, sentiment, position, excerpt, sources }
}

function aggregateRuns(
  runs: ParsedMention[],
  responses: ModelResponse[],
): Omit<AggregatedResult, 'raw_response'> {
  const runsTotal = runs.length
  const runsMentioned = runs.filter(r => r.mentioned).length
  const confidencePct = Math.round((runsMentioned / runsTotal) * 100)
  const mentioned = runsMentioned > runsTotal / 2  // majority vote

  // Best excerpt from a mentioning run
  const mentioningRuns = runs.filter(r => r.mentioned)
  const excerpt = mentioningRuns[0]?.excerpt ?? null

  // Average position
  const positions = mentioningRuns.map(r => r.position).filter(Boolean) as number[]
  const position = positions.length ? Math.round(positions.reduce((a, b) => a + b, 0) / positions.length) : null

  // Sentiment majority vote
  const allSentiments = mentioningRuns.map(r => r.sentiment).filter(Boolean) as string[]
  const sentimentCounts = allSentiments.reduce((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {} as Record<string, number>)
  const sentiment = (Object.entries(sentimentCounts).sort(([, a], [, b]) => b - a)[0]?.[0] as Sentiment) ?? null

  // Merge all sources
  const allSources = [...new Set(runs.flatMap(r => r.sources))]

  // Merge structured citation URLs from all responses
  const citationUrls = [...new Set(responses.flatMap(r => r.citation_urls))]

  const webGrounded = responses.some(r => r.web_grounded)

  return {
    mentioned,
    sentiment,
    position,
    excerpt,
    sources: allSources,
    citation_urls: citationUrls,
    runs_total: runsTotal,
    runs_mentioned: runsMentioned,
    confidence_pct: confidencePct,
    all_sentiments: allSentiments,
    web_grounded: webGrounded,
  }
}

// ── Model callers (web-grounded) ───────────────────────────

// ChatGPT — uses Responses API with web_search_preview tool
async function callChatGPT(prompt: string): Promise<ModelResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('No OpenAI key')

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      tools: [{ type: 'web_search_preview' }],
      input: prompt,
    }),
  })
  const data = await res.json()

  // Extract text and any cited URLs from output blocks
  let text = ''
  const citationUrls: string[] = []

  for (const block of data.output ?? []) {
    if (block.type === 'message') {
      for (const content of block.content ?? []) {
        if (content.type === 'output_text') {
          text += content.text
          // Extract annotations (citations)
          for (const ann of content.annotations ?? []) {
            if (ann.type === 'url_citation' && ann.url) {
              try { citationUrls.push(new URL(ann.url).hostname.replace('www.', '')) } catch {}
            }
          }
        }
      }
    }
  }

  // Fallback to chat completions if responses API not available
  if (!text) {
    const fallback = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    })
    const fd = await fallback.json()
    text = fd.choices?.[0]?.message?.content ?? ''
    return { text, citation_urls: [], web_grounded: false }
  }

  return { text, citation_urls: [...new Set(citationUrls)], web_grounded: true }
}

// Perplexity — natively web-grounded, returns structured citations
async function callPerplexity(prompt: string): Promise<ModelResponse> {
  const apiKey = Deno.env.get('PERPLEXITY_API_KEY')
  if (!apiKey) throw new Error('No Perplexity key')

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-large-128k-online', // online = web retrieval
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.7,
      return_citations: true,
      return_related_questions: false,
    }),
  })
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''

  // Perplexity returns citations as an array of URLs
  const citationUrls = (data.citations ?? []).map((url: string) => {
    try { return new URL(url).hostname.replace('www.', '') } catch { return url }
  })

  return { text, citation_urls: [...new Set(citationUrls)], web_grounded: true }
}

// Gemini — with Google Search grounding
async function callGemini(prompt: string): Promise<ModelResponse> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('No Gemini key')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],  // enables live Google Search grounding
        generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
      }),
    }
  )
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // Extract grounding sources from metadata
  const groundingMeta = data.candidates?.[0]?.groundingMetadata
  const citationUrls: string[] = []
  for (const chunk of groundingMeta?.groundingChunks ?? []) {
    if (chunk.web?.uri) {
      try { citationUrls.push(new URL(chunk.web.uri).hostname.replace('www.', '')) } catch {}
    }
  }

  return { text, citation_urls: [...new Set(citationUrls)], web_grounded: citationUrls.length > 0 }
}

// Claude — with web search tool
async function callClaude(prompt: string): Promise<ModelResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('No Anthropic key')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
      }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()

  let text = ''
  const citationUrls: string[] = []
  let webGrounded = false

  for (const block of data.content ?? []) {
    if (block.type === 'text') text += block.text
    if (block.type === 'tool_result') webGrounded = true
  }

  // Extract URLs from citations in text
  const urlMatches = [...text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)]
  urlMatches.forEach(m => {
    try { citationUrls.push(new URL(`https://${m[1]}`).hostname.replace('www.', '')) } catch {}
  })

  return { text, citation_urls: [...new Set(citationUrls)], web_grounded: webGrounded }
}

// Grok — xAI API
async function callGrok(prompt: string): Promise<ModelResponse> {
  const apiKey = Deno.env.get('XAI_API_KEY')
  if (!apiKey) throw new Error('No xAI key')

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.7,
    }),
  })
  const data = await res.json()
  return { text: data.choices?.[0]?.message?.content ?? '', citation_urls: [], web_grounded: false }
}

const MODEL_CALLERS: Record<AIModel, (p: string) => Promise<ModelResponse>> = {
  chatgpt: callChatGPT,
  perplexity: callPerplexity,
  gemini: callGemini,
  claude: callClaude,
  grok: callGrok,
}

const MODEL_ENV_KEYS: Record<AIModel, string> = {
  chatgpt: 'OPENAI_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  gemini: 'GEMINI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  grok: 'XAI_API_KEY',
}

function enabledModels(): AIModel[] {
  return (Object.keys(MODEL_CALLERS) as AIModel[]).filter(m => !!Deno.env.get(MODEL_ENV_KEYS[m]))
}

// ── Google AI Overviews via SerpAPI ────────────────────────

async function fetchAIOverview(keyword: string): Promise<{ snippet: string; cited_urls: string[] } | null> {
  if (!SERP_API_KEY) return null
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

    const overview = data.ai_overview
    if (!overview) return null

    const snippet = overview.text ?? overview.snippet ?? ''
    const cited_urls: string[] = (overview.sources ?? []).map((s: any) => {
      try { return new URL(s.link ?? s.url ?? '').hostname.replace('www.', '') } catch { return '' }
    }).filter(Boolean)

    return { snippet, cited_urls }
  } catch {
    return null
  }
}

// ── Citation source intelligence ───────────────────────────

async function updateCitationSources(brandId: string, model: string, domains: string[]) {
  for (const domain of domains) {
    await supabase.rpc('upsert_citation_source', {
      p_brand_id: brandId,
      p_domain: domain,
      p_model: model,
    }).catch(() => {
      // fallback: manual upsert
      supabase.from('citation_sources')
        .upsert({
          brand_id: brandId,
          domain,
          models: [model],
          mention_count: 1,
          last_seen: new Date().toISOString(),
        }, { onConflict: 'brand_id,domain', ignoreDuplicates: false })
        .then(() => {})
    })
  }
}

// ── Main handler ───────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { user_id, brand_ids, keyword_ids, runs_per_keyword = 3 } = await req.json()
  if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400 })

  // Cap runs at 5 to control cost
  const RUNS = Math.min(Math.max(runs_per_keyword, 1), 5)

  // Load brands
  let brandsQ = supabase.from('brands').select('*').eq('user_id', user_id)
  if (brand_ids?.length) brandsQ = brandsQ.in('id', brand_ids)
  const { data: brands } = await brandsQ
  if (!brands?.length) return new Response(JSON.stringify({ error: 'No brands found' }), { status: 400 })

  // Load keywords
  let kwQ = supabase.from('keywords').select('*').eq('user_id', user_id)
  if (keyword_ids?.length) kwQ = kwQ.in('id', keyword_ids)
  const { data: keywords } = await kwQ
  if (!keywords?.length) return new Response(JSON.stringify({ error: 'No keywords found' }), { status: 400 })

  const models = enabledModels()
  let totalScanned = 0
  let totalErrors = 0
  const overviewsFound: number[] = []

  for (const keyword of keywords) {
    const prompt = buildPrompt(keyword.phrase)

    // ── Google AI Overview (one call per keyword) ──
    const overview = await fetchAIOverview(keyword.phrase)
    if (overview?.snippet) {
      const brandsMentioned = brands
        .filter(b => overview.snippet.toLowerCase().includes(b.name.toLowerCase()))
        .map(b => b.name)

      await supabase.from('ai_overviews').insert({
        keyword_id: keyword.id,
        snippet: overview.snippet,
        brands_mentioned: brandsMentioned,
        cited_urls: overview.cited_urls,
      })
      overviewsFound.push(brandsMentioned.length)
    }

    // ── AI model scans (RUNS × models, parsed for all brands) ──
    for (const model of models) {
      // Collect RUNS responses for this keyword/model
      const responses: ModelResponse[] = []
      for (let run = 0; run < RUNS; run++) {
        try {
          const response = await MODEL_CALLERS[model](prompt)
          responses.push(response)
        } catch (e) {
          console.error(`${model} run ${run + 1} failed for "${keyword.phrase}":`, e)
          totalErrors++
        }
      }

      if (responses.length === 0) continue

      // Parse and aggregate per brand
      for (const brand of brands) {
        const parsedRuns = responses.map(r => parseResponse(r.text, brand.name))
        const aggregated = aggregateRuns(parsedRuns, responses)
        const bestResponse = responses[parsedRuns.findIndex(r => r.mentioned)] ?? responses[0]

        const row = {
          keyword_id: keyword.id,
          brand_id: brand.id,
          model,
          mentioned: aggregated.mentioned,
          sentiment: aggregated.sentiment,
          position: aggregated.position,
          excerpt: aggregated.excerpt,
          sources: aggregated.sources,
          citation_urls: aggregated.citation_urls,
          runs_total: aggregated.runs_total,
          runs_mentioned: aggregated.runs_mentioned,
          confidence_pct: aggregated.confidence_pct,
          all_sentiments: aggregated.all_sentiments,
          web_grounded: aggregated.web_grounded,
          raw_response: bestResponse.text,
        }

        const { error } = await supabase.from('scan_results').insert(row)
        if (error) {
          console.error('Insert error:', error)
          totalErrors++
        } else {
          totalScanned++
          // Update citation source intelligence
          if (aggregated.mentioned && aggregated.citation_urls.length > 0) {
            await updateCitationSources(brand.id, model, aggregated.citation_urls)
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    scanned: totalScanned,
    errors: totalErrors,
    models_used: models,
    keywords_scanned: keywords.length,
    brands_tracked: brands.length,
    runs_per_keyword: RUNS,
    ai_overviews_found: overviewsFound.length,
  }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
