import { useEffect, useRef } from 'react'

// Ported from ascii.rest's matrix-rain piece (MIT, github.com/bas3line/ascii) to a canvas, coloured from the theme tokens.
export function hash(a: number, b: number, c: number) {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const NEAR_TAIL = ['acdeghkmnorsuvxz=+*<>', ':;!|il^~', ".,'`"]
const FAR = ['=+*<>|', ':;!|il', ':;!|il^~', ".,'`"]
const pick = (set: string, n: number) => set[Math.floor(n * set.length) % set.length]

/** The glyph at depth d below a stream's head, or null where the tail has thinned out. */
export function glyph(near: boolean, c: number, row: number, d: number, len: number, t: number): string | null {
  const f = d / len
  const slot = Math.floor(t * 2 + hash(c, row, 9) * 10) // body glyphs change now and then, per cell
  const n = hash(c, row, slot)
  if (near) {
    if (d === 0) return pick('@#%&$', hash(c, row, Math.floor(t * 20)))
    if (d <= 1) return pick('acdeghkmnorsuvxz', n)
    if (f <= 0.5) return pick('0123456789ABCDEFHKMNPRSTXZ', n)
    if (hash(c, row, 7) < ((f - 0.5) / 0.5) ** 2 * 0.8) return null
    return pick(NEAR_TAIL[Math.min(2, Math.floor((f - 0.5) * 6))], n)
  }
  if (f > 0.7 && hash(c, row, 7) < (f - 0.7) * 2) return null
  return pick(FAR[Math.min(3, Math.floor(f * 4))], n)
}

export function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const css = getComputedStyle(document.documentElement)
    const text = css.getPropertyValue('--text').trim()
    const mono = css.getPropertyValue('--mono').trim() || 'monospace'
    const accent = css.getPropertyValue('--accent').trim()
    const font = 14, cellW = 9
    let cols = 0, rows = 0, frame = 0, last = 0
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(canvas.clientWidth / cellW); rows = Math.ceil(canvas.clientHeight / font)
    }
    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      ctx.font = `${font}px ${mono}`
      ctx.textBaseline = 'top'
      for (let c = 0; c < cols; c++) {
        const near = c % 2 === 0
        const speed = near ? 9 + hash(c, 1, 0) * 9 : 4 + hash(c, 1, 0) * 2.5
        const len = Math.round(near ? 12 + hash(c, 2, 0) * 10 : 10 + hash(c, 2, 0) * 6)
        const gap = rows * (near ? 0.15 + hash(c, 4, 0) * 0.45 : 1.1 + hash(c, 4, 0) * 0.7)
        const cycle = rows + len + gap
        const head = Math.floor((t * speed + ((c * 0.618034 + hash(c, 3, 0) * 0.2) % 1) * cycle) % cycle)
        for (let d = 0; d < len; d++) {
          const row = head - d
          if (row < 0 || row >= rows) continue
          const g = glyph(near, c, row, d, len, t)
          if (!g) continue
          ctx.fillStyle = d === 0 && near ? text : accent
          ctx.globalAlpha = near ? (d === 0 ? 0.95 : 0.75 * (1 - d / len) + 0.1) : 0.28
          ctx.fillText(g, c * cellW, row * font)
        }
      }
      ctx.globalAlpha = 1
    }
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 50) return // 20 fps, like the original
      last = now; draw(now / 1000)
    }
    resize()
    const observer = new ResizeObserver(() => { resize(); draw(last / 1000) })
    observer.observe(canvas)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) draw(0)
    else frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [])
  return <canvas ref={ref} className="matrix-rain" aria-hidden="true" />
}
