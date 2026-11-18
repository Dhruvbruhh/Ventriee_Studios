import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('../src/renderer/src/editor/monaco', () => ({
  monaco: {}, languageFor: () => 'plaintext', editorLanguages: () => [{ id: 'plaintext', aliases: ['Plain Text'] }, { id: 'typescript', aliases: ['TypeScript'] }]
}))
vi.mock('../src/renderer/src/components/Preview', () => ({ Preview: () => null }))
import CodeWorkspace from '../src/renderer/src/editor/CodeWorkspace'
import type { Project } from '../src/shared/types'
const project = { id: 'test-project', name: '<script>example</script>', path: 'D:/example' } as Project
describe('code workspace initial UI', () => {
  it('renders accessible editor, explorer, language picker, and empty-state controls', () => {
    const html = renderToStaticMarkup(createElement(CodeWorkspace, { project, visible: true }))
    for (const label of ['Project files', 'Code editor', 'Open files', 'Editor language', 'New file', 'New folder', 'Source Control', 'Show preview']) expect(html).toContain(label)
    expect(html).toContain('Ctrl+P')
    expect(html).toContain('&lt;script&gt;example&lt;/script&gt;')
    expect(html).not.toContain('<script>example</script>')
  })
  it('keeps the editor mounted but hidden when another workspace is selected', () => {
    const html = renderToStaticMarkup(createElement(CodeWorkspace, { project, visible: false }))
    expect(html).toContain('display:none')
    expect(html).toContain('Code editor')
  })
})
