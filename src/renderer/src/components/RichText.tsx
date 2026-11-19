import { Fragment, type ReactNode } from 'react'

/** **bold** and `code` inside a line; everything else stays plain text (React escapes it). */
function inline(line: string, key: string): ReactNode[] {
  return line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
      : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={`${key}-${i}`} className="rt-code">{part.slice(1, -1)}</code>
      : <Fragment key={`${key}-${i}`}>{part}</Fragment>)
}

/**
 * The small Markdown subset models actually send in chat: headings, bold, inline code
 * and fenced code blocks. Lists and paragraphs keep their own line breaks (pre-wrap).
 * shortcut: no tables or links, add them when replies use them.
 */
export function RichText({ text }: { text: string }) {
  const blocks = text.split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g)
  return <>{blocks.map((block, b) => {
    if (block.startsWith('```')) {
      const body = block.replace(/^```[^\n]*\n/, '').replace(/```$/, '').replace(/\n$/, '')
      return <pre key={b} className="rt-pre"><code>{body}</code></pre>
    }
    const lines = block.split('\n')
    return <Fragment key={b}>{lines.map((line, l) => {
      const heading = /^#{1,4}\s+(.*)$/.exec(line)
      const end = l < lines.length - 1 ? '\n' : ''
      return heading ? <Fragment key={l}><strong className="rt-h">{inline(heading[1], `${b}-${l}`)}</strong>{end}</Fragment>
        : <Fragment key={l}>{inline(line, `${b}-${l}`)}{end}</Fragment>
    })}</Fragment>
  })}</>
}
