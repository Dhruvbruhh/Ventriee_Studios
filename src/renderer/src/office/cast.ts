import { Texture } from 'pixi.js'
import { paintPortrait, sceneFrameBufs, SCENE_W, SCENE_H, type Mood } from './portraitArt'

// The office cast: original anime-style characters, each drawn from a procedural
// recipe (see portraitArt.ts), so no sprite sheets and no external art licences
// are involved. Roles map onto characters in ROLE_CHARACTER below.
export type OfficeCharacterName =
  | 'sakura' | 'yuki' | 'hana' | 'rin' | 'mei' | 'aoi' | 'kaede'
  | 'nami' | 'suzu' | 'akane' | 'hikari' | 'tsubaki' | 'mio' | 'ran' | 'koharu'

export interface CastMember {
  name: OfficeCharacterName
  displayName: string
  shirt: string
  blurb: string
}

export const OFFICE_CAST: CastMember[] = [
  { name: 'sakura', displayName: 'Sakura', shirt: '#464e5c', blurb: 'Runs the floor' },
  { name: 'yuki', displayName: 'Yuki', shirt: '#b4c8ec', blurb: 'Reads everything' },
  { name: 'hana', displayName: 'Hana', shirt: '#ffecc8', blurb: 'Designs the work' },
  { name: 'rin', displayName: 'Rin', shirt: '#282834', blurb: 'Guards the standards' },
  { name: 'mei', displayName: 'Mei', shirt: '#ffc8dc', blurb: 'Plans the structure' },
  { name: 'aoi', displayName: 'Aoi', shirt: '#ecf2ff', blurb: 'Ships the work' },
  { name: 'kaede', displayName: 'Kaede', shirt: '#ffbe78', blurb: 'Deploys it' },
  { name: 'nami', displayName: 'Nami', shirt: '#c8f0e6', blurb: 'Wires it together' },
  { name: 'suzu', displayName: 'Suzu', shirt: '#fad296', blurb: 'Tests it' },
  { name: 'akane', displayName: 'Akane', shirt: '#602430', blurb: 'Builds the backend' },
  { name: 'hikari', displayName: 'Hikari', shirt: '#ffffff', blurb: 'Finds the words' },
  { name: 'tsubaki', displayName: 'Tsubaki', shirt: '#8c2846', blurb: 'Keeps it safe' },
  { name: 'mio', displayName: 'Mio', shirt: '#5a64a0', blurb: 'Keeps the data' },
  { name: 'ran', displayName: 'Ran', shirt: '#78d2a0', blurb: 'Fixes it' },
  { name: 'koharu', displayName: 'Koharu', shirt: '#c8b4fa', blurb: 'Keeps it running' }
]

export const CAST_BY_NAME: Record<OfficeCharacterName, CastMember> = Object.fromEntries(
  OFFICE_CAST.map((c) => [c.name, c])
) as Record<OfficeCharacterName, CastMember>

export const DEFAULT_CHARACTER: OfficeCharacterName = 'aoi'

/** Ventriee worker role → character. The orchestrator sits in the corner office. */
export const ROLE_CHARACTER: Record<string, OfficeCharacterName> = {
  orchestrator: 'sakura',
  assistant: 'aoi',
  researcher: 'yuki',
  architect: 'mei',
  designer: 'hana',
  frontend: 'aoi',
  integration: 'nami',
  backend: 'akane',
  database: 'mio',
  security: 'tsubaki',
  reviewer: 'rin',
  fixer: 'ran',
  qa: 'suzu',
  seo: 'hikari',
  aeo: 'hikari',
  deployment: 'kaede',
  monitoring: 'koharu'
}

export function characterForRole(role: string): OfficeCharacterName {
  return ROLE_CHARACTER[role] ?? DEFAULT_CHARACTER
}

const frameCache = new Map<string, Texture[][]>()

function bufToTexture(buf: Uint8ClampedArray): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = SCENE_W
  canvas.height = SCENE_H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(SCENE_W, SCENE_H)
  img.data.set(buf)
  ctx.putImageData(img, 0, 0)
  const tex = Texture.from(canvas)
  tex.source.scaleMode = 'nearest'
  return tex
}

/** Frame grid CharacterSprite expects: 3 rows (down, up, right) × 7 frames. */
export function getCastFrames(name: OfficeCharacterName, mood?: Mood): Texture[][] {
  const key = `${name}:${mood ?? ''}`
  const cached = frameCache.get(key)
  if (cached) return cached
  const { front, back } = sceneFrameBufs(name, mood)
  const toRow = (bufs: Uint8ClampedArray[]): Texture[] => {
    const [stand, stepL, stepR] = bufs.map(bufToTexture)
    return [stand, stepL, stepR, stand, stand, stand, stand]
  }
  const frontRow = toRow(front)
  const frames: Texture[][] = [frontRow, toRow(back), frontRow]
  frameCache.set(key, frames)
  return frames
}

/** Draw a member's portrait into a 2D canvas (used by the roster list). */
export function paintCastPortrait(ctx: CanvasRenderingContext2D, name: OfficeCharacterName, scale = 2): void {
  paintPortrait(ctx, name, scale)
}
