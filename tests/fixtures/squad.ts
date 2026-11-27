import type { Store } from '../../src/main/store'
import { DEFAULT_DEPARTMENTS, DEPARTMENT_OF, parseManifest, MANIFEST_FORMAT } from '../../src/shared/agents'

/** The classic specialist roles, as a team pack would add them: tests of squad behaviour load these, since the plain app ships only a planner and one agent. */
export const SQUAD: Array<[role: string, title: string, writesCode: boolean]> = [
  ['researcher', 'Researcher', false], ['architect', 'Architect', true], ['designer', 'Designer', true],
  ['frontend', 'Frontend Engineer', true], ['integration', 'Integration Engineer', true], ['backend', 'Backend Engineer', true],
  ['database', 'Database Engineer', true], ['reviewer', 'Reviewer', false], ['fixer', 'Fixer', true], ['security', 'Security Engineer', true],
  ['qa', 'QA Engineer', true], ['seo', 'SEO Specialist', true], ['aeo', 'AEO Specialist', true], ['deployment', 'Deployment Engineer', true],
  ['monitoring', 'Monitoring Engineer', true]
]

export function squadManifest() {
  return {
    format: MANIFEST_FORMAT, version: 1, departments: DEFAULT_DEPARTMENTS,
    agents: SQUAD.map(([role, title, writesCode]) => ({
      role, name: title.split(' ')[0], title, description: `${title}.`, department: DEPARTMENT_OF[role] ?? 'project-management', color: '#888888',
      instructions: `You are the ${title}.`, engine: '', model: '', skills: [], mcpServers: [], writesCode, budgetUsd: 5, requiresApproval: false, enabled: true
    }))
  }
}

export function withSquad(store: Store) {
  store.importAgents(parseManifest(squadManifest(), { skills: [], mcpServers: [] }), true)
  return store
}
