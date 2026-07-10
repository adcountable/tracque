// Tracque — AI Recommendations Engine
// POST /functions/v1/generate-recommendations
// Body: { user_id, brand_id }
//
// Analyzes ALL available data for a brand and generates specific,
// ranked, templated recommendations — not generic advice.
// Powered by Claude with a highly structured prompt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

// ── Data gathering ─────────────────────────────────────────

async function gatherBrandData(userId: string, brandId: string) {
  const [
    { data: brand },
    { data: scanResults },
    { data: citationSources },
    { data: seoResults },
    { data: allBrands },
    { data: keywords },
  ] = await Promise.all([
    supabase.from('brands').select('*').eq('id', brandId).single(),
    supabase.from('scan_results')
      .select('*, keywords(phrase)')
      .eq('brand_id', brandId)
      .gte('scanned_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('scanned_at', { ascending: false }),
    supabase.from('citation_sources')
      .select('*')
      .eq('brand_id', brandId)
      .order('mention_count', { ascending: false })
      .limit(20),
    supabase.from('latest_seo_results')
      .select('*')
      .eq('brand_id', brandId),
    supabase.from('brands').select('*').eq('user_id', userId),
    supabase.from('keywords').select('*').eq('user_id', userId),
  ])

  // Competitor scan data
  const competitorBrands = (allBrands ?? []).filter(b => b.id !== brandId)
  const competitorIds = competitorBrands.map(b => b.id)

  const { data: competitorScans } = competitorIds.length > 0
    ? await supabase.from('scan_results')
        .select('*, keywords(phrase), brands(name)')
        .in('brand_id', competitorIds)
        .gte('scanned_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    : { data: [] }

  // AI Overviews
  const keywordIds = (keywords ?? []).map(k => k.id)
  const { data: aiOverviews } = keywordIds.length > 0
    ? await supabase.from('ai_overviews')
        .select('*, keywords(phrase)')
        .in('keyword_id', keywordIds)
        .order('scanned_at', { ascending: false })
        .limit(20)
    : { data: [] }

  return { brand, scanResults, citationSources, seoResults, competitorBrands, competitorScans, aiOverviews, keywords }
}

// ── Build analytics summary ────────────────────────────────

function buildAnalytics(data: Awaited<ReturnType<typeof gatherBrandData>>) {
  const { brand, scanResults, citationSources, seoResults, competitorBrands, competitorScans, aiOverviews, keywords } = data

  // Mention rates by keyword
  const keywordStats = keywords?.map(kw => {
    const kwScans = (scanResults ?? []).filter((s: any) => s.keywords?.phrase === kw.phrase)
    const mentioned = kwScans.filter((s: any) => s.mentioned).length
    const total = kwScans.length
    const rate = total > 0 ? Math.round((mentioned / total) * 100) : 0

    // Competitor rates for same keyword
    const compRates = competitorBrands.map(comp => {
      const compScans = (competitorScans ?? []).filter((s: any) =>
        s.brands?.name === comp.name && s.keywords?.phrase === kw.phrase
      )
      const compMentioned = compScans.filter((s: any) => s.mentioned).length
      return {
        name: comp.name,
        rate: compScans.length > 0 ? Math.round((compMentioned / compScans.length) * 100) : 0,
      }
    })

    return { phrase: kw.phrase, rate, total, compRates }
  }) ?? []

  // Keywords where competitors beat us significantly
  const competitorGaps = keywordStats.filter(kw => {
    const topCompRate = Math.max(0, ...kw.compRates.map(c => c.rate))
    return topCompRate > kw.rate + 20 // competitor beats us by 20%+
  })

  // Keywords we're invisible on (0% mention rate)
  const invisibleKeywords = keywordStats.filter(kw => kw.rate === 0)

  // Top citation domains across all scans
  const allCitedDomains = (scanResults ?? [])
    .flatMap((s: any) => [...(s.citation_urls ?? []), ...(s.sources ?? [])])
    .filter(Boolean)

  const domainCounts = allCitedDomains.reduce((acc: Record<string, number>, d: string) => {
    acc[d] = (acc[d] ?? 0) + 1
    return acc
  }, {})

  const topCitedDomains = Object.entries(domainCounts)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 15)
    .map(([domain, count]) => ({ domain, count }))

  // Domains where competitors get cited but we don't appear
  const competitorCitedDomains = (competitorScans ?? [])
    .flatMap((s: any) => [...(s.citation_urls ?? []), ...(s.sources ?? [])])
    .filter(Boolean)

  const compDomainCounts = competitorCitedDomains.reduce((acc: Record<string, number>, d: string) => {
    acc[d] = (acc[d] ?? 0) + 1
    return acc
  }, {})

  const citationGaps = Object.entries(compDomainCounts)
    .filter(([domain]) => !(domainCounts[domain]))
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }))

  // Sentiment issues
  const negativeSentiment = (scanResults ?? []).filter((s: any) => s.sentiment === 'negative')
  const sentimentIssues = [...new Set(negativeSentiment.map((s: any) => s.keywords?.phrase))].filter(Boolean)

  // SEO gaps (low position = AI less likely to cite)
  const seoGaps = (seoResults ?? [])
    .filter((r: any) => r.position && r.position > 5)
    .sort((a: any, b: any) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
    .slice(0, 5)

  // AI Overview appearances
  const overviewMentions = (aiOverviews ?? []).filter((o: any) =>
    o.brands_mentioned?.includes(brand?.name)
  )
  const overviewMissed = (aiOverviews ?? []).filter((o: any) =>
    !o.brands_mentioned?.includes(brand?.name)
  )

  // Overall mention rate
  const totalScans = scanResults?.length ?? 0
  const totalMentions = (scanResults ?? []).filter((s: any) => s.mentioned).length
  const overallRate = totalScans > 0 ? Math.round((totalMentions / totalScans) * 100) : 0

  return {
    brand,
    overallRate,
    keywordStats,
    competitorGaps,
    invisibleKeywords,
    topCitedDomains,
    citationGaps,
    citationSources: citationSources ?? [],
    sentimentIssues,
    seoGaps,
    overviewMentions: overviewMentions.length,
    overviewMissed: overviewMissed.length,
    totalScans,
    competitorBrands,
  }
}

// ── Claude prompt ──────────────────────────────────────────

function buildClaudePrompt(analytics: ReturnType<typeof buildAnalytics>): string {
  return `You are Tracque's GEO (Generative Engine Optimization) recommendations engine. Your job is to analyze brand visibility data and output SPECIFIC, ACTIONABLE, DATA-BACKED recommendations — not generic advice.

BRAND: ${analytics.brand?.name} (${analytics.brand?.domain ?? 'domain unknown'})
BRAND TYPE: ${analytics.brand?.type}
OVERALL AI MENTION RATE: ${analytics.overallRate}% across all scans

KEYWORD PERFORMANCE:
${analytics.keywordStats.map(kw => {
  const compInfo = kw.compRates.length > 0
    ? ` | Competitors: ${kw.compRates.map(c => `${c.name}: ${c.rate}%`).join(', ')}`
    : ''
  return `- "${kw.phrase}": ${kw.rate}% mention rate${compInfo}`
}).join('\n') || '- No keyword data yet'}

KEYWORDS WHERE WE ARE INVISIBLE (0% mention rate):
${analytics.invisibleKeywords.map(kw => `- "${kw.phrase}"`).join('\n') || '- None'}

KEYWORDS WHERE COMPETITORS BEAT US BY 20%+:
${analytics.competitorGaps.map(kw => {
  const topComp = kw.compRates.sort((a, b) => b.rate - a.rate)[0]
  return `- "${kw.phrase}": We are ${kw.rate}% vs ${topComp?.name} at ${topComp?.rate}%`
}).join('\n') || '- None identified'}

TOP CITATION SOURCES IN OUR RESPONSES (domains AI cites when mentioning us):
${analytics.topCitedDomains.map(d => `- ${d.domain}: ${d.count} citations`).join('\n') || '- No citation data yet'}

CITATION GAPS (domains that drive competitor mentions but NOT ours):
${analytics.citationGaps.map(d => `- ${d.domain}: cited ${d.count} times for competitors, 0 for us`).join('\n') || '- None identified'}

SENTIMENT ISSUES (keywords with negative AI sentiment):
${analytics.sentimentIssues.map(kw => `- "${kw}"`).join('\n') || '- None'}

SEO GAPS (ranking position > 5, AI less likely to cite):
${analytics.seoGaps.map((r: any) => `- "${r.phrase}": position #${r.position}, ${r.search_volume ?? 0} monthly searches`).join('\n') || '- No SEO data yet'}

GOOGLE AI OVERVIEWS:
- Mentioned in ${analytics.overviewMentions} AI Overview snapshots
- Missing from ${analytics.overviewMissed} AI Overview snapshots for tracked keywords

COMPETITORS TRACKED: ${analytics.competitorBrands.map(b => b.name).join(', ') || 'None added yet'}

---

Generate 6-8 highly specific recommendations. Each recommendation must:

1. Reference SPECIFIC data points from above (exact percentages, exact domains, exact keywords)
2. Name the EXACT action (specific URL, subreddit, publication, page slug — not just "a blog post")
3. Include a READY-TO-USE template (email, content brief, or page outline)
4. State the expected outcome with a timeframe
5. Be ranked by impact (1 = highest)

Output as a JSON array with this exact structure:
[
  {
    "category": "citation_source" | "content_gap" | "competitor_gap" | "site_structure" | "review_platform" | "community" | "pr_coverage" | "keyword_coverage",
    "impact_score": 1-10,
    "effort": "low" | "medium" | "high",
    "priority_rank": 1-8,
    "title": "Short title (max 60 chars)",
    "why": "Data-backed explanation referencing specific numbers from above",
    "action": "Specific action with exact URLs, subreddits, publications, page names",
    "template": "Ready-to-use email, content brief, or page outline they can execute immediately",
    "expected_result": "Specific outcome with timeframe",
    "data_evidence": {
      "current_rate": number or null,
      "target_rate": number or null,
      "competitor_rate": number or null,
      "domain": "string or null",
      "keyword": "string or null"
    }
  }
]

Be ruthlessly specific. If you don't have enough data to be specific, say what data is needed to generate that recommendation. Never output generic advice like "improve your content" or "build more backlinks" — always tie to specific data points above.`
}

// ── Call Claude ────────────────────────────────────────────

async function callClaude(prompt: string): Promise<any[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: prompt,
      }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Claude did not return valid JSON array')

  return JSON.parse(jsonMatch[0])
}

// ── Main handler ───────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    })
  }

  const { user_id, brand_id } = await req.json()
  if (!user_id || !brand_id) {
    return new Response(JSON.stringify({ error: 'user_id and brand_id required' }), { status: 400 })
  }

  // Gather all data
  const rawData = await gatherBrandData(user_id, brand_id)
  const analytics = buildAnalytics(rawData)

  // Generate recommendations via Claude
  const prompt = buildClaudePrompt(analytics)
  const recommendations = await callClaude(prompt)

  // Delete existing pending recommendations for this brand
  await supabase
    .from('recommendations')
    .delete()
    .eq('brand_id', brand_id)
    .eq('status', 'pending')

  // Store new recommendations
  const rows = recommendations.map((rec: any) => ({
    user_id,
    brand_id,
    category: rec.category,
    impact_score: rec.impact_score,
    effort: rec.effort,
    priority_rank: rec.priority_rank,
    title: rec.title,
    why: rec.why,
    action: rec.action,
    template: rec.template,
    expected_result: rec.expected_result,
    data_evidence: rec.data_evidence ?? {},
    status: 'pending',
  }))

  const { error } = await supabase.from('recommendations').insert(rows)
  if (error) throw error

  return new Response(JSON.stringify({
    ok: true,
    count: recommendations.length,
    brand: analytics.brand?.name,
    overall_rate: analytics.overallRate,
  }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
