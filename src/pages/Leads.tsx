import { useEffect, useMemo, useState } from 'react'
import {
  Workflow, Play, Plus, Trash2, Clock, Zap, Bell, Phone, Mail, Copy, Check,
  Power, PowerOff, TrendingUp, Landmark,
} from 'lucide-react'
import {
  runScan, applyFilters, detectNewLeads, buildDigest, skipTrace,
  LEAD_STATUSES, QUICK_LISTS,
  type ScanParams, type Strategy, type LeadStatus, type Digest,
} from '../lib/propertyEngine'
import {
  getSchedules, saveSchedule, deleteSchedule, newScheduleId,
  getLeads, updateLeadStatus, enrichLead, ingestLeads,
  type Schedule, type Lead,
} from '../lib/leadStore'

const money = (n: number) => '$' + Math.round(n).toLocaleString()
const STRATEGY_LABEL: Record<Strategy, string> = {
  seller_finance: 'Seller Finance', subject_to: 'Subject-To', rent_instead_of_sell: 'Rent Instead',
}

function CopyButton({ text }: { text: string }) {
  const [c, setC] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1500) }}
      className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:border-primary hover:text-primary text-muted-foreground">
      {c ? <><Check className="w-3 h-3 text-emerald-500" /> Copied</> : <><Copy className="w-3 h-3" /> Outreach</>}
    </button>
  )
}

export default function Leads() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [digest, setDigest] = useState<(Digest & { schedule: string }) | null>(null)
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const [runningId, setRunningId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // New-schedule form
  const [name, setName] = useState('Nashville seller-finance')
  const [city, setCity] = useState('Nashville')
  const [stateAbbr, setStateAbbr] = useState('TN')
  const [strategy, setStrategy] = useState<Strategy>('seller_finance')
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily')
  const [maxPrice, setMaxPrice] = useState(650000)
  const [minBeds, setMinBeds] = useState(3)
  const [quickLists, setQuickLists] = useState<string[]>(['free_clear', 'high_equity'])

  useEffect(() => { setSchedules(getSchedules()); setLeads(getLeads()) }, [])

  function createSchedule() {
    const s: Schedule = {
      id: newScheduleId(), name, city, state: stateAbbr, strategy, quickLists,
      maxPrice, minBeds, cadence, enabled: true,
      created_at: new Date().toISOString(), last_run_at: null, runs: 0,
    }
    setSchedules(saveSchedule(s))
    setShowForm(false)
  }

  // The automated pass: scan → filter → auto skip-trace fresh → detect new → ingest → digest.
  function runNow(s: Schedule) {
    setRunningId(s.id)
    setTimeout(() => {
      const params: ScanParams = {
        strategy: s.strategy, city: s.city, state: s.state,
        max_price: 5_000_000, min_beds: 0, monthly_budget: 0, buyer_name: 'You',
      }
      // Vary the seed by run count so each run surfaces new inventory.
      const scores = runScan(params, 42 + s.runs * 7)
      const ids = new Set(applyFilters(scores.map(x => x.property), {
        quickLists: s.quickLists, maxPrice: s.maxPrice, minBeds: s.minBeds,
      }).map(p => p.external_id))
      const filtered = scores.filter(x => ids.has(x.property.external_id))

      const seenIds = getLeads().map(l => l.external_id)
      const { fresh } = detectNewLeads(seenIds, filtered)
      // Auto skip-trace fresh leads (enrichment step of the funnel)
      const enriched = fresh.map(x => {
        const c = skipTrace(x.property)
        return { ...x, property: { ...x.property, owner_phone: c.owner_phone, owner_email: c.owner_email } }
      })
      const { leads: updated } = ingestLeads(s.id, s.strategy, enriched)
      setLeads(updated)
      setSchedules(saveSchedule({ ...s, last_run_at: new Date().toISOString(), runs: s.runs + 1 }))
      setDigest({ ...buildDigest(enriched), schedule: s.name })
      setRunningId(null)
    }, 700)
  }

  function toggleEnabled(s: Schedule) { setSchedules(saveSchedule({ ...s, enabled: !s.enabled })) }
  function removeSchedule(id: string) { setSchedules(deleteSchedule(id)) }
  function setStatus(id: string, status: LeadStatus) { setLeads(updateLeadStatus(id, status)) }
  function trace(l: Lead) { const c = skipTrace({ external_id: l.external_id, owner_name: l.owner_name } as never); setLeads(enrichLead(l.external_id, c.owner_phone, c.owner_email)) }
  function toggleQuick(k: string) { setQuickLists(qs => qs.includes(k) ? qs.filter(x => x !== k) : [...qs, k]) }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length }
    for (const st of LEAD_STATUSES) c[st.key] = leads.filter(l => l.status === st.key).length
    return c
  }, [leads])

  const visible = statusFilter === 'all' ? leads : leads.filter(l => l.status === statusFilter)
  const sorted = [...visible].sort((a, b) => b.fit_score - a.fit_score)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Workflow className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Automated Pipeline</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Demo · local</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Recurring scans surface new leads, auto skip-trace and draft outreach. You work the pipeline and close — the part that can't be automated.
      </p>

      {/* Digest banner */}
      {digest && (
        <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground">Digest — {digest.schedule}</span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm mb-2">
            <span><strong className="text-foreground">{digest.new_count}</strong> <span className="text-muted-foreground">new leads</span></span>
            <span className="inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /><strong className="text-foreground">{digest.high_fit_count}</strong> <span className="text-muted-foreground">high-fit (75+)</span></span>
            <span className="inline-flex items-center gap-1"><Landmark className="w-3.5 h-3.5 text-emerald-600" /><strong className="text-foreground">{digest.free_clear_count}</strong> <span className="text-muted-foreground">free &amp; clear</span></span>
          </div>
          {digest.top.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Top: {digest.top.slice(0, 3).map(s => `${s.property.address} (${s.fit_score})`).join(' · ')}
            </div>
          )}
          {digest.new_count === 0 && <div className="text-sm text-muted-foreground">No new leads this run — all matches already in your pipeline.</div>}
        </div>
      )}

      {/* Schedules */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Scan Schedules</h2>
        <button onClick={() => setShowForm(f => !f)} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border hover:border-primary hover:text-primary text-muted-foreground">
          <Plus className="w-3.5 h-3.5" /> New schedule
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-xs text-muted-foreground col-span-2">Name
              <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            <label className="text-xs text-muted-foreground">City
              <input value={city} onChange={e => setCity(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            <label className="text-xs text-muted-foreground">State
              <input value={stateAbbr} onChange={e => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            <label className="text-xs text-muted-foreground">Strategy
              <select value={strategy} onChange={e => setStrategy(e.target.value as Strategy)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground">
                <option value="seller_finance">Seller Finance</option>
                <option value="subject_to">Subject-To</option>
                <option value="rent_instead_of_sell">Rent Instead</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Cadence
              <select value={cadence} onChange={e => setCadence(e.target.value as 'daily' | 'weekly')} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Max price
              <input type="number" step={25000} value={maxPrice} onChange={e => setMaxPrice(+e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            <label className="text-xs text-muted-foreground">Min beds
              <input type="number" value={minBeds} onChange={e => setMinBeds(+e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Quick Lists</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_LISTS.map(q => (
                <button key={q.key} onClick={() => toggleQuick(q.key)} className={`text-xs px-2 py-1 rounded-full border ${quickLists.includes(q.key) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50'}`}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={createSchedule} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Create schedule</button>
        </div>
      )}

      <div className="space-y-2 mb-6">
        {schedules.length === 0 && <div className="text-sm text-muted-foreground bg-card border border-border rounded-xl p-4">No schedules yet. Create one, or hit "Automate this search" from the Deal Finder.</div>}
        {schedules.map(s => (
          <div key={s.id} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{s.name}</span>
                {!s.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">paused</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {s.city}, {s.state} · {STRATEGY_LABEL[s.strategy]} · {s.cadence} · {s.quickLists.length ? s.quickLists.join(', ') : 'no quick lists'}
                {' · '}<Clock className="w-3 h-3 inline" /> {s.last_run_at ? `last run ${new Date(s.last_run_at).toLocaleString()}` : 'never run'} · {s.runs} runs
              </div>
            </div>
            <button onClick={() => runNow(s)} disabled={runningId === s.id} className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {runningId === s.id ? <><Zap className="w-3.5 h-3.5 animate-pulse" /> Running</> : <><Play className="w-3.5 h-3.5" /> Run now</>}
            </button>
            <button onClick={() => toggleEnabled(s)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground" title={s.enabled ? 'Pause' : 'Enable'}>
              {s.enabled ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => removeSchedule(s.id)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-500" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Pipeline</h2>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button onClick={() => setStatusFilter('all')} className={`text-xs px-2.5 py-1 rounded-full border ${statusFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}>
          All ({counts.all})
        </button>
        {LEAD_STATUSES.map(st => (
          <button key={st.key} onClick={() => setStatusFilter(st.key)} className={`text-xs px-2.5 py-1 rounded-full border ${statusFilter === st.key ? 'bg-primary text-primary-foreground border-primary' : `${st.color}`}`}>
            {st.label} ({counts[st.key] ?? 0})
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {sorted.length === 0 && <div className="text-sm text-muted-foreground bg-card border border-border rounded-xl p-4">No leads yet — run a schedule to populate the pipeline.</div>}
        {sorted.map(l => (
          <div key={l.external_id} className="bg-card rounded-xl border border-border p-3">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="w-10 text-center shrink-0">
                <div className={`text-lg font-bold ${l.fit_score >= 75 ? 'text-emerald-600' : l.fit_score >= 50 ? 'text-amber-500' : 'text-slate-400'}`}>{l.fit_score}</div>
                <div className="text-[10px] text-muted-foreground">fit</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{l.address}</div>
                <div className="text-xs text-muted-foreground">
                  {l.neighborhood} · {l.city}, {l.state} · {money(l.list_price)} · {Math.round(l.equity_pct * 100)}% equity
                  {!l.has_open_mortgage && ' · free & clear'} · {STRATEGY_LABEL[l.strategy]}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Owner: <span className="text-foreground">{l.owner_name}</span>
                  {l.owner_phone
                    ? <span className="ml-2 inline-flex items-center gap-2"><span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{l.owner_phone}</span><span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{l.owner_email}</span></span>
                    : <button onClick={() => trace(l)} className="ml-2 text-primary hover:underline">skip trace</button>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CopyButton text={`Subject: ${l.outreach_subject}\n\n${l.outreach_body}`} />
                <select value={l.status} onChange={e => setStatus(l.external_id, e.target.value as LeadStatus)}
                  className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background text-foreground">
                  {LEAD_STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground mt-8 leading-relaxed border-t border-border pt-4">
        In production, schedules run server-side (pg_cron → run-scheduled-scans) and the digest is emailed. Auto skip-trace and any
        owner-direct outreach carry TCPA/DNC obligations — agent-directed outreach is the safer default. This automates sourcing;
        the close is human, every time.
      </p>
    </div>
  )
}
