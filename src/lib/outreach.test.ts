import { describe, it, expect } from 'vitest'
import {
  buildEmail, settingsGaps, isSuppressed, canSpamFooter, isEmail,
  DEFAULT_SETTINGS, type OutreachSettings, type Recipient,
} from './outreach'

const goodSettings: OutreachSettings = {
  from_name: 'John Buyer', from_email: 'john@example.com', reply_to: 'john@example.com',
  physical_address: '123 Main St, Nashville, TN 37206', signature: 'John', daily_cap: 25, dry_run: false,
}

const rec: Recipient = {
  external_id: 'NSH-ABC', agent_email: 'agent@brokerage.com', owner_email: 'owner@home.com',
  outreach_subject: 'Offer on your listing', outreach_body: 'Hi, I am interested.',
}

describe('validation', () => {
  it('isEmail catches obvious bad addresses', () => {
    expect(isEmail('a@b.co')).toBe(true)
    expect(isEmail('nope')).toBe(false)
    expect(isEmail('a@b')).toBe(false)
  })
  it('default settings are incomplete (safe default)', () => {
    expect(settingsGaps(DEFAULT_SETTINGS).length).toBeGreaterThan(0)
  })
  it('complete settings have no gaps', () => {
    expect(settingsGaps(goodSettings)).toEqual([])
  })
  it('flags a missing physical address (CAN-SPAM)', () => {
    expect(settingsGaps({ ...goodSettings, physical_address: '' })).toContain(
      'a physical mailing address (required by CAN-SPAM)')
  })
})

describe('suppression', () => {
  it('matches case-insensitively', () => {
    expect(isSuppressed('Agent@Brokerage.com', ['agent@brokerage.com'])).toBe(true)
    expect(isSuppressed('other@x.com', ['agent@brokerage.com'])).toBe(false)
  })
})

describe('buildEmail', () => {
  it('builds a compliant agent email with CAN-SPAM footer', () => {
    const out = buildEmail(rec, 'agent_email', goodSettings, [])
    expect('email' in out).toBe(true)
    if ('email' in out) {
      expect(out.email.to).toBe('agent@brokerage.com')
      expect(out.email.from).toBe('John Buyer <john@example.com>')
      expect(out.email.text).toContain('123 Main St')       // physical address
      expect(out.email.text).toMatch(/unsubscribe|STOP/i)   // opt-out path
    }
  })
  it('skips a suppressed recipient', () => {
    const out = buildEmail(rec, 'agent_email', goodSettings, ['agent@brokerage.com'])
    expect(out).toEqual({ skip: 'suppressed: agent@brokerage.com' })
  })
  it('skips when the channel email is missing', () => {
    const out = buildEmail({ ...rec, owner_email: null }, 'owner_email', goodSettings, [])
    expect('skip' in out).toBe(true)
  })
  it('refuses to send when settings are incomplete', () => {
    const out = buildEmail(rec, 'agent_email', { ...goodSettings, physical_address: '' }, [])
    expect('skip' in out).toBe(true)
    if ('skip' in out) expect(out.skip).toContain('settings incomplete')
  })
  it('footer carries the external_id as the unsubscribe token', () => {
    expect(canSpamFooter(goodSettings, 'TOKEN123')).toContain('TOKEN123')
  })
})
