import { TrendingUp, Bot, Search, Building2, Hash, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

const stats = [
  { label: 'Avg AI Mention Rate', value: '34%', change: +8, icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50' },
  { label: 'Avg SEO Position', value: '4.2', change: -1.1, icon: Search, color: 'text-violet-600', bg: 'bg-violet-50' },
  { label: 'Brands Tracked', value: '3', change: 0, icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { label: 'Keywords Active', value: '12', change: +3, icon: Hash, color: 'text-amber-600', bg: 'bg-amber-50' },
]

const recentResults = [
  { brand: 'Acme Corp', keyword: 'best project management software', model: 'ChatGPT', mentioned: true, sentiment: 'positive', position: 2 },
  { brand: 'Acme Corp', keyword: 'project management tools 2025', model: 'Perplexity', mentioned: true, sentiment: 'neutral', position: 1 },
  { brand: 'Acme Corp', keyword: 'best project management software', model: 'Gemini', mentioned: false, sentiment: null, position: null },
  { brand: 'Rival Inc', keyword: 'best project management software', model: 'ChatGPT', mentioned: true, sentiment: 'positive', position: 1 },
  { brand: 'Rival Inc', keyword: 'project management tools 2025', model: 'Perplexity', mentioned: false, sentiment: null, position: null },
]

const models = ['ChatGPT', 'Perplexity', 'Gemini', 'Claude', 'Grok']
const sovData = [
  { brand: 'Acme Corp', pct: 42, color: 'bg-blue-500' },
  { brand: 'Rival Inc', pct: 31, color: 'bg-violet-500' },
  { brand: 'Others', pct: 27, color: 'bg-slate-200' },
]

function ChangeChip({ change }: { change: number }) {
  if (change === 0) return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="w-3 h-3" />No change</span>
  const up = change > 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {up ? '+' : ''}{change} vs last week
    </span>
  )
}

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-xs text-muted-foreground">Last scan: 2 hours ago</p>
          </div>
        </div>
        <button className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors">
          Run Scan Now
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, change, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-4 shadow-card">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <ChangeChip change={change} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* AI Share of Voice */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">AI Share of Voice</p>
          <div className="space-y-2">
            {sovData.map(({ brand, pct, color }) => (
              <div key={brand}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-foreground font-medium">{brand}</span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Model Coverage */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Model Coverage</p>
          <div className="space-y-2">
            {models.map((m) => (
              <div key={m} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{m}</span>
                <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">Active</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sentiment */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Sentiment Breakdown</p>
          <div className="flex flex-col gap-2">
            {[{ label: 'Positive', pct: 58, color: 'bg-emerald-500' }, { label: 'Neutral', pct: 34, color: 'bg-amber-400' }, { label: 'Negative', pct: 8, color: 'bg-red-400' }].map(({ label, pct, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-foreground">{label}</span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Results */}
      <div className="bg-card rounded-xl border border-border shadow-card">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent AI Scan Results</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['Brand', 'Keyword', 'Model', 'Mentioned', 'Sentiment', 'Position'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentResults.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-sm font-medium">{r.brand}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{r.keyword}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{r.model}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium ${r.mentioned ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {r.mentioned ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {r.sentiment ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      r.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-700' :
                      r.sentiment === 'neutral' ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>{r.sentiment}</span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-sm text-muted-foreground">
                  {r.position ? `#${r.position}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
