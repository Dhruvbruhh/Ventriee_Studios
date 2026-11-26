import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { MemoryService } from '../src/main/memory'
import { Credentials } from '../src/main/credentials'
import { Orchestrator } from '../src/main/orchestrator'
import type { Agent, ModelOption, Project, ProviderConfig, Task } from '../src/shared/types'

/**
 * Model routing v2: when the top-ranked model hard-fails, the runner escalates to
 * the next candidate in the chain instead of failing the task. The scripted
 * endpoint returns HTTP 500 for the model routed first and a real deliverable for
 * the fallback, keyed off the request's model field.
 */
const complete = (body: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: body }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`

let close: (() => Promise<void>) | null = null
afterEach(async () => {
  if (close) await close()
  close = null
})

describe('fallback escalation', { timeout: 20_000 }, () => {
  it('escalates to the next routed model when the first one fails', async () => {
    const seen: string[] = []
    const server: Server = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        const model = JSON.parse(raw).model as string
        seen.push(model)
        if (model === 'alpha') {
          res.writeHead(500, { 'content-type': 'text/plain' })
          res.end('model overloaded')
          return
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.end(complete('=== FILE: styles.css ===\nbody { margin: 0 }\n=== END FILE ===\n'))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    close = () => new Promise<void>((resolve) => server.close(() => resolve()))

    const userData = mkdtempSync(join(tmpdir(), 'ventriee-fb-'))
    const workspace = mkdtempSync(join(tmpdir(), 'ventriee-fbw-'))
    const store = new Store(join(userData, 'ventriee.db'))
    const project = store.createProject({ name: 'p', path: workspace, description: '' })
    // alpha is derived-weak but forced to rank first; the fallback beta delivers.
    store.saveSettings({ modelProfiles: { [`prov1::alpha`]: { codingScore: 100 }, [`prov1::beta`]: { codingScore: 10 } } })

    const provider: ProviderConfig = {
      id: 'prov1', label: 'Test', kind: 'openai', engine: 'api-openai',
      baseUrl: `http://127.0.0.1:${port}/v1`, models: ['alpha', 'beta'], createdAt: Date.now()
    }
    const opts = (model: string): ModelOption => ({ provider: 'prov1', providerLabel: 'Test', model, free: null, configured: true })

    const agent: Agent = {
      id: 'agt_1', projectId: project.id, role: 'frontend', name: 'Kai', title: 'Frontend',
      engine: 'api-openai', model: 'alpha', endpoint: `http://127.0.0.1:${port}/v1`,
      instructions: 'build', autonomy: 'scoped', reasoning: 'none', skills: [], concurrency: 1,
      budgetUsd: 0, color: '#fff', desk: 0, enabled: true, status: 'idle', currentTaskId: null,
      lastError: null, createdAt: Date.now()
    }
    store.insertAgent(agent)
    const task: Task = {
      id: 'tsk_1', projectId: project.id, parentId: null, title: 'Style the page',
      description: 'Write styles.css', acceptance: 'styles.css exists', role: 'frontend',
      agentId: agent.id, status: 'running', dependsOn: [], output: '', review: '', attempts: 0,
      phase: 'build', engine: null, model: null, endpoint: null, routedBy: null,
      createdAt: Date.now(), updatedAt: Date.now()
    }
    store.insertTask(task)

    const orchestrator = new Orchestrator({
      store,
      memory: new MemoryService(store, userData),
      creds: new Credentials(store.db),
      emit: new EventEmitter(),
      notify: () => {},
      isProjectOpen: () => false,
      models: () => [opts('alpha'), opts('beta')],
      providerConfigs: () => [provider]
    })

    await (orchestrator as unknown as {
      runTask: (p: Project, t: Task, a: Agent, context: string) => Promise<void>
    }).runTask(project, task, agent, '')

    // Alpha routed first and failed; beta picked up and delivered.
    expect(seen).toEqual(['alpha', 'beta'])
    expect(store.task(task.id)?.status).toBe('done')
    expect(store.task(task.id)?.model).toBe('beta')
    expect(readFileSync(join(workspace, 'styles.css'), 'utf8')).toBe('body { margin: 0 }\n')
    // One session per attempt, so the failed try stays visible in history.
    expect(store.sessions(project.id).length).toBe(2)
  })
})
