import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildResources, packageNames, type Resource } from '../shared/resources'
import type { McpServer, PluginInfo, SkillRecord, Workflow } from '../shared/types'
import { ROLE_TEMPLATES } from './roles'

export interface ResourceInput {
  skills: SkillRecord[]
  plugins: PluginInfo[]
  mcpServers: McpServer[]
  workflows: Workflow[]
  /** Project root, so libraries already in its package.json read as installed. */
  projectPath: string | null
}

/** Dependency names of a project, or null when it has no readable package.json. */
export function readProjectDeps(root: string): Set<string> | null {
  try {
    return packageNames(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')))
  } catch {
    return null
  }
}

export function listResources(input: ResourceInput): Resource[] {
  return buildResources({
    skills: input.skills,
    plugins: input.plugins,
    mcpServers: input.mcpServers,
    workflows: input.workflows,
    agents: ROLE_TEMPLATES.map((r) => ({ role: r.role, name: r.name, title: r.title })),
    deps: input.projectPath ? readProjectDeps(input.projectPath) : null
  })
}
