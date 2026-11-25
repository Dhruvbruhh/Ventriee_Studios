// Anime impact effects (Sakuga VFX, MIT, vendored unchanged in ./vendor/sakuga) drawn on one canvas over the app.
// Their core turns itself off under prefers-reduced-motion; the "effects" setting turns it off here.
import { useStore } from './store'

type Opts = Record<string, unknown>
type Draw = (x: number, y: number, o?: Opts) => void
interface SakugaFX {
  P: Record<string, unknown>
  at(el: Element, fx?: number, fy?: number): { x: number; y: number; w: number; h: number }
  later(ms: number, f: () => void): void
  puff: Draw; burst: Draw; shards: Draw; ticks: Draw; lines: Draw; kira: Draw; slash: Draw
  sfx(name: 'don' | 'gogo' | 'kachi' | 'pon' | 'shu' | 'zuza', x: number, y: number, o?: Opts): void
  hollow(): Opts; dotted(): Opts
}
// Loaded by main.tsx only, so components still render in tests and server rendering without a canvas.
let FX: SakugaFX = null as unknown as SakugaFX
export async function initFx() {
  await import('./vendor/sakuga/core.js')
  FX = (window as unknown as { SakugaFX: SakugaFX }).SakugaFX
  // Retinted to the studio theme: colours come from the tokens in styles.css.
  const css = getComputedStyle(document.documentElement)
  const t = (name: string) => css.getPropertyValue(name).trim()
  Object.assign(FX.P, { fill: t('--text'), shade: t('--accent'), line: t('--accent-deep'), accent: t('--warn'), ink: t('--accent-ink'), sfx: [t('--accent-ink'), t('--text')] })
  // Buttons opt in by markup: data-fx="send" | "tab", and every primary button gets the small confirm.
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-fx], .btn.primary')
    if (!el || (el as HTMLButtonElement).disabled) return
    const kind = el.getAttribute('data-fx')
    if (kind === 'send') send(el)
    else if (kind === 'tab') land(el)
    else confirm(el)
  }, true)
}

const on = () => Boolean(FX) && useStore.getState().snapshot?.settings.effects !== false

/** Something finished well (a task done, tests passing): burst, crystals and ドン!. */
export function impact(el: Element | null) {
  if (!el || !on()) return
  const c = FX.at(el)
  FX.burst(c.x, c.y, { r: 46, life: 0.34 })
  FX.shards(c.x, c.y, { n: 8, speed: 200, size: 5, arc: 6.28 })
  for (const a of [0.4, 2.7]) FX.puff(c.x + Math.cos(a) * 30, c.y + Math.sin(a) * 14, { size: 10, n: 4, vx: Math.cos(a) * 30, life: 0.75 })
  FX.sfx('don', c.x - 18, c.y - 54, { size: 96, rot: -0.12 })
}

/** A primary action: wedges off the corner and a puff. */
export function confirm(el: Element | null) {
  if (!el || !on()) return
  const c = FX.at(el)
  FX.ticks(c.x + c.w / 2 + 4, c.y - c.h / 2 - 2, { n: 3, r: 4, len: 12, life: 0.4 })
  FX.puff(c.x - c.w / 2, c.y + c.h / 2, { size: 7, n: 3, vx: -14, life: 0.55 })
}

/** A message leaving: speed lines behind, a slash ahead and シュッ. */
export function send(el: Element | null) {
  if (!el || !on()) return
  const c = FX.at(el)
  FX.lines(c.x - c.w / 2, c.y, { n: 6, dir: Math.PI, len: 44, spread: 14 })
  FX.slash(c.x + 24, c.y - 6, { len: 70, ang: -0.35, thick: 9, life: 0.32 })
  FX.sfx('shu', c.x - 6, c.y - 46, { size: 64, ...FX.hollow() })
}

/** Switching view: the picked tab lands with wedges, a puff and speed lines. */
export function land(el: Element | null, dir = 1) {
  if (!el || !on()) return
  const c = FX.at(el)
  FX.ticks(c.x, c.y - c.h / 2 - 10, { dir: -Math.PI / 2, n: 3, r: 4, len: 13, fan: 0.5, life: 0.45 })
  FX.puff(c.x - dir * (c.w / 2 + 8), c.y + 4, { size: 8, n: 4, vx: -dir * 18, vy: -10, life: 0.6 })
  FX.lines(c.x - dir * c.w / 2, c.y, { n: 3, dir: dir > 0 ? Math.PI : 0, len: 26, spread: 8 })
}

/** A notice sliding in: dust where it lands, カチッ; errors get a sharper jolt and no lettering. */
export function notice(el: Element | null, error = false) {
  if (!el || !on()) return
  const c = FX.at(el)
  FX.lines(c.x - c.w / 2 - 4, c.y, { n: 6, dir: Math.PI, len: 50, spread: 12, life: 0.3 })
  FX.puff(c.x - c.w / 2 + 10, c.y + c.h / 2, { size: 9, n: 4, vx: -20, vy: -8, life: 0.7 })
  if (error) FX.ticks(c.x + c.w / 2 - 8, c.y - c.h / 2 - 4, { n: 3, r: 5, len: 14, life: 0.45 })
  else FX.sfx('kachi', c.x + c.w / 2 - 40, c.y - c.h / 2 - 40, { size: 58, ...FX.hollow() })
}

/** A small check: a twinkle (saving, ticking a box). */
export function twinkle(el: Element | null) {
  if (!el || !on()) return
  const c = FX.at(el)
  FX.kira(c.x + c.w / 2, c.y - c.h / 2, { r: 8, life: 0.5 })
}
