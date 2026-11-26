import {
  normalizeStatus, isPendingApproval, approvalDecisionStatus, taskStatusMeta,
  commandStatusMeta, isDeviceOnline, humanize,
} from '../src/status'

describe('normalizeStatus', () => {
  it('lowercases and snake-cases spaces and hyphens', () => {
    expect(normalizeStatus('In Progress')).toBe('in_progress')
    expect(normalizeStatus('awaiting-approval')).toBe('awaiting_approval')
    expect(normalizeStatus('  DONE ')).toBe('done')
  })
})

describe('isPendingApproval', () => {
  it('matches the known pending-approval statuses regardless of format', () => {
    expect(isPendingApproval('pending_approval')).toBe(true)
    expect(isPendingApproval('Awaiting Approval')).toBe(true)
    expect(isPendingApproval('needs-approval')).toBe(true)
  })
  it('is false for ordinary statuses', () => {
    expect(isPendingApproval('todo')).toBe(false)
    expect(isPendingApproval('done')).toBe(false)
  })
})

describe('approvalDecisionStatus', () => {
  it('maps a decision to the written status', () => {
    expect(approvalDecisionStatus('approve')).toBe('approved')
    expect(approvalDecisionStatus('reject')).toBe('rejected')
  })
})

describe('status meta tones', () => {
  it('gives tasks the right tone', () => {
    expect(taskStatusMeta('done').tone).toBe('success')
    expect(taskStatusMeta('blocked').tone).toBe('danger')
    expect(taskStatusMeta('in_progress').tone).toBe('progress')
    expect(taskStatusMeta('pending_approval').tone).toBe('pending')
    expect(taskStatusMeta('whatever').tone).toBe('neutral')
  })
  it('gives commands the right tone and label', () => {
    expect(commandStatusMeta('running')).toEqual({ label: 'Running', tone: 'progress' })
    expect(commandStatusMeta('error').tone).toBe('danger')
  })
})

describe('isDeviceOnline', () => {
  const now = Date.parse('2026-11-26T12:00:00Z')
  it('is online within the window', () => {
    expect(isDeviceOnline('2026-11-26T11:57:00Z', now)).toBe(true)
  })
  it('is offline past the window', () => {
    expect(isDeviceOnline('2026-11-26T11:50:00Z', now)).toBe(false)
  })
  it('is offline for an unparseable timestamp', () => {
    expect(isDeviceOnline('not-a-date', now)).toBe(false)
  })
})

describe('humanize', () => {
  it('turns a status into a label', () => {
    expect(humanize('pending_approval')).toBe('Pending approval')
    expect(humanize('')).toBe('Unknown')
  })
})
