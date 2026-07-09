import { useEffect, useMemo, useState } from 'react'
import {
  Workflow, Play, Plus, Trash2, Clock, Zap, Bell, Phone, Mail, Copy, Check,
  Power, PowerOff, TrendingUp, Landmark, Send, Settings2, ShieldCheck, Ban, AlertTriangle,
} from 'lucide-react'
import {
  runScan, applyFilters, detectNewLeads, buildDigest, skipTrace,
  LEAD_STATUSES, QUICK_LISTS,
  type ScanParams, type Strategy, type LeadStatus, type Digest,
} from '../lib/propertyEngine'
import {
  getSchedules, saveSchedule, deleteSchedule, newScheduleId,
  getLeads, updateLeadStatus, enrichLead, ingestLeads, markLeadSent,
  getSettings, saveSettings, getSuppressions, addSuppression, lettersCSV,
  type Schedule, type Lead,
} from '../lib/leadStore'
import {
  settingsGaps, ownerOutreach, buildEmail, callScript, type OutreachSettings,
} from '../lib/outreach'
import { supabase } from '../integrations/supabase/client'
import { USER_ID } from '../lib/hooks'

const LIVE = Boolean(import.meta.env.VITE_SUPABASE_URL)

const money = (n: number) => '$' + Math.round(n).toLocaleString()
const STRATEGY_LABEL: Record<Strategy, string> = {
  seller_finance: 'Seller Finance', subject_to: 'Subject-To', rent_instead_of_sell: 'Rent Instead',
}

// Manual owner-trace links — free people-search + entity lookups, pre-filled
// per lead. More accurate than batch skip-trace at low volume; costs time
// instead of money.
function manualTraceLinks(l: Lead): { label: string; href: string }[] {
  const name = encodeURIComponent(l.owner_name)
  const cityState = encodeURIComponent(`${l.city}, ${l.state}`)
  const isEntity = /\b(LLC|TRUST|INC|LP|ESTATE)\b/i.test(l.owner_name)
  const links = [
    { label: 'Google', href: `https://www.google.com/search?q=%22${name}%22+${cityState}` },
    { label: 'TruePeopleSearch', href: `https://www.truepeoplesearch.com/results?name=${name}&citystatezip=${cityState}` },
    { label: 'FastPeopleSearch', href: `https://www.fastpeoplesearch.com/name/${l.owner_name.trim().toLowerCase().replace(/\s+/g, '-')}_${l.city.toLowerCase().replace(/\s+/g, '-')}-${l.state.toLowerCase()}` },
    { label: 'Facebook', href: `https://www.facebook.com/search/people/?q=${name}` },
  ]
  if (isEntity) links.unshift({ label: 'TN SOS (entity)', href: 'https://tnbear.tn.gov/ecommerce/filingsearch.aspx' })
  return links
}

// Same property on the portals (photos/history live there).
function portalLinks(l: Lead): { label: string; href: string }[] {
  const full = `${l.address}, ${l.city}, ${l.state}`
  const q = encodeURIComponent(full)
  const zillowSlug = encodeURIComponent(full.replace(/\s+/g, '-').replace(/,/g, ''))
  return [
    { label: 'Zillow', href: `https://www.zillow.com/homes/${zillowSlug}_rb/` },
    { label: 'Maps', href: `https://www.google.com/maps/place/${q}` },
  ]
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
  const [autoSend, setAutoSend] = useState(false)

  // Outreach compliance settings + suppression
  const [settings, setSettings] = useState<OutreachSettings>(getSettings())
  const [suppressions, setSuppressions] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [sendMsg, setSendMsg] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // New-schedule form
  const [name, setName] = useState('Nashville seller-finance')
  const [city, setCity] = useState('Nashville')
  const [stateAbbr, setStateAbbr] = useState('TN')
  const [strategy, setStrategy] = useState<Strategy>('seller_finance')
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily')
  const [maxPrice, setMaxPrice] = useState(650000)
  const [minBeds, setMinBeds] = useState(3)
  const [quickLists, setQuickLists] = useState<string[]>(['free_clear', 'high_equity'])

  useEffect(() => { setSchedules(getSchedules()); setLeads(getLeads()); setSuppressions(getSuppressions()) }, [])

  const gaps = settingsGaps(settings)
  const canSend = gaps.length === 0

  function createSchedule() {
    const s: Schedule = {
      id: newScheduleId(), name, city, state: stateAbbr, strategy, quickLists,
      maxPrice, minBeds, cadence, enabled: true, auto_send: autoSend,
      created_at: new Date().toISOString(), last_run_at: null, runs: 0,
    }
    setSchedules(saveSchedule(s))
    setShowForm(false)
  }

  function persistSettings(next: OutreachSettings) {
    setSettings(next); saveSettings(next)
    // Live mode: the send-outreach edge function reads settings from the
    // outreach_settings table — mirror them server-side so real sends
    // carry the right From identity + CAN-SPAM address.
    if (LIVE) {
      void supabase.from('outreach_settings').upsert({
        user_id: USER_ID, from_name: next.from_name, from_email: next.from_email,
        reply_to: next.reply_to, physical_address: next.physical_address,
        signature: next.signature, daily_cap: next.daily_cap, dry_run: next.dry_run,
        updated_at: new Date().toISOString(),
      })
    }
  }

  // Send owner outreach for the given leads. Live when deployed (Resend via
  // send-outreach), simulated locally otherwise. Compliance-gated either way.
  async function sendLeads(targets: Lead[], viaAuto = false): Promise<number> {
    const eligible = targets.filter(l => !l.sent_at && l.owner_email)
    if (!eligible.length) { if (!viaAuto) setSendMsg('Nothing to send — leads need an owner email (skip trace first).'); return 0 }
    if (!canSend) { setShowSettings(true); setSendMsg(`Add ${gaps.join(', ')} before sending.`); return 0 }
    setSending(true)
    let sent = 0
    try {
      if (LIVE) {
        const { data, error } = await supabase.functions.invoke('send-outreach', {
          body: { user_id: USER_ID, lead_ids: eligible.map(l => l.external_id), dry_run: settings.dry_run },
        })
        if (error) throw error
        sent = data?.sent ?? 0
        setSendMsg(settings.dry_run ? `Dry run: ${data?.processed ?? 0} previewed, 0 actually sent.` : `Sent ${sent} of ${data?.processed ?? 0}.`)
      } else {
        // Local simulation mirrors the server's compliance checks.
        let updated = getLeads()
        for (const l of eligible.slice(0, settings.daily_cap)) {
          const built = buildEmail(
            { external_id: l.external_id, owner_email: l.owner_email, outreach_subject: '', outreach_body: '' },
            'owner_email', settings, suppressions,
          )
          if ('skip' in built) continue
          if (!settings.dry_run) { updated = markLeadSent(l.external_id, 'owner_email'); sent++ }
        }
        setLeads(updated)
        setSendMsg(settings.dry_run
          ? `Dry run: ${eligible.length} previewed (toggle off Dry run to send for real).`
          : `Sent ${sent} owner email${sent === 1 ? '' : 's'} (simulated locally — deploy + set RESEND_API_KEY to send for real).`)
      }
    } catch (e) {
      setSendMsg(`Send failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSending(false)
    }
    return sent
  }

  // The automated pass: scan → filter → auto skip-trace fresh → detect new → ingest → digest.
  function runNow(s: Schedule) {
    setRunningId(s.id)
    setTimeout(() => {
      const params: ScanParams = {
        strategy: s.strategy, city: s.city, state: s.state,
        max_price: 5_000_000, min_beds: 0, monthly_budget: 0, down_budget: 25000, buyer_name: 'You',
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
      // Auto-send owner outreach on the fresh leads if the schedule opts in.
      if (s.auto_send && canSend) {
        const freshLeads = updated.filter(l => enriched.some(e => e.property.external_id === l.external_id))
        void sendLeads(freshLeads, true)
      }
    }, 700)
  }

  function toggleAutoSend(s: Schedule) { setSchedules(saveSchedule({ ...s, auto_send: !s.auto_send })) }

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

      {/* Outreach settings / compliance */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Outreach</h2>
        <button onClick={() => setShowSettings(s => !s)} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border hover:border-primary hover:text-primary text-muted-foreground">
          <Settings2 className="w-3.5 h-3.5" /> {showSettings ? 'Hide' : 'Settings'}
        </button>
      </div>
      <div className="mb-4">
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${canSend ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
          {canSend ? <ShieldCheck className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {canSend
            ? <span>Ready to send. {settings.dry_run ? 'Dry run is ON — nothing actually goes out.' : 'Dry run OFF — sends are live.'} {LIVE ? '' : 'Local demo (deploy + RESEND_API_KEY to send for real).'}</span>
            : <span>Not send-ready — add {gaps.join(', ')} in Settings.</span>}
        </div>
        {sendMsg && <div className="mt-2 text-xs text-muted-foreground px-3">{sendMsg}</div>}

        {showSettings && (
          <div className="bg-card rounded-xl border border-border p-4 mt-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="text-xs text-muted-foreground">From name
                <input value={settings.from_name} onChange={e => persistSettings({ ...settings, from_name: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="John Buyer" />
              </label>
              <label className="text-xs text-muted-foreground">From email (verified sender)
                <input value={settings.from_email} onChange={e => persistSettings({ ...settings, from_email: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="john@yourdomain.com" />
              </label>
              <label className="text-xs text-muted-foreground">Reply-to
                <input value={settings.reply_to} onChange={e => persistSettings({ ...settings, reply_to: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="john@yourdomain.com" />
              </label>
              <label className="text-xs text-muted-foreground col-span-2 sm:col-span-2">Physical mailing address (required by CAN-SPAM)
                <input value={settings.physical_address} onChange={e => persistSettings({ ...settings, physical_address: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="123 Main St, Nashville, TN 37206" />
              </label>
              <label className="text-xs text-muted-foreground">Daily cap
                <input type="number" value={settings.daily_cap} onChange={e => persistSettings({ ...settings, daily_cap: +e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground col-span-2 sm:col-span-3">Signature
                <input value={settings.signature} onChange={e => persistSettings({ ...settings, signature: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground" placeholder="John · (615) 555-1234" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input type="checkbox" checked={settings.dry_run} onChange={e => persistSettings({ ...settings, dry_run: e.target.checked })} />
              <span><strong>Dry run</strong> — preview only, never actually send (recommended until you've reviewed the copy)</span>
            </label>
            <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
              Automated outreach here is <strong>owner-directed email</strong> (CAN-SPAM: real address + unsubscribe on every message; suppression honored). Owner phone/SMS and cold calling carry TCPA/DNC obligations and are intentionally not automated. {suppressions.length} suppressed address(es).
            </div>
          </div>
        )}
      </div>

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
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={autoSend} onChange={e => setAutoSend(e.target.checked)} />
            Auto-send owner outreach on new leads {canSend ? '' : '(configure outreach settings first)'}
          </label>
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
            <button onClick={() => toggleAutoSend(s)}
              className={`text-[11px] inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border ${s.auto_send ? 'bg-primary/10 text-primary border-primary/40' : 'border-border text-muted-foreground hover:text-foreground'}`}
              title="Auto-send owner outreach on new leads from this schedule">
              <Send className="w-3 h-3" /> Auto-send {s.auto_send ? 'on' : 'off'}
            </button>
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
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pipeline</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const csv = lettersCSV(leads)
              if (csv.split('\n').length <= 1) { setSendMsg('No leads with a mailing address yet — run the county sweep (live) to capture owner mailing addresses.'); return }
              const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
              const a = document.createElement('a'); a.href = url; a.download = 'tracque-letters.csv'; a.click()
              URL.revokeObjectURL(url)
            }}
            className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:border-primary">
            <Mail className="w-3.5 h-3.5" /> Export letters CSV
          </button>
          <button
            onClick={() => sendLeads(leads.filter(l => l.status === 'new' && !l.sent_at && l.owner_email))}
            disabled={sending}
            className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60">
            <Send className="w-3.5 h-3.5" /> {sending ? 'Sending…' : 'Send all new'}
          </button>
        </div>
      </div>
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
                <div className={`num text-lg font-semibold ${l.fit_score >= 75 ? 'text-emerald-600' : l.fit_score >= 50 ? 'text-amber-500' : 'text-slate-400'}`}>{l.fit_score}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">fit</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{l.address}</div>
                <div className="text-xs text-muted-foreground">
                  {l.neighborhood} · {l.city}, {l.state} · {money(l.list_price)} · {Math.round(l.equity_pct * 100)}% equity
                  {!l.has_open_mortgage && ' · free & clear'} · {STRATEGY_LABEL[l.strategy]}
                  {portalLinks(l).map(x => (
                    <a key={x.label} href={x.href} target="_blank" rel="noreferrer" className="ml-2 text-brand hover:underline">{x.label} ↗</a>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Owner: <span className="text-foreground">{l.owner_name}</span>
                  {l.owner_phone
                    ? <span className="ml-2 inline-flex items-center gap-2">
                        <a href={`tel:${l.owner_phone.replace(/[^+\d]/g, '')}`} className="inline-flex items-center gap-1 text-brand hover:underline" title="Call (manual dial — DNC-scrub first)">
                          <Phone className="w-3 h-3" />{l.owner_phone}
                        </a>
                        <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{l.owner_email}</span>
                      </span>
                    : <button onClick={() => trace(l)} className="ml-2 text-primary hover:underline">skip trace</button>}
                </div>
                {!l.owner_phone && (
                  <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2">
                    <span>Find owner:</span>
                    {manualTraceLinks(l).map(x => (
                      <a key={x.label} href={x.href} target="_blank" rel="noreferrer" className="text-brand hover:underline">{x.label}</a>
                    ))}
                    {l.owner_mail_address && <span className="text-muted-foreground">· mails to: <span className="text-foreground">{l.owner_mail_address}</span></span>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(() => { const m = ownerOutreach(l); return <CopyButton text={`Subject: ${m.subject}\n\n${m.body}`} /> })()}
                <button
                  onClick={() => { navigator.clipboard.writeText(callScript(l)); setSendMsg(`Call script for ${l.address} copied — remember to DNC-scrub before dialing.`) }}
                  title="Copy cold-call script (manual dialing only)"
                  className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:border-primary hover:text-primary text-muted-foreground">
                  <Phone className="w-3 h-3" /> Script
                </button>
                {l.sent_at
                  ? <span className="text-[11px] inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100"><Check className="w-3 h-3" /> Sent</span>
                  : <button onClick={() => sendLeads([l])} disabled={sending || !l.owner_email}
                      title={l.owner_email ? 'Send owner outreach' : 'Skip trace first'}
                      className="text-[11px] inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/5 disabled:opacity-50">
                      <Send className="w-3 h-3" /> Send
                    </button>}
                {l.owner_email && <button onClick={() => { setSuppressions(addSuppression(l.owner_email!)); setSendMsg(`Suppressed ${l.owner_email}`) }} title="Do not contact" className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-500"><Ban className="w-3.5 h-3.5" /></button>}
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
        In production, schedules run server-side (pg_cron → run-scheduled-scans) and the digest is emailed. Email is automated with
        CAN-SPAM rails; letters via the CSV export. Phone is <strong>manual only</strong>: DNC-scrub every number before dialing
        (calling registry numbers risks $500–$1,500/call), and never auto-dial, drop voicemails, or mass-text (TCPA). This automates
        sourcing; the conversation and close are human, every time.
      </p>
    </div>
  )
}
