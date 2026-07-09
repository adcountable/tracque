import { useMemo, useState } from 'react'
import {
  Trees, MapPin, ChevronDown, ChevronUp, AlertTriangle, ShieldCheck, Copy, Check,
  FileText, Search, Loader2,
} from 'lucide-react'
import {
  runLandScan, assignmentNotice, intentToAssignDisclosure, equitableInterestDisclosure,
  type LandScore, type DealParties,
} from '../lib/land'

const money = (n: number) => '$' + Math.round(n).toLocaleString()

// Land has no street address — the APN is the identity. Link to the
// authoritative sources: county GIS (exact for Davidson), Regrid's public
// parcel map, and a web search fallback for other counties.
function parcelLinks(p: LandScore['parcel']): { label: string; href: string }[] {
  const apnRaw = p.apn.replace(/[^0-9A-Za-z]/g, '')
  const links: { label: string; href: string }[] = []
  if (p.county === 'Davidson') {
    links.push({ label: 'County GIS', href: `https://maps.nashville.gov/ParcelViewer/?parcelID=${apnRaw}` })
  } else {
    links.push({ label: 'County GIS', href: `https://www.google.com/search?q=${encodeURIComponent(`${p.county} County TN GIS parcel viewer ${p.apn}`)}` })
  }
  links.push(
    { label: 'Regrid', href: `https://app.regrid.com/search?query=${encodeURIComponent(`${p.apn} ${p.county} County TN`)}` },
    { label: 'LandWatch', href: `https://www.landwatch.com/tennessee-land-for-sale/${p.county.toLowerCase()}-county` },
    { label: 'Maps', href: `https://www.google.com/maps/search/${encodeURIComponent(`${p.location}, ${p.county} County, TN`)}` },
  )
  return links
}

function Copyable({ text, label }: { text: string; label: string }) {
  const [c, setC] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1500) }}
      className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:border-primary hover:text-primary text-muted-foreground">
      {c ? <><Check className="w-3 h-3 text-emerald-500" /> Copied</> : <><Copy className="w-3 h-3" /> {label}</>}
    </button>
  )
}

function Disclosures({ s }: { s: LandScore }) {
  const [seller, setSeller] = useState(s.parcel.owner_name)
  const [wholesaler, setWholesaler] = useState('John Buyer')
  const [endBuyer, setEndBuyer] = useState('')
  const [contractDate, setContractDate] = useState('2026-07-06')
  const [noticeDate, setNoticeDate] = useState('2026-07-06')

  const parties: DealParties = {
    wholesaler, seller, end_buyer: endBuyer || undefined,
    property: `APN ${s.parcel.apn} — ${s.parcel.location}, ${s.parcel.county} County, TN`,
    contract_date: contractDate,
  }
  const notice = assignmentNotice(parties, noticeDate)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="text-xs text-muted-foreground">Your name (buyer)
          <input value={wholesaler} onChange={e => setWholesaler(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
        </label>
        <label className="text-xs text-muted-foreground">Seller
          <input value={seller} onChange={e => setSeller(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
        </label>
        <label className="text-xs text-muted-foreground">End buyer
          <input value={endBuyer} onChange={e => setEndBuyer(e.target.value)} placeholder="(when assigning)" className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
        </label>
        <label className="text-xs text-muted-foreground">Contract date
          <input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
        </label>
        <label className="text-xs text-muted-foreground">Assignment notice date
          <input type="date" value={noticeDate} onChange={e => setNoticeDate(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
        </label>
        <div className="text-xs text-muted-foreground self-end">
          Earliest assignment date:<br /><span className="num font-semibold text-foreground">{notice.effective_on}</span> <span className="text-[10px]">(3 business days)</span>
        </div>
      </div>

      {[
        { title: '1. To seller — intent to assign (before contract)', text: intentToAssignDisclosure(parties) },
        { title: '2. To end buyer — nature of equitable interest', text: equitableInterestDisclosure(parties) },
        { title: '3. To seller — 3-business-day assignment notice', text: notice.text },
      ].map((d, i) => (
        <div key={i} className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-foreground">{d.title}</span>
            <Copyable text={d.text} label="Copy" />
          </div>
          <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground leading-relaxed">{d.text}</pre>
        </div>
      ))}
    </div>
  )
}

function LandCard({ s }: { s: LandScore }) {
  const [open, setOpen] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const p = s.parcel
  const m = s.math
  const border = s.fit_score >= 75 ? 'border-l-emerald-500' : s.fit_score >= 50 ? 'border-l-amber-400' : 'border-l-slate-300'

  return (
    <div className={`bg-card rounded-xl border border-border border-l-[3px] ${border} shadow-card lift`}>
      <div className="px-4 py-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center shrink-0 w-14">
            <span className={`num text-2xl font-semibold ${s.fit_score >= 75 ? 'text-emerald-600' : s.fit_score >= 50 ? 'text-amber-500' : 'text-slate-400'}`}>{s.fit_score}</span>
            <div className="w-full h-1.5 rounded-full bg-muted mt-1 overflow-hidden"><div className={`h-full ${s.fit_score >= 75 ? 'bg-emerald-500' : s.fit_score >= 50 ? 'bg-amber-400' : 'bg-slate-300'}`} style={{ width: `${s.fit_score}%` }} /></div>
            <span className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">fit</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{p.location}</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" /> {p.county} County, {p.state}</span>
            </div>
            <div className="num text-sm text-muted-foreground mt-0.5">{p.acres} acres · {money(p.market_ppa)}/acre · APN {p.apn}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {p.tax_delinquent && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100"><AlertTriangle className="w-3 h-3" /> Tax delinquent</span>}
              {p.owner_out_of_state && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Out-of-state owner</span>}
              {!p.has_open_mortgage && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">Free &amp; clear</span>}
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${p.buildable ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{p.buildable ? 'Buildable' : p.in_floodplain ? 'Floodplain' : 'No access'}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2" onClick={e => e.stopPropagation()}>
              <span>View on:</span>
              {parcelLinks(p).map(x => (
                <a key={x.label} href={x.href} target="_blank" rel="noreferrer" className="text-brand hover:underline">{x.label} ↗</a>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="num font-semibold text-foreground">{money(m.assignment_fee)}</div>
            <div className="text-[11px] text-muted-foreground">est. assignment fee</div>
            <div className="mt-1 text-muted-foreground">{open ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}</div>
          </div>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60 space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Why it scored</h4>
            <ul className="space-y-1">{s.reasons.map((r, i) => <li key={i} className="text-sm text-foreground flex gap-2"><span className="text-emerald-500">✓</span>{r}</li>)}</ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Wholesale math</h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Market value</div><div className="num font-semibold">{money(m.market_value)}</div></div>
              <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Your offer ({Math.round(m.offer_pct * 100)}%)</div><div className="num font-semibold">{money(m.offer_price)}</div></div>
              <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Resale</div><div className="num font-semibold">{money(m.resale_price)}</div></div>
              <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Costs</div><div className="num font-semibold">{money(m.closing_costs)}</div></div>
              <div className="bg-muted/40 rounded-lg px-3 py-2"><div className="text-xs text-muted-foreground">Spread</div><div className="num font-semibold text-emerald-600">{money(m.gross_spread)}</div></div>
            </div>
          </div>
          <div>
            <button onClick={() => setShowDocs(v => !v)} className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/5">
              <FileText className="w-3.5 h-3.5" /> {showDocs ? 'Hide' : 'Generate'} SB 909 disclosures
            </button>
            {showDocs && <div className="mt-3"><Disclosures s={s} /></div>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LandFlips() {
  const [running, setRunning] = useState(false)
  const [seed, setSeed] = useState(77)
  const results = useMemo(() => runLandScan(seed), [seed])

  function rescan() { setRunning(true); setTimeout(() => { setSeed(s => s + 1); setRunning(false) }, 500) }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Trees className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Land &amp; Wholesale</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Demo data</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Motivated land sellers scored for principal wholesaling. Buy under contract, then assign or double-close — with TN SB 909 disclosures generated per deal.
      </p>

      {/* Principal-only guardrail */}
      <div className="mb-4 flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <span><strong>Principal wholesaling only.</strong> You must put the parcel under contract (real equitable interest) before marketing or assigning it. Marketing land you don't control, or taking a fee to connect buyer and seller, is unlicensed brokerage in TN. SB 909 disclosures are required. Not legal advice — have a TN real-estate attorney review your contracts.</span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{results.length} parcels · ranked by fit</span>
        <button onClick={rescan} disabled={running} className="text-xs inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning</> : <><Search className="w-4 h-4" /> Rescan</>}
        </button>
      </div>

      <div className="space-y-3">
        {results.map(s => <LandCard key={s.parcel.external_id} s={s} />)}
      </div>

      <p className="text-[11px] text-muted-foreground mt-8 leading-relaxed border-t border-border pt-4">
        Demo data is synthetic. Production sources parcels + ownership from county records / Regrid / ReportAll, tax-delinquent lists
        from the county trustee, and buildability from GIS (road, floodplain, slope). SB 909 disclosure text is a starting point, not
        legal advice — a TN attorney should review your assignment contracts and the 3-business-day notice mechanics.
      </p>
    </div>
  )
}
