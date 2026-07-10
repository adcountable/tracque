// Tracque — Single Task Processor
// Called by QStash for each individual scan_task
// Processes ONE keyword × model × brand combination
// Runs fully in parallel — no coordination needed
// At 10k customers this runs millions of times per day

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const RUNS_PER_TASK = 3

// ── Model caller ───────────────────────────────────────────

async function callModel(model: string, prompt: string): Promise<{ text: string; citations: string[]; grounded: boolean }> {
  const modelMap: Record<string, () => Promise<{ text: string; citations: string[]; grounded: boolean }>> = {
    chatgpt: async () => {
      // Try Responses API with web search first
      try {
        const res = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o-mini', tools: [{ type: 'web_search_preview' }], input: prompt }),
        })
        const data = await res.json()
        let text = ''
        const citations: string[] = []
        for (const block of data.output ?? []) {
          if (block.type === 'message') {
            for (const content of block.content ?? []) {
              if (content.type === 'output_text') {
                text += content.text
                for (const ann of content.annotations ?? []) {
                  if (ann.url) try { citations.push(new URL(ann.url).hostname.replace('www.', '')) } catch {}
                }
              }
            }
          }
        }
        if (text) return { text, citations: [...new Set(citations)], grounded: true }
      } catch {}
      // Fallback
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 800, temperature: 0.7 }),
      })
      const data = await res.json()
      return { text: data.choices?.[0]?.message?.content ?? '', citations: [], grounded: false }
    },

    perplexity: async () => {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('PERPLEXITY_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.1-sonar-large-128k-online', messages: [{ role: 'user', content: prompt }], max_tokens: 800, temperature: 0.7, return_citations: true }),
      })
      const data = await res.json()
      const citations = (data.citations ?? []).map((u: string) => { try { return new URL(u).hostname.replace('www.', '') } catch { return u } })
      return { text: data.choices?.[0]?.message?.content ?? '', citations: [...new Set(citations)], grounded: true }
    },

    gemini: async () => {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 800, temperature: 0.7 } }),
      })
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const citations: string[] = []
      for (const chunk of data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
        if (chunk.web?.uri) try { citations.push(new URL(chunk.web.uri).hostname.replace('www.', '')) } catch {}
      }
      return { text, citations: [...new Set(citations)], grounded: citations.length > 0 }
    },

    claude: async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }], messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await res.json()
      let text = ''
      for (const block of data.content ?? []) { if (block.type === 'text') text += block.text }
      return { text, citations: [], grounded: true }
    },

    grok: async () => {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('XAI_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'grok-beta', messages: [{ role: 'user', content: prompt }], max_tokens: 800, temperature: 0.7 }),
      })
      const data = await res.json()
      return { text: data.choices?.[0]?.message?.content ?? '', citations: [], grounded: false }
    },
  }

  const caller = modelMap[model]
  if (!caller) throw new Error(`Unknown model: ${model}`)
  return caller()
}

function parseResponse(text: string, brandName: string) {
  const lower = text.toLowerCase()
  const brandLower = brandName.toLowerCase()
  if (!lower.includes(brandLower)) return { mentioned: false, sentiment: null, position: null, excerpt: null }

  const firstIdx = lower.indexOf(brandLower)
  const position = [...new Set((text.slice(0, firstIdx).match(/\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*/g) ?? []))].length + 1
  const excerpt = (text.split(/(?<=[.!?])\s+/).find(s => s.toLowerCase().includes(brandLower)) ?? '').slice(0, 400)

  const window = text.slice(Math.max(0, firstIdx - 300), firstIdx + 500).toLowerCase()
  const pos = ['leading','best','top','excellent','popular','recommended','powerful','trusted','robust','widely used'].filter(w => window.includes(w)).length
  const neg = ['poor','bad','expensive','limited','worst','avoid','slow','unreliable','disappointing','overpriced'].filter(w => window.includes(w)).length
  const sentiment = pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral'

  return { mentioned: true, sentiment, position, excerpt }
}

// ── Main handler ───────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }

  const { task_id } = await req.json()
  if (!task_id) return new Response(JSON.stringify({ error: 'task_id required' }), { status: 400 })

  // Load task with all needed data
  const { data: task, error: taskErr } = await supabase
    .from('scan_tasks')
    .select(`
      id, job_id, model, attempts,
      keyword:keywords(id, phrase, user_id),
      brand:brands(id, name, domain, user_id)
    `)
    .eq('id', task_id)
    .single()

  if (taskErr || !task) return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404 })

  const keyword = task.keyword as any
  const brand = task.brand as any

  // Check API key available
  const keyMap: Record<string, string> = {
    chatgpt: 'OPENAI_API_KEY', perplexity: 'PERPLEXITY_API_KEY',
    gemini: 'GEMINI_API_KEY', claude: 'ANTHROPIC_API_KEY', grok: 'XAI_API_KEY'
  }
  if (!Deno.env.get(keyMap[task.model])) {
    await supabase.from('scan_tasks').update({ status: 'failed', error: 'No API key' }).eq('id', task_id)
    return new Response(JSON.stringify({ skipped: true, reason: 'No API key' }))
  }

  try {
    const prompt = `${keyword.phrase}\n\nProvide a detailed, objective answer. Name specific products, tools, or companies where relevant.`

    // Run RUNS_PER_TASK times for statistical confidence
    const responses: { text: string; citations: string[]; grounded: boolean }[] = []
    for (let i = 0; i < RUNS_PER_TASK; i++) {
      const r = await callModel(task.model, prompt)
      responses.push(r)
    }

    // Aggregate runs
    const parsed = responses.map(r => parseResponse(r.text, brand.name))
    const mentionCount = parsed.filter(p => p.mentioned).length
    const mentioned = mentionCount > RUNS_PER_TASK / 2

    const allSentiments = parsed.filter(p => p.sentiment).map(p => p.sentiment as string)
    const sentCounts = allSentiments.reduce((a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {} as Record<string, number>)
    const sentiment = Object.entries(sentCounts).sort(([,a],[,b]) => b-a)[0]?.[0] ?? null

    const positions = parsed.filter(p => p.position).map(p => p.position as number)
    const position = positions.length ? Math.round(positions.reduce((a, b) => a + b, 0) / positions.length) : null

    const excerpt = parsed.find(p => p.mentioned)?.excerpt ?? null
    const allCitations = [...new Set(responses.flatMap(r => r.citations))]
    const webGrounded = responses.some(r => r.grounded)

    // Store scan result
    const { data: result } = await supabase
      .from('scan_results')
      .insert({
        keyword_id: keyword.id,
        brand_id: brand.id,
        model: task.model,
        mentioned,
        sentiment,
        position,
        excerpt,
        sources: allCitations,
        citation_urls: allCitations,
        runs_total: RUNS_PER_TASK,
        runs_mentioned: mentionCount,
        confidence_pct: Math.round((mentionCount / RUNS_PER_TASK) * 100),
        all_sentiments: allSentiments,
        web_grounded: webGrounded,
        raw_response: responses[0].text,
      })
      .select('id')
      .single()

    // Mark task complete
    await supabase
      .from('scan_tasks')
      .update({ status: 'completed', result_id: result?.id, completed_at: new Date().toISOString() })
      .eq('id', task_id)

    // Update job progress (realtime)
    await supabase.rpc('increment_job_done', { p_job_id: task.job_id })

    // Log usage for billing
    const avgTokens = 600
    await supabase.rpc('log_model_usage', {
      p_user_id: keyword.user_id,
      p_model: task.model,
      p_calls: RUNS_PER_TASK,
      p_tokens_in: avgTokens,
      p_tokens_out: avgTokens,
    })

    return new Response(JSON.stringify({ ok: true, mentioned, confidence_pct: Math.round((mentionCount / RUNS_PER_TASK) * 100) }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (e: any) {
    const attempts = (task.attempts ?? 0) + 1
    await supabase
      .from('scan_tasks')
      .update({ status: attempts >= 3 ? 'failed' : 'pending', error: e.message, attempts })
      .eq('id', task_id)

    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
