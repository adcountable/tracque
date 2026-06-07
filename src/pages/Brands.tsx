import { useState } from 'react'
import { Building2, Plus, Trash2, Globe, CheckCircle2 } from 'lucide-react'

interface Brand {
  id: string
  name: string
  domain: string
  type: 'own' | 'competitor'
  mentionRate: number
  avgSentiment: 'positive' | 'neutral' | 'negative'
  createdAt: string
}

const DEMO_BRANDS: Brand[] = [
  { id: '1', name: 'Acme Corp', domain: 'acmecorp.com', type: 'own', mentionRate: 42, avgSentiment: 'positive', createdAt: '2025-01-10' },
  { id: '2', name: 'Rival Inc', domain: 'rivalinc.com', type: 'competitor', mentionRate: 31, avgSentiment: 'neutral', createdAt: '2025-01-10' },
  { id: '3', name: 'Gadget Co', domain: 'gadgetco.io', type: 'competitor', mentionRate: 18, avgSentiment: 'negative', createdAt: '2025-01-12' },
]

export default function Brands() {
  const [brands, setBrands] = useState<Brand[]>(DEMO_BRANDS)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', domain: '', type: 'own' as 'own' | 'competitor' })

  function addBrand() {
    if (!form.name.trim()) return
    setBrands(prev => [...prev, {
      id: Date.now().toString(),
      ...form,
      mentionRate: 0,
      avgSentiment: 'neutral',
      createdAt: new Date().toISOString().split('T')[0],
    }])
    setForm({ name: '', domain: '', type: 'own' })
    setShowAdd(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Brands</h1>
            <p className="text-xs text-muted-foreground">Track your brand and competitors</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Brand
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-card rounded-xl border border-border p-4 shadow-card space-y-3">
          <p className="text-sm font-semibold">Add a brand to track</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Brand name</label>
              <input
                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                placeholder="Acme Corp"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Domain (optional)</label>
              <input
                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                placeholder="acmecorp.com"
                value={form.domain}
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <select
                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as 'own' | 'competitor' }))}
              >
                <option value="own">My Brand</option>
                <option value="competitor">Competitor</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addBrand} className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90">
              Add Brand
            </button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Brand cards */}
      <div className="grid grid-cols-1 gap-3">
        {brands.map((brand) => (
          <div key={brand.id} className="bg-card rounded-xl border border-border p-4 shadow-card flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
              brand.type === 'own' ? 'bg-blue-500/10 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {brand.name.charAt(0)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{brand.name}</p>
                {brand.type === 'own' && (
                  <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> My Brand
                  </span>
                )}
              </div>
              {brand.domain && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <Globe className="w-3 h-3" />{brand.domain}
                </div>
              )}
            </div>

            <div className="flex items-center gap-6 text-center">
              <div>
                <p className="text-lg font-bold text-foreground">{brand.mentionRate}%</p>
                <p className="text-xs text-muted-foreground">Mention rate</p>
              </div>
              <div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  brand.avgSentiment === 'positive' ? 'bg-emerald-50 text-emerald-700' :
                  brand.avgSentiment === 'neutral' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-700'
                }`}>{brand.avgSentiment}</span>
                <p className="text-xs text-muted-foreground mt-0.5">Sentiment</p>
              </div>
            </div>

            <button
              onClick={() => setBrands(b => b.filter(x => x.id !== brand.id))}
              className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
