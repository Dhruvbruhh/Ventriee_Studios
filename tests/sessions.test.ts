import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { mentionedSessions } from '../src/main/planning'

describe('planning sessions', () => {
  it('keeps each session\'s messages apart and tracks the active one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventriee-sessions-'))
    const store = new Store(join(dir, 'ventriee.db'))
    const project = store.createProject({ name: 'S', path: dir, description: '' })
    const first = store.conversation(project.id)
    store.addChatMessage({ projectId: project.id, conversationId: first.id, role: 'owner', content: 'auth uses magic links', model: '', status: 'done' })
    const second = store.createConversation(project.id)
    expect(store.conversation(project.id).id).toBe(second.id)
    store.addChatMessage({ projectId: project.id, conversationId: second.id, role: 'owner', content: 'pricing page', model: '', status: 'done' })
    expect(store.chatMessages(project.id).map((m) => m.content)).toEqual(['pricing page'])
    expect(store.chatMessages(project.id, 400, first.id).map((m) => m.content)).toEqual(['auth uses magic links'])
    store.setActiveConversation(project.id, first.id)
    expect(store.conversations(project.id).map((c) => c.id)).toEqual([first.id, second.id])
    expect(store.snapshot([], null, [], project.id).chat.map((m) => m.content)).toEqual(['auth uses magic links'])
    expect(() => store.setActiveConversation(project.id, 'cnv_other')).toThrow('not found')
  })

  it('reads @Session mentions within range, once each', () => {
    expect(mentionedSessions('ask @Session 2 and @session2 and @SESSION 3, not @session 9', 3)).toEqual([2, 3])
    expect(mentionedSessions('no mention', 3)).toEqual([])
  })
})
