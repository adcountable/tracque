import { useMemo, useState } from 'react'
import {
  Home, MapPin, Search, Loader2, Copy, Check, ChevronDown, ChevronUp,
  TrendingDown, Clock, Landmark, UserX, AlertTriangle, Sparkles, DollarSign,
} from 'lucide-react'
import {
  runScan, type PropertyScore, type Strategy, type ScanParams,
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

function money(n: number) {
  return '$' + Math.round(n).toLocaleString()
}

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

function PropertyCard({ s }: { s: PropertyScore }) {
  const [open, setOpen] = useState(false)
  const p = s.property
  const d = s.deal_math
  const border = s.fit_score >= 75 ? 'border-l-emerald-500' : s.fit_score >= 50 ? 'border-l-amber-400' : 'border-l-slate-300'

  return (
    <div className={`bg-card rounded-xl border border-border border-l-4 ${border} shadow-card`}>
      <div className="px-4 py-3 cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex items-start gap-3">
          <ScoreRing score={s.fit_score} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{p.address}</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" /> {p.neighborhood} · {p.zip}
              </span>
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {p.beds} bd · {p.baths} ba · {p.sqft.toLocaleString()} sqft · built {p.year_built}
            </div>
            {/* Signal badges */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {s.signals.filter(sig => sig.present).map(sig => {
                const Icon = SIGNAL_ICON[sig.key] ?? Sparkles
                return (
                  <span key={sig.key} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                    <Icon className="w-3 h-3" /> {sig.label}
                  </span>
                )
              })}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-semibold text-foreground">{money(p.list_price)}</div>
            <div className="text-xs text-muted-foreground">AVM {money(p.avm_value)}</div>
            <div className={`text-xs mt-1 inline-flex items-center gap-1 ${d.monthly_total <= (d.vs_rent_estimate + d.monthly_total) ? '' : ''} text-muted-foreground`}>
              ≈ {money(d.monthly_total)}/mo
            </div>
            <div className="mt-1 text-muted-foreground">{open ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}</div>
          </div>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60 space-y-4">
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

          {/* Outreach */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Draft outreach to listing agent</h4>
              <CopyButton text={`Subject: ${s.outreach.subject}\n\n${s.outreach.body}`} label="Copy message" />
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <div className="font-medium text-foreground mb-1">{s.outreach.subject}</div>
              <div className="text-muted-foreground text-xs mb-2">To: {p.agent_name} · {p.agent_brokerage}</div>
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
  const [maxPrice, setMaxPrice] = useState(650000)
  const [minBeds, setMinBeds] = useState(3)
  const [budget, setBudget] = useState(3200)
  const [buyerName, setBuyerName] = useState('John')
  const [running, setRunning] = useState(false)
  const [seed, setSeed] = useState(42)

  const params: ScanParams = useMemo(() => ({
    strategy, max_price: maxPrice, min_beds: minBeds, monthly_budget: budget, buyer_name: buyerName,
  }), [strategy, maxPrice, minBeds, budget, buyerName])

  const results = useMemo(() => runScan(params, seed), [params, seed])

  function handleScan() {
    setRunning(true)
    // Simulate the scan pass; production hits the scan-properties edge function.
    setTimeout(() => { setSeed(s => s + 1); setRunning(false) }, 650)
  }

  const activeStrat = STRATEGIES.find(s => s.key === strategy)!

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Home className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Deal Finder</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Demo data · Nashville</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Ranked creative-finance candidates. Signals from listing + Davidson County public records (mocked in demo).
      </p>

      {/* Strategy tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STRATEGIES.map(st => (
          <button key={st.key} onClick={() => setStrategy(st.key)}
            className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
              strategy === st.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:border-primary/50'
            }`}>
            {st.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground -mt-2 mb-4">{activeStrat.blurb}</p>

      {/* Controls */}
      <div className="bg-card rounded-xl border border-border p-4 mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
        <label className="text-xs text-muted-foreground">Max price
          <input type="number" step={25000} value={maxPrice} onChange={e => setMaxPrice(+e.target.value)}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Min beds
          <input type="number" value={minBeds} onChange={e => setMinBeds(+e.target.value)}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Monthly budget
          <input type="number" step={100} value={budget} onChange={e => setBudget(+e.target.value)}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Your name
          <input value={buyerName} onChange={e => setBuyerName(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
        </label>
        <button onClick={handleScan} disabled={running}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
          {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning</> : <><Search className="w-4 h-4" /> Scan</>}
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{results.length} candidates · ranked by fit</span>
      </div>

      <div className="space-y-3">
        {results.map(s => <PropertyCard key={s.property.external_id} s={s} />)}
        {results.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No matches — try raising max price or lowering min beds.</div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-8 leading-relaxed border-t border-border pt-4">
        Demo data is synthetic. Production wires RentCast (listings, AVM, rent) + Davidson County records (liens, tenure, distress).
        Outreach targets the <strong>listing agent</strong> to stay clear of TCPA. Subject-to and seller-finance carry legal/compliance
        considerations (due-on-sale, Dodd-Frank/SAFE Act) — this tool surfaces opportunities; structure deals with a real estate attorney.
      </p>
    </div>
  )
}
