import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'

/** Clamp a drag size between min and max, rounded to whole pixels. */
export function clampSize(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

const KEY = 'ventriee.resize.'

function readSize(id: string): number | null {
  try {
    const stored = Number(localStorage.getItem(KEY + id))
    return Number.isFinite(stored) && stored > 0 ? stored : null
  } catch { return null }
}

function writeSize(id: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(KEY + id)
    else localStorage.setItem(KEY + id, value)
  } catch { /* storage unavailable: sizes just do not persist */ }
}

/**
 * Persisted drag-size for one panel, found by its unique selector.
 * Returns [cssVarValue (null = CSS default), pointerDown handler, dragging, nudge, reset].
 */
export function useDragSize(selector: string, id: string, axis: 'x' | 'y', min: number, max: number): [string | null, (event: ReactPointerEvent) => void, boolean, (delta: number) => void, () => void] {
  const [size, setSize] = useState<number | null>(() => {
    const stored = readSize(id)
    return stored != null ? clampSize(stored, min, max) : null
  })
  const [dragging, setDragging] = useState(false)
  const origin = useRef({ x: 0, y: 0, base: 0 })
  const bounds = useCallback(() => {
    const el = document.querySelector<HTMLElement>(selector)
    const ceiling = axis === 'y' ? Math.min(max, (el?.parentElement?.clientHeight ?? max) - 180) : max
    return { el, ceiling: Math.max(min, ceiling) }
  }, [axis, max, min, selector])
  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    event.preventDefault()
    const { el } = bounds()
    if (!el) return
    origin.current = { x: event.clientX, y: event.clientY, base: axis === 'x' ? el.offsetWidth : el.offsetHeight }
    setDragging(true)
  }, [axis, bounds])
  useEffect(() => {
    if (!dragging) return
    document.body.classList.add('dragging-size')
    const move = (event: PointerEvent) => {
      // A y handle sits on top of the panel it grows, so the pointer moving up means a taller panel.
      const delta = axis === 'x' ? event.clientX - origin.current.x : origin.current.y - event.clientY
      const { ceiling } = bounds()
      setSize(clampSize(origin.current.base + delta, min, ceiling))
    }
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      document.body.classList.remove('dragging-size')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [axis, bounds, dragging, min])
  useEffect(() => {
    writeSize(id, size != null ? String(size) : null)
  }, [id, size])
  const nudge = useCallback((delta: number) => {
    const { el, ceiling } = bounds()
    const base = size ?? (el ? (axis === 'x' ? el.offsetWidth : el.offsetHeight) : min)
    setSize(clampSize(base + delta, min, ceiling))
  }, [axis, bounds, min, size])
  const reset = useCallback(() => { writeSize(id, null); setSize(null) }, [id])
  return [size != null ? `${size}px` : null, onPointerDown, dragging, nudge, reset]
}

export function ResizeHandle({ axis, label, size, dragging, onPointerDown, onNudge, onReset }: {
  axis: 'x' | 'y'
  label: string
  size: string | null
  dragging: boolean
  onPointerDown: (event: ReactPointerEvent) => void
  onNudge: (delta: number) => void
  onReset: () => void
}) {
  const onKeyDown = (event: ReactKeyboardEvent) => {
    const grow = axis === 'x' ? event.key === 'ArrowRight' : event.key === 'ArrowUp'
    const shrink = axis === 'x' ? event.key === 'ArrowLeft' : event.key === 'ArrowDown'
    if (!grow && !shrink) return
    event.preventDefault()
    onNudge(grow ? 24 : -24)
  }
  return <div
    className={`drag-handle drag-${axis}${dragging ? ' dragging' : ''}`}
    role="separator"
    aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
    aria-label={label}
    aria-valuenow={size != null ? Number.parseFloat(size) : undefined}
    tabIndex={0}
    onPointerDown={onPointerDown}
    onKeyDown={onKeyDown}
    onDoubleClick={onReset}
  />
}

/** Style object carrying one CSS custom property when the panel has a dragged size. */
export function sizeVar(name: string, value: string | null): CSSProperties {
  return (value != null ? { [name]: value } : {}) as CSSProperties
}
