import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'

const store = () => new Store(join(mkdtempSync(join(tmpdir(), 'ventriee-store-')), 'ventriee.db'))

describe('session rows', () => {
  // The insert listed 17 columns with 16 placeholders, so every task failed before a
  // session existed and nothing was recorded. One real insert would have caught it.
  it('inserts a session with every column bound', () => {
    const s = store()
    s.insertSession({
      id: 'ses_1',
      projectId: 'prj_1',
      agentId: 'agt_1',
      taskId: 'tsk_1',
      engine: 'api-ollama',
      model: 'llama3.2:1b',
      cwd: process.cwd(),
      reasoning: 'high',
      status: 'running',
      exitCode: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      externalId: null,
      command: '',
      startedAt: Date.now(),
      endedAt: null
    })

    const row = s.db.get<Record<string, unknown>>('SELECT * FROM sessions WHERE id = ?', 'ses_1')
    expect(row?.reasoning).toBe('high')
    expect(row?.model).toBe('llama3.2:1b')
    s.db.close()
  })
})

describe('chat branching', () => {
  it('copies turns up to the message into a new session and leaves the original untouched', () => {
    const s = store()
    const p = s.createProject({ name: 'B', path: 'C:/tmp/b', description: '' })
    const convo = s.createConversation(p.id)
    const owner = s.addChatMessage({ projectId: p.id, conversationId: convo.id, role: 'owner', content: 'first idea', model: '', status: 'done' })
    const reply = s.addChatMessage({ projectId: p.id, conversationId: convo.id, role: 'assistant', content: 'first reply', model: 'm', status: 'done' })
    s.addChatMessage({ projectId: p.id, conversationId: convo.id, role: 'owner', content: 'second idea', model: '', status: 'done' })

    const branch = s.branchConversation(p.id, reply.id)
    expect(branch.id).not.toBe(convo.id)
    expect(branch.branchedFrom).toBe(convo.id)
    expect(branch.branchedFromMessageId).toBe(reply.id)

    const branchMsgs = s.chatMessages(p.id, 400, branch.id)
    expect(branchMsgs.map((m) => m.content)).toEqual(['first idea', 'first reply'])
    // Branching stays in the original session: the active conversation is untouched.
    expect(s.conversation(p.id).id).toBe(convo.id)
    expect(s.chatMessages(p.id, 400, convo.id).length).toBe(3)

    // The session index carries the parent link for the sidebar.
    const row = s.db.get<{ branchedFrom: string | null }>('SELECT branchedFrom FROM conversations WHERE id = ?', branch.id)
    expect(row?.branchedFrom).toBe(convo.id)
    s.db.close()
  })

  it('refuses a message from another project', () => {
    const s = store()
    const a = s.createProject({ name: 'A', path: 'C:/tmp/a', description: '' })
    const b = s.createProject({ name: 'B', path: 'C:/tmp/b2', description: '' })
    const convo = s.createConversation(a.id)
    const msg = s.addChatMessage({ projectId: a.id, conversationId: convo.id, role: 'owner', content: 'x', model: '', status: 'done' })
    expect(() => s.branchConversation(b.id, msg.id)).toThrow(/not found/)
    s.db.close()
  })
})
