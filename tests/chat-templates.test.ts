import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { chatTranscriptMarkdown } from '../src/shared/transcript'

describe('chat templates and session export', () => {
  it('saves, edits, lists and deletes reusable templates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventriee-tpl-'))
    const store = new Store(join(dir, 'ventriee.db'))
    expect(store.chatTemplates()).toEqual([])
    expect(() => store.saveChatTemplate({ name: '  ', content: 'x' })).toThrow('name')
    expect(() => store.saveChatTemplate({ name: 'x', content: ' ' })).toThrow('empty')

    const a = store.saveChatTemplate({ name: 'Pricing brief', content: 'We need a pricing page for…' })
    const b = store.saveChatTemplate({ name: 'Auth brief', content: 'Magic links only.' })
    expect(store.chatTemplates().map((t) => t.id)).toEqual([a.id, b.id])

    const edited = store.saveChatTemplate({ id: a.id, name: 'Pricing brief v2', content: 'Updated.' })
    expect(store.chatTemplates()).toHaveLength(2)
    expect(store.chatTemplates()[0]).toMatchObject({ id: a.id, name: 'Pricing brief v2', content: 'Updated.' })
    expect(() => store.saveChatTemplate({ id: 'tpl_none', name: 'x', content: 'y' })).toThrow('not found')

    store.deleteChatTemplate(b.id)
    expect(store.chatTemplates().map((t) => t.id)).toEqual([a.id])
  })

  it('exports a session as a titled transcript, refusing foreign sessions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventriee-exp-'))
    const store = new Store(join(dir, 'ventriee.db'))
    const project = store.createProject({ name: 'E', path: dir, description: '' })
    const first = store.conversation(project.id)
    store.addChatMessage({ projectId: project.id, conversationId: first.id, role: 'owner', content: 'build the auth', model: '', status: 'done' })
    store.addChatMessage({ projectId: project.id, conversationId: first.id, role: 'assistant', content: 'Here is the plan.', model: 'gpt-5', status: 'done' })
    const second = store.createConversation(project.id)
    store.addChatMessage({ projectId: project.id, conversationId: second.id, role: 'owner', content: 'pricing now', model: '', status: 'done' })

    const active = store.exportConversation(project.id)
    expect(active.title).toBe('Session 2')
    expect(active.messages.map((m) => m.content)).toEqual(['pricing now'])
    expect(store.exportConversation(project.id, first.id).messages).toHaveLength(2)
    expect(() => store.exportConversation(project.id, 'cnv_other')).toThrow('not found')

    const firstExport = store.exportConversation(project.id, first.id)
    const md = chatTranscriptMarkdown(firstExport.title, firstExport.messages)
    expect(md).toContain('# Session 1')
    expect(md).toContain('## You')
    expect(md).toContain('build the auth')
    expect(md).toContain('## Assistant (gpt-5)')
    expect(chatTranscriptMarkdown('', [])).toContain('# Planning session')
  })
})
