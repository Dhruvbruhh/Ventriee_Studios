import { useEffect, useState } from 'react'
import { MOODS, type Mood } from './portraitArt'
import type { Agent } from '../../../shared/types'

// Face sheets come from installed packs (agent role → a 2×4 grid of the eight moods,
// in MOODS order). Without one, agents keep their drawn pixel faces.

let sheets: Promise<Map<string, HTMLImageElement>> | null = null

/** Load every pack's face sheets once (call reloadFaces after a pack changes). */
export function faceSheets(): Promise<Map<string, HTMLImageElement>> {
  sheets ??= window.ventriee.agentFaces().then(async (urls) => {
    const out = new Map<string, HTMLImageElement>()
    await Promise.all(Object.entries(urls).map(([role, url]) => new Promise<void>((done) => {
      const img = new Image()
      img.onload = () => { out.set(role, img); done() }
      img.onerror = () => done()
      img.src = url
    })))
    return out
  }).catch(() => new Map())
  return sheets
}

export function reloadFaces() { sheets = null; cells.clear() }

const cells = new Map<string, HTMLCanvasElement>()

/** The mood's cell from a sheet, cropped to a square head-and-shoulders at `size` px. */
export function faceCell(sheet: HTMLImageElement, role: string, mood: Mood, size = 128): HTMLCanvasElement {
  const key = `${role}:${mood}:${size}`
  const cached = cells.get(key)
  if (cached) return cached
  const i = MOODS.indexOf(mood)
  const cw = sheet.naturalWidth / 4, ch = sheet.naturalHeight / 2
  const side = Math.min(cw, ch) * 0.9
  const sx = (i % 4) * cw + (cw - side) / 2
  const sy = Math.floor(i / 4) * ch + ch * 0.02
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
  const g = canvas.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(sheet, sx, sy, side, side, 0, 0, size, size)
  cells.set(key, canvas)
  return canvas
}

/** React: the face for a role and mood as a data URL, or null when no pack gives this role a sheet. */
export function useFace(role: string, mood: Mood): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void faceSheets().then((map) => {
      const sheet = map.get(role)
      if (alive) setUrl(sheet ? faceCell(sheet, role, mood).toDataURL() : null)
    })
    return () => { alive = false }
  }, [role, mood])
  return url
}

/** The face an agent wears for its state; undefined is the character's own resting face. */
export function moodFor(status: Agent['status'], selected: boolean): Mood | undefined {
  if (status === 'error') return 'cry'
  if (status === 'paused') return 'angry'
  if (selected) return 'blush'
  if (status === 'working') return 'smile'
  if (status === 'waiting' || status === 'offline') return 'tired'
  return undefined
}
