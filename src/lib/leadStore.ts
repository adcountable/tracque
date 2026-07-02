// ============================================================
// Tracque — Lead & Schedule store (client-side, demo)
// ============================================================
// Mirrors the production tables (scan_schedules, leads) but persists to
// localStorage so the automated-funnel demo works with no backend. In
// production these become Supabase rows driven by run-scheduled-scans.

import type { LeadStatus, PropertyScore, Strategy } from './propertyEngine'

export interface Schedule {
  id: string
  name: string
  city: string
  state: string
  strategy: Strategy
  quickLists: string[]
  maxPrice: number
  minBeds: number
  cadence: 'daily' | 'weekly'
  enabled: boolean
  created_at: string
  last_run_at: string | null
  runs: number
}

export interface Lead {
  external_id: string
  schedule_id: string | null
  address: string
  city: string
  state: string
  neighborhood: string
  strategy: Strategy
  fit_score: number
  list_price: number
  equity_pct: number
  has_open_mortgage: boolean
  owner_name: string
  owner_phone: string | null
  owner_email: string | null
  status: LeadStatus
  outreach_subject: string
  outreach_body: string
  first_seen_at: string
  updated_at: string
}

const SCHED_KEY = 'tracque_schedules'
const LEADS_KEY = 'tracque_leads'

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}
function write(key: string, val: unknown) { localStorage.setItem(key, JSON.stringify(val)) }

// ── Schedules ──────────────────────────────────────────────

export function getSchedules(): Schedule[] { return read<Schedule[]>(SCHED_KEY, []) }

export function saveSchedule(s: Schedule): Schedule[] {
  const all = getSchedules()
  const idx = all.findIndex(x => x.id === s.id)
  if (idx >= 0) all[idx] = s; else all.push(s)
  write(SCHED_KEY, all)
  return all
}

export function deleteSchedule(id: string): Schedule[] {
  const all = getSchedules().filter(s => s.id !== id)
  write(SCHED_KEY, all)
  return all
}

export function newScheduleId(): string {
  // Avoid Math.random reliance issues; timestamp + counter is fine client-side.
  return `sch_${Date.now().toString(36)}_${getSchedules().length}`
}

// ── Leads ──────────────────────────────────────────────────

export function getLeads(): Lead[] { return read<Lead[]>(LEADS_KEY, []) }

export function saveLeads(leads: Lead[]) { write(LEADS_KEY, leads) }

export function updateLeadStatus(externalId: string, status: LeadStatus): Lead[] {
  const all = getLeads().map(l =>
    l.external_id === externalId ? { ...l, status, updated_at: new Date().toISOString() } : l)
  saveLeads(all)
  return all
}

export function enrichLead(externalId: string, phone: string, email: string): Lead[] {
  const all = getLeads().map(l =>
    l.external_id === externalId ? { ...l, owner_phone: phone, owner_email: email, updated_at: new Date().toISOString() } : l)
  saveLeads(all)
  return all
}

// Merge fresh scan results into the pipeline; returns the count actually added.
export function ingestLeads(scheduleId: string | null, strategy: Strategy, fresh: PropertyScore[]): { added: number; leads: Lead[] } {
  const all = getLeads()
  const existing = new Set(all.map(l => l.external_id))
  const now = new Date().toISOString()
  let added = 0
  for (const s of fresh) {
    if (existing.has(s.property.external_id)) continue
    const p = s.property
    all.push({
      external_id: p.external_id, schedule_id: scheduleId, address: p.address, city: p.city,
      state: p.state, neighborhood: p.neighborhood, strategy, fit_score: s.fit_score,
      list_price: p.list_price, equity_pct: p.equity_pct, has_open_mortgage: p.has_open_mortgage,
      owner_name: p.owner_name, owner_phone: p.owner_phone, owner_email: p.owner_email,
      status: 'new', outreach_subject: s.outreach.subject, outreach_body: s.outreach.body,
      first_seen_at: now, updated_at: now,
    })
    existing.add(p.external_id)
    added++
  }
  saveLeads(all)
  return { added, leads: all }
}
