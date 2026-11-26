import { buildCommandRow, describeCommand, COMMAND_SPECS } from '../src/commands'

const project = { id: 'proj-7', name: 'Site' }

describe('buildCommandRow', () => {
  it('builds a row the desktop allowlist and RLS accept', () => {
    const row = buildCommandRow({ type: 'project.status', deviceId: 'dev-1', orgId: 'org-9', project })
    expect(row).toEqual({
      device_id: 'dev-1',
      org_id: 'org-9',
      type: 'project.status',
      payload: { projectId: 'proj-7', projectName: 'Site' },
      requires_confirmation: false,
    })
  })

  it('defaults org_id to null for the personal workspace', () => {
    expect(buildCommandRow({ type: 'project.status', deviceId: 'dev-1', project }).org_id).toBeNull()
  })

  it('marks high-risk commands confirmed and carries the instruction', () => {
    const row = buildCommandRow({ type: 'run.start', deviceId: 'dev-1', project, instruction: '  ship it ' })
    expect(row.requires_confirmation).toBe(true)
    expect(row.payload).toEqual({ projectId: 'proj-7', projectName: 'Site', instruction: 'ship it' })
    expect(buildCommandRow({ type: 'run.stop', deviceId: 'dev-1', project }).requires_confirmation).toBe(true)
  })

  it('rejects a start with no instruction, a missing project or device', () => {
    expect(() => buildCommandRow({ type: 'run.start', deviceId: 'dev-1', project, instruction: ' ' })).toThrow(/instruction/)
    expect(() => buildCommandRow({ type: 'run.stop', deviceId: 'dev-1', project: null })).toThrow(/needs a project/)
    expect(() => buildCommandRow({ type: 'project.status', deviceId: '', project })).toThrow(/device/)
  })

  it('only uses types the desktop runs', () => {
    expect(COMMAND_SPECS.map((s) => s.type).sort()).toEqual(['project.status', 'run.start', 'run.stop'])
  })
})

describe('describeCommand', () => {
  it('uses the spec label and project name', () => {
    expect(describeCommand({ type: 'project.status', payload: { projectName: 'Site' } })).toBe('Ask project status · Site')
  })
  it('falls back to the raw type for unknown commands', () => {
    expect(describeCommand({ type: 'mystery', payload: {} })).toBe('mystery')
  })
})
