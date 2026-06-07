import { useState } from 'react'
import { Hash, Plus, Trash2, Sparkles } from 'lucide-react'

interface Keyword {
  id: string
  phrase: string
  intent: 'informational' | 'commercial' | 'navigational'
  aiVolume: 'high' | 'medium' | 'low'
  seoVolume: number
  brands: string[]
}

const DEMO_KEYWORDS: Keyword[] = [
  { id: '1', phrase: 'best project management software', intent: 'commercial', aiVolume: 'high', seoVolume: 12400, brands: ['Acme Corp', 'Rival Inc'] },
  { id: '2', phrase: 'project management tools 2025', intent: 'commercial', aiVolume: 'high', seoVolume: 8100, brands: ['Acme Corp', 'Rival Inc', 'Gadget Co'] },
  { id: '3', phrase: 'how to manage remote teams', intent: 'informational', aiVolume: 'medium', seoVolume: 22000, brands: ['Acme Corp'] },
  { id: '4', phrase: 'project management software pricing', intent: 'commercial', aiVolume: 'medium', seoVolume: 3600, brands: ['Acme Corp', 'Rival Inc'] },
  { id: '5', phrase: 'asana alternatives', intent: 'commercial', aiVolume: 'low', seoVolume: 5400, brands: ['Rival Inc', 'Gadget Co'] },
]

const SUGGESTED = [
  'best task management app',
  'team collaboration tools',
  'project tracking software',
  'agile project management',
]

const INTENT_COLORS: Record<string, string> = {
  commercial: 'bg-blue-50 text-blue-700',
  informational: 'bg-violet-50 text-violet-700',
  navigational: 'bg-amber-50 text-amber-700',
}

const VOLUME_COLORS: Record<string, string> = {
  high: 'text-emerald-600',
  medium: 'text-amber-600',
  low: 'text-muted-foreground',
}

export default function Keywords() {
  const [keywords, setKeywords] = useState<Keyword[]>(DEMO_KEYWORDS)
  const [showAdd, setShowAdd] = useState(false)
  const [phrase, setPhrase] = useState('')

  function addKeyword(kw: string) {
    if (!kw.trim()) return
    setKeywords(prev => [...prev, {
      id: Date.now().toString(),
      phrase: kw.trim(),
      intent: 'commercial',
      aiVolume: 'medium',
      seoVolume: 0,
      brands: [],
    }])
    setPhrase('')
    setShowAdd(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Hash className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Keywords</h1>
            <p className="text-xs text-muted-foreground">Phrases tracked across AI models and Google</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Add Keyword
        </button>
      </div>

      {/* Suggested */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI-Suggested Keywords</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED.map(s => (
            <button
              key={s}
              onClick={() => addKeyword(s)}
              className="text-xs px-2.5 py-1 border border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-card rounded-xl border border-border p-4 shadow-card flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Keyword or phrase</label>
            <input
              autoFocus
              className="w-full text-sm border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              placeholder="best project management software"
              value={phrase}
              onChange={e => setPhrase(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addKeyword(phrase)}
            />
          </div>
          <button onClick={() => addKeyword(phrase)} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg font-medium">Add</button>
          <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-lg">Cancel</button>
        </div>
      )}

      {/* Keywords table */}
      <div className="bg-card rounded-xl border border-border shadow-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['Keyword', 'Intent', 'AI Volume', 'SEO Vol/mo', 'Brands Tracked', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keywords.map((kw) => (
              <tr key={kw.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{kw.phrase}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INTENT_COLORS[kw.intent]}`}>{kw.intent}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold ${VOLUME_COLORS[kw.aiVolume]}`}>{kw.aiVolume}</span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {kw.seoVolume > 0 ? kw.seoVolume.toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {kw.brands.map(b => (
                      <span key={b} className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{b}</span>
                    ))}
                    {kw.brands.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setKeywords(k => k.filter(x => x.id !== kw.id))}
                    className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
