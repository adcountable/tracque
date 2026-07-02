import { useEffect, useMemo, useState } from 'react'
import {
  Home, MapPin, Search, Loader2, Copy, Check, ChevronDown, ChevronUp,
  TrendingDown, Clock, Landmark, UserX, AlertTriangle, Sparkles, DollarSign,
  Filter, Download, Bookmark, BookmarkCheck, Phone, Mail, Building2, X,
} from 'lucide-react'
import {
  runScan, applyFilters, summarize, skipTrace, toCSV,
  QUICK_LISTS, type PropertyScore, type Strategy, type ScanParams,
  type PropertyFilters, type OwnerType,
} from '../lib/propertyEngine'

const STRATEGIES: { key: Strategy; label: string; blurb: string }[] = [
  { key: 'seller_finance', label: 'Seller Finance', blurb: 'Owner carries the note — best for free-and-clear owners' },
  { key: 'subject_to', label: 'Subject-To', blurb: 'Take over an existing low-rate mortgage' },
  { key: 'rent_instead_of_sell', label: 'Rent Instead of Sell', blurb: 'Pitch a lease on a stale listing' },
]

const SIGNAL_ICON: Record<string, typeof Clock> = {
  free_clear: Landmark, tenure: Clock, absentee: UserX, dom: Clock,
  cuts: TrendingDown, distress: AlertTriangle, has_loan: Landmark,
  low_rate: DollarSign, golden_vintage: Sparkles, equity: DollarSign, motivation: AlertTriangle,
}

const OWNER_TYPE_LABEL: Record<OwnerType, string> = {
  owner_occupied: 'Owner-occupied', absentee_in_state: 'Absentee (in-state)', absentee_out_of_state: 'Out-of-state',
}

const DISTRESS_LABEL: Record<string, string> = {
  preforeclosure: 'Pre-foreclosure', tax_lien: 'Tax delinquent', probate: 'Probate',
  code_violation: 'Code violation', vacant: 'Vacant',
}

const money = (n: number) => '$' + Math.round(n).toLocaleString()
const LS_KEY = 'tracque_saved_lists'

type SavedLists = Record<string, string[]>  // list name -> external_ids

function loadLists(): SavedLists {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
function saveLists(l: SavedLists) { localStorage.setItem(LS_KEY, JSON.stringify(l)) }

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? 'text-emerald-600' : score >= 50 ? 'text-amber-500' : 'text-slate-400'
  const bg = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-400' : 'bg-slate-300'
  return (
    <div className="flex flex-col items-center shrink-0 w-14">
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
      <div className="w-full h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
        <div className={`h-full ${bg}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground mt-0.5">fit</span>
    </div>
  )
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:border-primary hover:text-primary transition-colors text-muted-foreground"
    >
      {copied ? <><Check className="w-3 h-3 text-emerald-500" /> Copied</> : <><Copy className="w-3 h-3" /> {label}</>}
    </button>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg border border-border px-3 py-2">
      <div className="text-lg font-bold text-foreground leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

function PropertyCard({ s, saved, onToggleSave }: {
  s: PropertyScore; saved: boolean; onToggleSave: () => void
}) {
  const [open, setOpen] = useState(false)
  const [contact, setContact] = useState<{ owner_phone: string; owner_email: string } | null>(null)
  const p = s.property
  const d = s.deal_math
  const border = s.fit_score >= 75 ? 'border-l-emerald-500' : s.fit_score >= 50 ? 'border-l-amber-400' : 'border-l-slate-300'
  const equityPct = Math.round(p.equity_pct * 100)

  return (
    <div className={`bg-card rounded-xl border border-border border-l-4 ${border} shadow-card`}>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <ScoreRing score={s.fit_score} />
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setOpen(o => !o)}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{p.address}</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" /> {p.neighborhood} · {p.city}, {p.state} {p.zip}
              </span>
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {p.beds} bd · {p.baths} ba · {p.sqft.toLocaleString()} sqft · built {p.year_built} · {OWNER_TYPE_LABEL[p.owner_type]}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                <DollarSign className="w-3 h-3" /> {equityPct}% equity
              </span>
              {!p.has_open_mortgage && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <Landmark className="w-3 h-3" /> Free & clear
                </span>
              )}
              {p.distress_flags.map(f => (
                <span key={f} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                  <AlertTriangle className="w-3 h-3" /> {DISTRESS_LABEL[f] ?? f}
                </span>
              ))}
              {p.days_on_market >= 75 && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                  <Clock className="w-3 h-3" /> {p.days_on_market} DOM
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-semibold text-foreground">{money(p.list_price)}</div>
            <div className="text-xs text-muted-foreground">AVM {money(p.avm_value)}</div>
            <div className="text-xs mt-1 text-muted-foreground">≈ {money(d.monthly_total)}/mo</div>
            <div className="flex items-center gap-1.5 justify-end mt-1.5">
              <button onClick={onToggleSave} title={saved ? 'Saved' : 'Save to list'}
                className={`p-1 rounded border ${saved ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-primary hover:border-primary'}`}>
                {saved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setOpen(o => !o)} className="p-1 text-muted-foreground">
                {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60 space-y-4">
          {/* Owner + skip trace */}
          <div className="flex items-center justify-between flex-wrap gap-2 bg-muted/30 rounded-lg px-3 py-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Owner: </span>
              <span className="font-medium text-foreground">{p.owner_name}</span>
              <span className="text-muted-foreground"> · owned {p.ownership_years} yrs</span>
              {contact && (
                <span className="ml-2 inline-flex items-center gap-2 text-xs text-foreground">
                  <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{contact.owner_phone}</span>
                  <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{contact.owner_email}</span>
                </span>
              )}
            </div>
            {!contact && (
              <button onClick={() => setContact(skipTrace(p))}
                className="text-xs px-2 py-1 rounded border border-border hover:border-primary hover:text-primary text-muted-foreground inline-flex items-center gap-1">
                <Search className="w-3 h-3" /> Skip trace
              </button>
            )}
          </div>

          {/* Why */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Why it scored</h4>
            <ul className="space-y-1">
              {s.reasons.map((r, i) => (
                <li key={i} className="text-sm text-foreground flex gap-2"><span className="text-emerald-500">✓</span>{r}</li>
              ))}
              {s.reasons.length === 0 && <li className="text-sm text-muted-foreground">No strong signals for this strategy.</li>}
            </ul>
          </div>

          {/* Deal math */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Deal math ({s.strategy.replace(/_/g, ' ')})</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Down</div><div className="font-semibold">{money(d.down_payment)}</div></div>
              <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Financed</div><div className="font-semibold">{money(d.financed_amount)}</div></div>
              <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Terms</div><div className="font-semibold">{d.interest_rate}% / {d.term_years}yr</div></div>
              <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Monthly (PITI)</div><div className="font-semibold">{money(d.monthly_total)}</div></div>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Est. market rent {money(p.rent_estimate)}/mo — this payment is{' '}
              <span className={d.vs_rent_estimate <= 0 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                {d.vs_rent_estimate <= 0 ? `${money(Math.abs(d.vs_rent_estimate))} cheaper than renting` : `${money(d.vs_rent_estimate)} above market rent`}
              </span>.
              {d.fits_budget === true && <span className="text-emerald-600 font-medium"> ✓ Within your budget.</span>}
              {d.fits_budget === false && <span className="text-amber-600"> Over your target budget.</span>}
            </p>
          </div>

          {/* Comps */}
          {s.comps.comps.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Comps — subject {money(s.comps.subject_ppsf)}/sqft vs area avg {money(s.comps.avg_ppsf)}/sqft
              </h4>
              <div className="space-y-1">
                {s.comps.comps.map((c, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted-foreground">
                    <span>{c.address} · {c.sqft.toLocaleString()} sqft</span>
                    <span>{money(c.sale_or_list)} · {money(c.price_per_sqft)}/sqft</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outreach */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Draft outreach to listing agent</h4>
              <CopyButton text={`Subject: ${s.outreach.subject}\n\n${s.outreach.body}`} label="Copy message" />
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <div className="font-medium text-foreground mb-1">{s.outreach.subject}</div>
              <div className="text-muted-foreground text-xs mb-2 inline-flex items-center gap-1"><Building2 className="w-3 h-3" /> {p.agent_name} · {p.agent_brokerage}</div>
              <pre className="whitespace-pre-wrap font-sans text-foreground text-sm leading-relaxed">{s.outreach.body}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Properties() {
  const [strategy, setStrategy] = useState<Strategy>('seller_finance')
  const [city, setCity] = useState('Nashville')
  const [stateAbbr, setStateAbbr] = useState('TN')
  const [budget, setBudget] = useState(3200)
  const [buyerName, setBuyerName] = useState('John')
  const [running, setRunning] = useState(false)
  const [seed, setSeed] = useState(42)
  const [showFilters, setShowFilters] = useState(true)

  // Filters
  const [quickLists, setQuickLists] = useState<string[]>([])
  const [maxPrice, setMaxPrice] = useState(650000)
  const [minBeds, setMinBeds] = useState(3)
  const [minBaths, setMinBaths] = useState(0)
  const [minEquityPct, setMinEquityPct] = useState(0)
  const [minOwnershipYears, setMinOwnershipYears] = useState(0)
  const [ownerType, setOwnerType] = useState<OwnerType | 'any'>('any')

  // Saved lists
  const [lists, setLists] = useState<SavedLists>({})
  const [activeList, setActiveList] = useState('My List')
  useEffect(() => { setLists(loadLists()) }, [])
  const savedIds = new Set(lists[activeList] ?? [])

  const params: ScanParams = useMemo(() => ({
    strategy, city, state: stateAbbr, max_price: 5_000_000, min_beds: 0, monthly_budget: budget, buyer_name: buyerName,
  }), [strategy, city, stateAbbr, budget, buyerName])

  // Full scan (broad), then rich filters applied client-side.
  const allScores = useMemo(() => runScan(params, seed), [params, seed])
  const filters: PropertyFilters = {
    quickLists, maxPrice, minBeds, minBaths: minBaths || undefined,
    minEquityPct: minEquityPct || undefined, minOwnershipYears: minOwnershipYears || undefined,
    ownerType,
  }
  const filteredProps = applyFilters(allScores.map(s => s.property), filters)
  const filteredIds = new Set(filteredProps.map(p => p.external_id))
  const results = allScores.filter(s => filteredIds.has(s.property.external_id))
  const summary = summarize(results.map(s => s.property))

  function handleScan() {
    setRunning(true)
    setTimeout(() => { setSeed(s => s + 1); setRunning(false) }, 650)
  }

  function toggleSave(id: string) {
    setLists(prev => {
      const cur = new Set(prev[activeList] ?? [])
      if (cur.has(id)) cur.delete(id); else cur.add(id)
      const next = { ...prev, [activeList]: [...cur] }
      saveLists(next)
      return next
    })
  }

  function exportCSV() {
    const csv = toCSV(results)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tracque-${city.toLowerCase()}-${strategy}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleQuick(key: string) {
    setQuickLists(qs => qs.includes(key) ? qs.filter(k => k !== key) : [...qs, key])
  }

  const activeStrat = STRATEGIES.find(s => s.key === strategy)!

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Home className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Deal Finder</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Demo data</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        PropStream-style search for creative-finance deals. Signals from listing + county public records (mocked in demo).
      </p>

      {/* Market + strategy */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="text-xs text-muted-foreground">City
          <input value={city} onChange={e => setCity(e.target.value)}
            className="mt-1 block w-36 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">State
          <input value={stateAbbr} onChange={e => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))}
            className="mt-1 block w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
        </label>
        <button onClick={handleScan} disabled={running}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
          {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning</> : <><Search className="w-4 h-4" /> Scan market</>}
        </button>
        <div className="flex-1" />
        <button onClick={exportCSV} disabled={results.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:border-primary disabled:opacity-50">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-1">
        {STRATEGIES.map(st => (
          <button key={st.key} onClick={() => setStrategy(st.key)}
            className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
              strategy === st.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:border-primary/50'
            }`}>
            {st.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mb-4">{activeStrat.blurb}</p>

      {/* Quick Lists */}
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Quick Lists</div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_LISTS.map(q => (
            <button key={q.key} onClick={() => toggleQuick(q.key)} title={q.desc}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                quickLists.includes(q.key) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50'
              }`}>
              {q.label}
            </button>
          ))}
          {quickLists.length > 0 && (
            <button onClick={() => setQuickLists([])} className="text-xs px-2 py-1 text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
              <X className="w-3 h-3" /> clear
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-5">
        {/* Filter rail */}
        {showFilters && (
          <aside className="w-56 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filters</span>
              <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <label className="block text-xs text-muted-foreground">Max price
              <input type="number" step={25000} value={maxPrice} onChange={e => setMaxPrice(+e.target.value)}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted-foreground">Min beds
                <input type="number" value={minBeds} onChange={e => setMinBeds(+e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
              </label>
              <label className="block text-xs text-muted-foreground">Min baths
                <input type="number" value={minBaths} onChange={e => setMinBaths(+e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
              </label>
            </div>
            <label className="block text-xs text-muted-foreground">Min equity: {minEquityPct}%
              <input type="range" min={0} max={100} step={5} value={minEquityPct} onChange={e => setMinEquityPct(+e.target.value)}
                className="mt-1 w-full" />
            </label>
            <label className="block text-xs text-muted-foreground">Min ownership: {minOwnershipYears} yrs
              <input type="range" min={0} max={25} value={minOwnershipYears} onChange={e => setMinOwnershipYears(+e.target.value)}
                className="mt-1 w-full" />
            </label>
            <label className="block text-xs text-muted-foreground">Owner type
              <select value={ownerType} onChange={e => setOwnerType(e.target.value as OwnerType | 'any')}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground">
                <option value="any">Any</option>
                <option value="owner_occupied">Owner-occupied</option>
                <option value="absentee_in_state">Absentee (in-state)</option>
                <option value="absentee_out_of_state">Out-of-state</option>
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">Monthly budget
              <input type="number" step={100} value={budget} onChange={e => setBudget(+e.target.value)}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            <label className="block text-xs text-muted-foreground">Your name
              <input value={buyerName} onChange={e => setBuyerName(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            <label className="block text-xs text-muted-foreground">Save to list
              <input value={activeList} onChange={e => setActiveList(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
              <span className="text-[10px] text-muted-foreground">{savedIds.size} saved in "{activeList}"</span>
            </label>
          </aside>
        )}

        {/* Main */}
        <div className="flex-1 min-w-0">
          {!showFilters && (
            <button onClick={() => setShowFilters(true)} className="mb-3 text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Filter className="w-3.5 h-3.5" /> Show filters
            </button>
          )}

          {/* Stat bar */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            <Stat label="Candidates" value={String(summary.count)} />
            <Stat label="Avg equity" value={`${summary.avg_equity_pct}%`} />
            <Stat label="Free & clear" value={String(summary.free_clear_count)} />
            <Stat label="Distressed" value={String(summary.distressed_count)} />
            <Stat label="Avg DOM" value={String(summary.avg_dom)} />
            <Stat label="Avg price" value={summary.avg_price ? money(summary.avg_price) : '—'} />
          </div>

          <div className="text-sm text-muted-foreground mb-3">{results.length} candidates · ranked by fit</div>

          <div className="space-y-3">
            {results.map(s => (
              <PropertyCard key={s.property.external_id} s={s}
                saved={savedIds.has(s.property.external_id)}
                onToggleSave={() => toggleSave(s.property.external_id)} />
            ))}
            {results.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">No matches — loosen your filters or Quick Lists.</div>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mt-8 leading-relaxed border-t border-border pt-4">
        Demo data is synthetic. Production wires RentCast (listings, AVM, rent), county records (liens, tenure, distress),
        and a skip-trace provider (owner phone/email). Agent outreach targets the <strong>listing agent</strong> to stay clear of TCPA;
        owner contact/skip-trace and direct marketing carry TCPA/DNC obligations. Subject-to and seller-finance carry legal/compliance
        considerations (due-on-sale, Dodd-Frank/SAFE Act) — this tool surfaces opportunities; structure deals with a real estate attorney.
      </p>
    </div>
  )
}
