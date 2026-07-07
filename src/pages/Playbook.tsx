import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Map, CheckCircle2, Circle, ExternalLink } from 'lucide-react'

interface Step {
  id: string
  title: string
  detail: string
  link?: { to: string; label: string } | { href: string; label: string }
  external?: boolean
}

interface Phase {
  title: string
  goal: string
  steps: Step[]
}

const PHASES: Phase[] = [
  {
    title: 'Phase 0 — Go live (one evening)',
    goal: 'Real data flowing instead of demo data.',
    steps: [
      { id: 'supabase', title: 'Create a Supabase project (free)', detail: 'supabase.com → New project. Grab the project ref, URL, anon key, service-role key.' },
      { id: 'rentcast', title: 'RentCast API key (free tier)', detail: 'rentcast.io → Dashboard → API. Store it as a Supabase secret — never in code.' },
      { id: 'deploy', title: 'Run DEPLOY.md top to bottom', detail: 'supabase link → db push → deploy the 6 functions → set secrets. ~15 minutes.', link: { href: 'https://github.com/adcountable/tracque/blob/claude/distressed-property-finder-3krcwu/DEPLOY.md', label: 'DEPLOY.md' } },
      { id: 'smoke', title: 'Smoke test says "rentcast"', detail: './scripts/smoke-test.sh — if source says mock, a secret name is off.' },
      { id: 'resend', title: 'Optional: Resend key + outreach settings', detail: 'resend.com free tier → RESEND_API_KEY. Fill From/name/physical address in Pipeline → Outreach → Settings. Keep Dry-run ON.' },
    ],
  },
  {
    title: 'Phase 1 — Build the list (week 1)',
    goal: 'A ranked pipeline of real Nashville leads.',
    steps: [
      { id: 'scan', title: 'Scan the market live', detail: 'Deal Finder → Scan market. Badge should read "Live data".', link: { to: '/app/properties', label: 'Deal Finder' } },
      { id: 'sweepcounty', title: 'Run the free county sweep', detail: 'sweep-county pulls every Davidson County parcel — off-market absentee/long-tenure owners nobody is calling.' },
      { id: 'schedule', title: 'Create a daily schedule', detail: 'Deal Finder → "Automate this search" → enable pg_cron per 008_automation.sql so it runs hands-off.', link: { to: '/app/leads', label: 'Pipeline' } },
      { id: 'quicklists', title: 'Pick your two Quick Lists', detail: 'Recommended: Free & Clear + Tired Landlord for seller finance; Tax Delinquent + Out-of-State for land.' },
    ],
  },
  {
    title: 'Phase 2 — Work the leads (weeks 2–4)',
    goal: 'Conversations. Expect ~30–50 contacts per real conversation.',
    steps: [
      { id: 'dryrun', title: 'Review drafts in dry-run, then send', detail: 'Read 10 drafted messages. Edit tone to sound like you. Then toggle dry-run off and send in small batches (cap 25/day).' },
      { id: 'respond', title: 'Reply within minutes, not days', detail: 'Speed is the #1 conversion lever. Move replies to "Replied" in the Pipeline immediately.' },
      { id: 'followup', title: 'Follow up 5–8 times', detail: 'Most deals happen on follow-up #4+. "No response" is not "no".' },
      { id: 'calc', title: 'Run every serious lead through the Calculator', detail: 'GO/THIN/NO-GO before you talk numbers. Never negotiate without knowing your MAO.', link: { to: '/app/calculator', label: 'Calculator' } },
    ],
  },
  {
    title: 'Phase 3 — First contract (when a seller says maybe)',
    goal: 'A signed purchase contract with your protections in it.',
    steps: [
      { id: 'attorney', title: 'Get a TN real-estate attorney (before the first contract)', detail: 'One-time setup: purchase agreement template with assignment clause + SB 909 disclosures reviewed. A few hundred dollars, reused every deal.' },
      { id: 'verify', title: 'Verify before you sign', detail: 'Title search (liens), comps for ARV, walkthrough or photos for repairs. The calculator is only as good as these inputs.' },
      { id: 'disclose', title: 'Generate SB 909 disclosures', detail: 'Land & Wholesale → open the deal → Generate disclosures. Intent-to-assign BEFORE the contract is signed.', link: { to: '/app/land', label: 'Land & Wholesale' } },
      { id: 'emd', title: 'Small earnest money + inspection period', detail: '$100–500 EMD and a 14–30 day inspection/exit clause caps your downside while you find the end buyer.' },
    ],
  },
  {
    title: 'Phase 4 — Get paid (assign or close)',
    goal: 'The assignment fee hits escrow. That is the income.',
    steps: [
      { id: 'buyers', title: 'Build the end-buyer list in parallel', detail: 'Local REIA, Facebook investor groups, cash-buyer records from your own county sweep (LLC owners with multiple parcels).' },
      { id: 'notice', title: 'Send the 3-business-day assignment notice', detail: 'Generated in the app with the effective date computed. TN law — not optional.' },
      { id: 'titleco', title: 'Close through a title company / attorney', detail: 'They handle escrow, the assignment paperwork, and paying your fee at closing. Never handle the money directly.' },
      { id: 'repeat', title: 'Log it, then repeat', detail: 'Mark the lead Won in the Pipeline. One deal proves the machine; the second proves it wasn\'t luck.' },
    ],
  },
]

const LS_KEY = 'tracque_playbook'

export default function Playbook() {
  const [done, setDone] = useState<Set<string>>(new Set())
  useEffect(() => {
    try { setDone(new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'))) } catch { /* fresh start */ }
  }, [])
  function toggle(id: string) {
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      localStorage.setItem(LS_KEY, JSON.stringify([...next]))
      return next
    })
  }
  const total = useMemo(() => PHASES.reduce((s, p) => s + p.steps.length, 0), [])
  const pct = Math.round((done.size / total) * 100)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Map className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Playbook — idea to income</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        The whole path, in order. Nothing here is optional fluff — each step exists because skipping it is how deals die or get you in trouble.
      </p>

      <div className="mb-6">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{done.size} of {total} steps</span><span className="num">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-6">
        {PHASES.map(phase => (
          <div key={phase.title} className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground">{phase.title}</h2>
            <p className="text-xs text-muted-foreground mb-3">Goal: {phase.goal}</p>
            <div className="space-y-2">
              {phase.steps.map(step => {
                const checked = done.has(step.id)
                return (
                  <div key={step.id} className="flex gap-3 items-start">
                    <button onClick={() => toggle(step.id)} className="mt-0.5 shrink-0" aria-label={checked ? 'Mark incomplete' : 'Mark complete'}>
                      {checked ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5 text-muted-foreground/50 hover:text-muted-foreground" />}
                    </button>
                    <div className={checked ? 'opacity-60' : ''}>
                      <div className="text-sm font-medium text-foreground">{step.title}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{step.detail}</div>
                      {step.link && ('to' in step.link
                        ? <Link to={step.link.to} className="text-xs text-brand hover:underline inline-flex items-center gap-1 mt-0.5">{step.link.label} →</Link>
                        : <a href={step.link.href} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline inline-flex items-center gap-1 mt-0.5">{step.link.label} <ExternalLink className="w-3 h-3" /></a>)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground mt-6 leading-relaxed border-t border-border pt-4">
        Honest expectations: this is a numbers game — plan on working many leads per deal, and on the first deal taking 30–90 days.
        The tool automates sourcing and outreach; conversations and closing are you. Attorney review of contracts and disclosures is a
        cost of doing business, not a corner to cut. Not legal or financial advice.
      </p>
    </div>
  )
}
