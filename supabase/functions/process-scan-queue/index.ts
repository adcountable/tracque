// Tracque — Scan Queue Processor
// Called by pg_cron every 5 minutes OR on-demand via webhook
// Picks up pending tasks in batches, respects per-model rate limits
// Handles thousands of customers scanning daily without timeouts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Per-model rate limits (requests per minute)
const RATE_LIMITS: Record<string, number> = {
  chatgpt:    60,
  perplexity: 50,
  gemini:     60,
  claude:     50,
  grok:       60,
}

// Delay between requests per model (ms)
function delayForModel(model: string): number {
  const rpm = RATE_LIMITS[model] ?? 50
  return Math.ceil(60000 / rpm) + 200 // add 200ms buffer
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Model callers (same as run-scan but imported inline) ───

async function callModel(model: string, prompt: string): Promise<{ text: string; citations: string[]; grounded: boolean }> {
  switch (model) {
    case 'chatgpt': {
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
      if (!text) {
        // fallback
        const fb = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 800, temperature: 0.7 }),
        })
        const fd = await fb.json()
        return { text: fd.choices?.[0]?.message?.content ?? '', citations: [], grounded: false }
      }
      return { text, citations: [...new Set(citations)], grounded: true }
    }
    case 'perplexity': {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('PERPLEXITY_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.1-sonar-large-128k-online', messages: [{ role: 'user', content: prompt }], max_tokens: 800, temperature: 0.7, return_citations: true }),
      })
      const data = await res.json()
      const citations = (data.citations ?? []).map((u: string) => { try { return new URL(u).hostname.replace('www.', '') } catch { return u } })
      return { text: data.choices?.[0]?.message?.content ?? '', citations: [...new Set(citations)], grounded: true }
    }
    case 'gemini': {
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
    }
    case 'claude': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }], messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await res.json()
      let text = ''
      for (const block of data.content ?? []) { if (block.type === 'text') text += block.text }
      return { text, citations: [], grounded: false }
    }
    case 'grok': {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('XAI_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'grok-beta', messages: [{ role: 'user', content: prompt }], max_tokens: 800, temperature: 0.7 }),
      })
      const data = await res.json()
      return { text: data.choices?.[0]?.message?.content ?? '', citations: [], grounded: false }
    }
    default:
      throw new Error(`Unknown model: ${model}`)
  }
}

function parseResponse(text: string, brandName: string) {
  const lower = text.toLowerCase()
  const brandLower = brandName.toLowerCase()
  const mentioned = lower.includes(brandLower)
  if (!mentioned) return { mentioned: false, sentiment: null, position: null, excerpt: null }

  const firstIdx = lower.indexOf(brandLower)
  const textBefore = text.slice(0, firstIdx)
  const position = [...new Set(textBefore.match(/\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*/g) ?? [])].length + 1

  const sentences = text.split(/(?<=[.!?])\s+/)
  const excerpt = (sentences.find(s => s.toLowerCase().includes(brandLower)) ?? '').slice(0, 400)

  const window = text.slice(Math.max(0, firstIdx - 300), firstIdx + 500).toLowerCase()
  const pos = ['leading','best','top','excellent','popular','recommended','powerful','trusted','robust'].filter(w => window.includes(w)).length
  const neg = ['poor','bad','expensive','limited','worst','avoid','slow','unreliable','disappointing'].filter(w => window.includes(w)).length
  const sentiment = pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral'

  return { mentioned, sentiment, position, excerpt }
}

// ── Main processor ─────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }

  const BATCH_SIZE = 20 // tasks per invocation
  const MAX_RUNTIME_MS = 120_000 // 2 min hard limit
  const startTime = Date.now()

  let processed = 0
  let failed = 0

  // Pull next batch of pending tasks
  const { data: tasks } = await supabase
    .from('scan_tasks')
    .select(`
      id, job_id, model, attempts,
      keyword:keywords(id, phrase),
      brand:brands(id, name, domain)
    `)
    .eq('status', 'pending')
    .lt('attempts', 3) // max 3 retries
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (!tasks?.length) {
    return new Response(JSON.stringify({ ok: true, message: 'No pending tasks', processed: 0 }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Check which API keys are available
  const availableModels = new Set(
    ['chatgpt','perplexity','gemini','claude','grok'].filter(m => {
      const keys: Record<string,string> = { chatgpt: 'OPENAI_API_KEY', perplexity: 'PERPLEXITY_API_KEY', gemini: 'GEMINI_API_KEY', claude: 'ANTHROPIC_API_KEY', grok: 'XAI_API_KEY' }
      return !!Deno.env.get(keys[m])
    })
  )

  for (const task of tasks) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) break
    if (!availableModels.has(task.model)) {
      await supabase.from('scan_tasks').update({ status: 'failed', error: 'No API key configured' }).eq('id', task.id)
      continue
    }

    // Mark as running
    await supabase.from('scan_tasks').update({ status: 'running', started_at: new Date().toISOString(), attempts: task.attempts + 1 }).eq('id', task.id)

    try {
      const keyword = task.keyword as any
      const brand = task.brand as any
      const prompt = `${keyword.phrase}\n\nProvide a detailed, objective answer. Name specific products, tools, or companies where relevant.`

      // Run 3 times for confidence
      const RUNS = 3
      const responses = []
      for (let i = 0; i < RUNS; i++) {
        const r = await callModel(task.model, prompt)
        responses.push(r)
        if (i < RUNS - 1) await sleep(delayForModel(task.model))
      }

      // Aggregate
      const parsed = responses.map(r => parseResponse(r.text, brand.name))
      const mentioned = parsed.filter(p => p.mentioned).length
      const mentionedBool = mentioned > RUNS / 2
      const allSentiments = parsed.filter(p => p.mentioned && p.sentiment).map(p => p.sentiment as string)
      const sentimentCounts = allSentiments.reduce((a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {} as Record<string,number>)
      const sentiment = Object.entries(sentimentCounts).sort(([,a],[,b]) => b-a)[0]?.[0] ?? null
      const positions = parsed.filter(p => p.position).map(p => p.position as number)
      const position = positions.length ? Math.round(positions.reduce((a,b) => a+b, 0) / positions.length) : null
      const excerpt = parsed.find(p => p.mentioned)?.excerpt ?? null
      const allCitations = [...new Set(responses.flatMap(r => r.citations))]

      // Store result
      const { data: result } = await supabase.from('scan_results').insert({
        keyword_id: keyword.id,
        brand_id: brand.id,
        model: task.model,
        mentioned: mentionedBool,
        sentiment,
        position,
        excerpt,
        sources: allCitations,
        citation_urls: allCitations,
        runs_total: RUNS,
        runs_mentioned: mentioned,
        confidence_pct: Math.round((mentioned / RUNS) * 100),
        all_sentiments: allSentiments,
        web_grounded: responses.some(r => r.grounded),
        raw_response: responses[0].text,
      }).select().single()

      // Mark task done
      await supabase.from('scan_tasks').update({
        status: 'completed',
        result_id: result?.id,
        completed_at: new Date().toISOString(),
      }).eq('id', task.id)

      // Update job progress
      await supabase.rpc('increment_job_done', { p_job_id: task.job_id })

      processed++
    } catch (e: any) {
      await supabase.from('scan_tasks').update({
        status: task.attempts + 1 >= 3 ? 'failed' : 'pending',
        error: e.message,
      }).eq('id', task.id)
      failed++
    }

    // Rate limit delay
    await sleep(delayForModel(task.model))
  }

  // Mark completed jobs
  await supabase.from('scan_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('status', 'running')
    .filter('total_tasks', 'eq', supabase.from('scan_tasks').select('count').eq('job_id', 'scan_jobs.id').eq('status', 'completed'))

  return new Response(JSON.stringify({
    ok: true,
    processed,
    failed,
    runtime_ms: Date.now() - startTime,
  }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
})
