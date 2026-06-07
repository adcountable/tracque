import { Bot, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'

const MODELS = ['ChatGPT', 'Perplexity', 'Gemini', 'Claude', 'Grok']

const results = [
  {
    keyword: 'best project management software',
    entries: [
      { model: 'ChatGPT', mentioned: true, sentiment: 'positive', position: 2, excerpt: 'Acme Corp is widely regarded as one of the top project management tools, offering...', sources: ['g2.com', 'techradar.com'] },
      { model: 'Perplexity', mentioned: true, sentiment: 'neutral', position: 1, excerpt: 'Among the leading options, Acme Corp provides robust features for teams...', sources: ['reddit.com', 'capterra.com'] },
      { model: 'Gemini', mentioned: false, sentiment: null, position: null, excerpt: null, sources: [] },
      { model: 'Claude', mentioned: true, sentiment: 'positive', position: 3, excerpt: 'Acme Corp stands out for its intuitive interface and strong collaboration features...', sources: ['g2.com'] },
      { model: 'Grok', mentioned: false, sentiment: null, position: null, excerpt: null, sources: [] },
    ]
  },
  {
    keyword: 'project management tools 2025',
    entries: [
      { model: 'ChatGPT', mentioned: true, sentiment: 'positive', position: 1, excerpt: 'In 2025, Acme Corp leads the category with its AI-powered features...', sources: ['forbes.com', 'g2.com'] },
      { model: 'Perplexity', mentioned: false, sentiment: null, position: null, excerpt: null, sources: [] },
      { model: 'Gemini', mentioned: true, sentiment: 'neutral', position: 4, excerpt: 'Acme Corp is one of several tools worth evaluating...', sources: ['capterra.com'] },
      { model: 'Claude', mentioned: true, sentiment: 'positive', position: 2, excerpt: 'For 2025, Acme Corp continues to be a top recommendation...', sources: ['techcrunch.com'] },
      { model: 'Grok', mentioned: true, sentiment: 'neutral', position: 3, excerpt: 'Acme Corp appears frequently in reviews of project management tools...', sources: ['reddit.com'] },
    ]
  },
]

function ModelBadge({ model }: { model: string }) {
  const colors: Record<string, string> = {
    ChatGPT: 'bg-emerald-50 text-emerald-700',
    Perplexity: 'bg-blue-50 text-blue-700',
    Gemini: 'bg-violet-50 text-violet-700',
    Claude: 'bg-amber-50 text-amber-700',
    Grok: 'bg-slate-100 text-slate-700',
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[model] ?? 'bg-muted text-muted-foreground'}`}>{model}</span>
}

export default function AIResults() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">AI Visibility</h1>
            <p className="text-xs text-muted-foreground">How AI models mention your brand</p>
          </div>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Re-scan
        </button>
      </div>

      {/* Coverage summary */}
      <div className="grid grid-cols-5 gap-3">
        {MODELS.map(model => {
          const total = results.reduce((acc, r) => acc + r.entries.filter(e => e.model === model).length, 0)
          const mentioned = results.reduce((acc, r) => acc + r.entries.filter(e => e.model === model && e.mentioned).length, 0)
          const pct = total > 0 ? Math.round((mentioned / total) * 100) : 0
          return (
            <div key={model} className="bg-card rounded-xl border border-border p-3 shadow-card text-center">
              <ModelBadge model={model} />
              <p className="text-2xl font-bold mt-2">{pct}%</p>
              <p className="text-xs text-muted-foreground">mention rate</p>
            </div>
          )
        })}
      </div>

      {/* Results by keyword */}
      <div className="space-y-4">
        {results.map(({ keyword, entries }) => (
          <div key={keyword} className="bg-card rounded-xl border border-border shadow-card">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">"{keyword}"</p>
            </div>
            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.model} className="px-4 py-3 flex items-start gap-4">
                  <div className="w-24 shrink-0 pt-0.5">
                    <ModelBadge model={entry.model} />
                  </div>
                  <div className="shrink-0">
                    {entry.mentioned
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-muted-foreground mt-0.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {entry.mentioned ? (
                      <>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs text-muted-foreground">Position #{entry.position}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            entry.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-700' :
                            entry.sentiment === 'neutral' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-700'
                          }`}>{entry.sentiment}</span>
                          {entry.sources.map(s => (
                            <span key={s} className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{s}</span>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground italic line-clamp-1">"{entry.excerpt}"</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not mentioned in this response</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
