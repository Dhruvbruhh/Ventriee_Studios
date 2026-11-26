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

  it('rewinds from an owner message for edit/regenerate, and nothing else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventriee-rewind-'))
    const store = new Store(join(dir, 'ventriee.db'))
    const project = store.createProject({ name: 'R', path: dir, description: '' })
    const c = store.conversation(project.id)
    const add = (role: 'owner' | 'assistant', content: string, createdAt: number, status: 'done' | 'streaming' = 'done') =>
      store.addChatMessage({ projectId: project.id, conversationId: c.id, role, content, model: '', status, createdAt })
    add('owner', 'q1', 1)
    const a1 = add('assistant', 'a1', 1)
    const q2 = add('owner', 'q2', 2); add('assistant', 'a2', 2)
    const other = store.createConversation(project.id)
    store.addChatMessage({ projectId: project.id, conversationId: other.id, role: 'owner', content: 'keep', model: '', status: 'done', createdAt: 3 })

    expect(() => store.rewindChat(project.id, c.id, a1.id)).toThrow('not in this session')
    expect(() => store.rewindChat(project.id, other.id, q2.id)).toThrow('not in this session')
    store.rewindChat(project.id, c.id, q2.id)
    expect(store.chatMessages(project.id, 400, c.id).map((m) => m.content).sort()).toEqual(['a1', 'q1'])
    expect(store.chatMessages(project.id, 400, other.id).map((m) => m.content)).toEqual(['keep'])

    const q3 = add('owner', 'q3', 4); add('assistant', '', 4, 'streaming')
    expect(() => store.rewindChat(project.id, c.id, q3.id)).toThrow('finish')
    expect(store.chatMessages(project.id, 400, c.id)).toHaveLength(4)
  })

  it('reads @Session mentions within range, once each', () => {
    expect(mentionedSessions('ask @Session 2 and @session2 and @SESSION 3, not @session 9', 3)).toEqual([2, 3])
    expect(mentionedSessions('no mention', 3)).toEqual([])
  })
})
