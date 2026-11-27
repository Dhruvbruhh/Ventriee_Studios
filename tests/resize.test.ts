import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { clampSize, ResizeHandle, sizeVar } from '../src/renderer/src/components/Resize'

describe('resize helpers', () => {
  it('clamps and rounds sizes', () => {
    expect(clampSize(300, 180, 520)).toBe(300)
    expect(clampSize(10, 180, 520)).toBe(180)
    expect(clampSize(9999, 180, 520)).toBe(520)
    expect(clampSize(260.6, 180, 520)).toBe(261)
  })
  it('maps a size to a CSS custom property, or nothing when null', () => {
    expect(sizeVar('--shell-side-w', null)).toEqual({})
    expect(sizeVar('--shell-side-w', '260px')).toEqual({ '--shell-side-w': '260px' })
  })
  it('renders an accessible separator handle', () => {
    const html = renderToStaticMarkup(createElement(ResizeHandle, {
      axis: 'x', label: 'Resize the sidebar', size: null, dragging: false,
      onPointerDown: () => {}, onNudge: () => {}, onReset: () => {}
    }))
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-orientation="vertical"')
    expect(html).toContain('aria-label="Resize the sidebar"')
  })
})
