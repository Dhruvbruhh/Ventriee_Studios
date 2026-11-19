import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RichText } from '../src/renderer/src/components/RichText'

const html = (text: string) => renderToStaticMarkup(createElement(RichText, { text }))

describe('chat rich text', () => {
  it('renders bold, inline code, headings and fenced code', () => {
    expect(html('Use **assign** with `bubbfish.zip`')).toBe('Use <strong>assign</strong> with <code class="rt-code">bubbfish.zip</code>')
    expect(html('## Plan\n- one')).toBe('<strong class="rt-h">Plan</strong>\n- one')
    expect(html('Run:\n```bash\nnpm i\n```\nthen go')).toBe('Run:\n<pre class="rt-pre"><code>npm i</code></pre>\nthen go')
  })
  it('never turns model text into HTML', () => {
    expect(html('<img src=x onerror=alert(1)> **<b>x</b>**')).toBe('&lt;img src=x onerror=alert(1)&gt; <strong>&lt;b&gt;x&lt;/b&gt;</strong>')
  })
  it('keeps an unfinished stream readable', () => {
    expect(html('```js\nconst a = 1')).toBe('<pre class="rt-pre"><code>const a = 1</code></pre>')
    expect(html('half **bold')).toBe('half **bold')
  })
})
