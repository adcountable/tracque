import { Search, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const seoData = [
  { keyword: 'best project management software', brand: 'Acme Corp', position: 3, prevPosition: 5, url: 'acmecorp.com/features', volume: 12400, difficulty: 72 },
  { keyword: 'best project management software', brand: 'Rival Inc', position: 1, prevPosition: 1, url: 'rivalinc.com', volume: 12400, difficulty: 72 },
  { keyword: 'project management tools 2025', brand: 'Acme Corp', position: 7, prevPosition: 4, url: 'acmecorp.com/blog/tools-2025', volume: 8100, difficulty: 58 },
  { keyword: 'project management tools 2025', brand: 'Rival Inc', position: 2, prevPosition: 3, url: 'rivalinc.com/compare', volume: 8100, difficulty: 58 },
  { keyword: 'how to manage remote teams', brand: 'Acme Corp', position: 12, prevPosition: 14, url: 'acmecorp.com/blog/remote', volume: 22000, difficulty: 45 },
  { keyword: 'project management software pricing', brand: 'Acme Corp', position: 4, prevPosition: 4, url: 'acmecorp.com/pricing', volume: 3600, difficulty: 61 },
  { keyword: 'asana alternatives', brand: 'Rival Inc', position: 3, prevPosition: 6, url: 'rivalinc.com/vs-asana', volume: 5400, difficulty: 55 },
]

function PositionChange({ curr, prev }: { curr: number; prev: number }) {
  const diff = prev - curr // positive = improvement
  if (diff === 0) return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="w-3 h-3" /></span>
  if (diff > 0) return <span className="flex items-center gap-0.5 text-xs text-emerald-600 font-medium"><TrendingUp className="w-3 h-3" />+{diff}</span>
  return <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium"><TrendingDown className="w-3 h-3" />{diff}</span>
}

function PositionBadge({ pos }: { pos: number }) {
  const color = pos <= 3 ? 'bg-emerald-50 text-emerald-700 font-bold' :
    pos <= 10 ? 'bg-amber-50 text-amber-700 font-medium' :
    'bg-muted text-muted-foreground'
  return <span className={`text-xs px-2 py-0.5 rounded ${color}`}>#{pos}</span>
}

function DifficultyBar({ val }: { val: number }) {
  const color = val >= 70 ? 'bg-red-400' : val >= 50 ? 'bg-amber-400' : 'bg-emerald-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${val}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{val}</span>
    </div>
  )
}

export default function SEOResults() {
  const ownKeywords = [...new Set(seoData.filter(r => r.brand === 'Acme Corp').map(r => r.keyword))]
  const avgPos = Math.round(seoData.filter(r => r.brand === 'Acme Corp').reduce((a, r) => a + r.position, 0) / seoData.filter(r => r.brand === 'Acme Corp').length * 10) / 10
  const top3 = seoData.filter(r => r.brand === 'Acme Corp' && r.position <= 3).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <Search className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">SEO Rankings</h1>
          <p className="text-xs text-muted-foreground">Google rank tracking vs competitors</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-2xl font-bold">{avgPos}</p>
          <p className="text-xs text-muted-foreground">Avg Google position</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-2xl font-bold">{top3}</p>
          <p className="text-xs text-muted-foreground">Keywords in top 3</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-2xl font-bold">{ownKeywords.length}</p>
          <p className="text-xs text-muted-foreground">Keywords tracked</p>
        </div>
      </div>

      {/* Rankings table */}
      <div className="bg-card rounded-xl border border-border shadow-card">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rankings</p>
          <span className="text-xs text-muted-foreground">vs. last week</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['Keyword', 'Brand', 'Position', 'Change', 'URL', 'Volume', 'Difficulty'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seoData.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-sm max-w-[180px] truncate">{row.keyword}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium ${row.brand === 'Acme Corp' ? 'text-blue-600' : 'text-muted-foreground'}`}>{row.brand}</span>
                </td>
                <td className="px-4 py-2.5"><PositionBadge pos={row.position} /></td>
                <td className="px-4 py-2.5"><PositionChange curr={row.position} prev={row.prevPosition} /></td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[140px]">{row.url}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.volume.toLocaleString()}</td>
                <td className="px-4 py-2.5"><DifficultyBar val={row.difficulty} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
