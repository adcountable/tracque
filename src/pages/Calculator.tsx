import { useMemo, useState } from 'react'
import { Calculator as CalcIcon, Home, Trees, Landmark, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { houseWholesale, landDeal, sellerFinanceBuy, type VerdictDetail } from '../lib/dealCalc'

const money = (n: number) => '$' + Math.round(n).toLocaleString()

function VerdictBanner({ d }: { d: VerdictDetail }) {
  const meta = d.verdict === 'go'
    ? { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'GO' }
    : d.verdict === 'thin'
      ? { icon: AlertTriangle, cls: 'bg-amber-50 text-amber-800 border-amber-200', label: 'THIN' }
      : { icon: XCircle, cls: 'bg-red-50 text-red-800 border-red-200', label: 'NO-GO' }
  const Icon = meta.icon
  return (
    <div className={`rounded-xl border p-4 ${meta.cls}`}>
      <div className="flex items-center gap-2 font-semibold mb-1"><Icon className="w-5 h-5" /> {meta.label} — {d.headline}</div>
      <ul className="text-sm space-y-0.5 opacity-90">{d.notes.map((n, i) => <li key={i}>· {n}</li>)}</ul>
    </div>
  )
}

function Field({ label, value, onChange, step = 1000, suffix }: {
  label: string; value: number; onChange: (n: number) => void; step?: number; suffix?: string
}) {
  return (
    <label className="text-xs text-muted-foreground block">{label}{suffix ? ` (${suffix})` : ''}
      <input type="number" step={step} value={value} onChange={e => onChange(+e.target.value)}
        className="num mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
    </label>
  )
}

function HouseTab() {
  const [arv, setArv] = useState(300000)
  const [repairs, setRepairs] = useState(40000)
  const [fee, setFee] = useState(10000)
  const [contract, setContract] = useState(155000)
  const r = useMemo(() => houseWholesale({ arv, repairs, target_fee: fee, contract_price: contract }), [arv, repairs, fee, contract])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="ARV (after-repair value)" value={arv} onChange={setArv} step={5000} />
        <Field label="Repair estimate" value={repairs} onChange={setRepairs} step={2500} />
        <Field label="Your target fee" value={fee} onChange={setFee} step={1000} />
        <Field label="Your contract price" value={contract} onChange={setContract} step={2500} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">End-buyer ceiling</div><div className="num font-semibold">{money(r.investor_ceiling)}</div></div>
        <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Your MAO</div><div className="num font-semibold">{money(r.mao)}</div></div>
        <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Fee at contract</div><div className="num font-semibold">{r.fee_at_contract != null ? money(r.fee_at_contract) : '—'}</div></div>
      </div>
      <VerdictBanner d={r.detail} />
    </div>
  )
}

function LandTab() {
  const [market, setMarket] = useState(100000)
  const [contract, setContract] = useState(55000)
  const [buildable, setBuildable] = useState(true)
  const r = useMemo(() => landDeal({ market_value: market, contract_price: contract, buildable }), [market, contract, buildable])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
        <Field label="Market value" value={market} onChange={setMarket} step={5000} />
        <Field label="Your contract price" value={contract} onChange={setContract} step={2500} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
          <input type="checkbox" checked={buildable} onChange={e => setBuildable(e.target.checked)} /> Buildable (road access, no floodplain)
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Quick-sale resale</div><div className="num font-semibold">{money(r.resale_price)}</div></div>
        <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Closing costs</div><div className="num font-semibold">{money(r.closing_costs)}</div></div>
        <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Your spread</div><div className="num font-semibold text-emerald-600">{money(r.spread)}</div></div>
      </div>
      <VerdictBanner d={r.detail} />
    </div>
  )
}

function SellerFinanceTab() {
  const [price, setPrice] = useState(450000)
  const [downPct, setDownPct] = useState(15)
  const [rate, setRate] = useState(6)
  const [term, setTerm] = useState(30)
  const [ti, setTi] = useState(350)
  const [rent, setRent] = useState(2600)
  const [budget, setBudget] = useState(3200)
  const r = useMemo(() => sellerFinanceBuy({
    price, down_pct: downPct / 100, rate, term_years: term,
    taxes_insurance_monthly: ti, market_rent: rent, monthly_budget: budget,
  }), [price, downPct, rate, term, ti, rent, budget])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Price" value={price} onChange={setPrice} step={5000} />
        <Field label="Down" value={downPct} onChange={setDownPct} step={1} suffix="%" />
        <Field label="Rate" value={rate} onChange={setRate} step={0.25} suffix="%/yr" />
        <Field label="Term" value={term} onChange={setTerm} step={5} suffix="years" />
        <Field label="Taxes + insurance /mo" value={ti} onChange={setTi} step={25} />
        <Field label="Market rent /mo" value={rent} onChange={setRent} step={50} />
        <Field label="Your budget /mo" value={budget} onChange={setBudget} step={100} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Down payment</div><div className="num font-semibold">{money(r.down_payment)}</div></div>
        <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Monthly total</div><div className="num font-semibold">{money(r.monthly_total)}</div></div>
        <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">vs. rent</div><div className={`num font-semibold ${r.vs_rent <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{r.vs_rent <= 0 ? '−' : '+'}{money(Math.abs(r.vs_rent))}/mo</div></div>
      </div>
      <VerdictBanner d={r.detail} />
    </div>
  )
}

const TABS = [
  { key: 'house', label: 'House wholesale', icon: Home, blurb: 'MAO via the 70% rule — your ceiling and assignment fee.' },
  { key: 'land', label: 'Land wholesale', icon: Trees, blurb: 'Contract vs quick-sale resale — is the spread worth it?' },
  { key: 'sf', label: 'Seller-finance buy', icon: Landmark, blurb: 'Monthly PITI vs your budget and market rent.' },
] as const

export default function Calculator() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('house')
  const active = TABS.find(t => t.key === tab)!
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <CalcIcon className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Deal Calculator</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-5">The go/no-go check before you sign anything. Conservative on purpose — bad deals should die here, not at closing.</p>

      <div className="flex flex-wrap gap-2 mb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${tab === t.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:border-primary/50'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mb-5">{active.blurb}</p>

      <div className="bg-card rounded-xl border border-border p-5">
        {tab === 'house' && <HouseTab />}
        {tab === 'land' && <LandTab />}
        {tab === 'sf' && <SellerFinanceTab />}
      </div>

      <p className="text-[11px] text-muted-foreground mt-6 leading-relaxed">
        Rules of thumb (70% rule, quick-sale discounts) — sanity checks, not appraisals. Verify ARV with comps and repairs with a walkthrough or contractor bid before contracting. Not financial advice.
      </p>
    </div>
  )
}
