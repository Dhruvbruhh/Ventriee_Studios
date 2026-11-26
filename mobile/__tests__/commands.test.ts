import { buildCommandRow, describeCommand, COMMAND_SPECS } from '../src/commands'

describe('buildCommandRow', () => {
  it('builds a pending project-scoped command with payload', () => {
    const row = buildCommandRow({ type: 'ask_project_status', deviceId: 'dev-1', orgId: 'org-9', projectId: 'proj-7' })
    expect(row).toEqual({
      device_id: 'dev-1',
      org_id: 'org-9',
      type: 'ask_project_status',
      payload: { project_id: 'proj-7' },
      status: 'pending',
    })
  })

  it('defaults org_id to null for the personal workspace', () => {
    const row = buildCommandRow({ type: 'stop_agent_run', deviceId: 'dev-1' })
    expect(row.org_id).toBeNull()
    expect(row.payload).toEqual({})
  })

  it('merges extra args into the payload', () => {
    const row = buildCommandRow({ type: 'start_agent_run', deviceId: 'dev-1', projectId: 'p1', args: { prompt: 'ship it' } })
    expect(row.payload).toEqual({ prompt: 'ship it', project_id: 'p1' })
  })

  it('rejects a project-scoped command with no project', () => {
    expect(() => buildCommandRow({ type: 'ask_project_status', deviceId: 'dev-1' })).toThrow(/needs a project/)
  })

  it('rejects a command with no device', () => {
    expect(() => buildCommandRow({ type: 'stop_agent_run', deviceId: '' })).toThrow(/device/)
  })

  it('every spec type is a valid literal', () => {
    for (const s of COMMAND_SPECS) {
      expect(() => buildCommandRow({ type: s.type, deviceId: 'd', projectId: 'p' })).not.toThrow()
    }
  })
})

describe('describeCommand', () => {
  it('uses the spec label', () => {
    expect(describeCommand({ type: 'ask_project_status', payload: { project_id: 'p' } })).toBe('Ask project status')
  })
  it('falls back to the raw type for unknown commands', () => {
    expect(describeCommand({ type: 'mystery', payload: {} })).toBe('mystery')
  })
})
