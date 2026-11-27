// Office theme contract for the Ventriee floor.
//
// Layout vendored from munder-difflin (MIT). The tile art is our own, drawn in
// code by animeTiles.ts, and seats are mapped to Ventriee worker roles.

import type { Texture } from 'pixi.js'
import { colors } from './tokens'
import { CAST_BY_NAME, getCastFrames, DEFAULT_CHARACTER, type CastMember, type OfficeCharacterName } from './cast'

import { animeTilesetUrls } from './animeTiles'
import officeMapRaw from './assets/office.tmj?raw'

export interface Tile {
  x: number
  y: number
}
export type Facing = 'up' | 'down' | 'left' | 'right'

export interface TilesetEntry {
  url: string
  embedded?: boolean
  firstgid?: number
  image?: string
  imagewidth?: number
  imageheight?: number
  tilewidth?: number
  tileheight?: number
  columns?: number
  tilecount?: number
}

/** Desk-monitor overlay gids. The map paints an OFF monitor block; DeskScreen
 *  overlays the matching ON tiles while the desk's agent is seated. */
export interface MonitorConfig {
  offTopLeftGid: number
  onGids: ReadonlyArray<readonly [number, number, number]>
}

export interface PaletteConfig {
  background: number
  noteColors: Record<string, number>
}

export interface ThemeCast {
  byName: Record<string, CastMember>
  getFrames: (name: string) => Texture[][]
  defaultCharacter: string
}

export interface ErrandSpot {
  kind: 'water' | 'window' | 'dispenser' | 'fridge' | 'shelf' | 'bin'
  stand: Tile
  facing: Facing
  fx: Tile
  duration: number
}

export interface ThemeConfig {
  id: 'office'
  mapRaw: string
  tilesets: TilesetEntry[]
  /** Desk-claim order, by spawn-point name (seat 0 = the corner office). */
  primarySeatNames: string[]
  /** Café table seats used by idle workers. */
  cafeSeatNames: string[]
  cafeStands: ReadonlyArray<readonly [string, 'coffee' | 'vending']>
  monitor: MonitorConfig
  palette: PaletteConfig
  errandSpots: ErrandSpot[]
  cast: ThemeCast
}

// Painted on first use (needs a DOM canvas), then reused.
let painted: string[] | null = null
const sheets = () => (painted ??= animeTilesetUrls())

export const OFFICE_THEME: ThemeConfig = {
  id: 'office',
  mapRaw: officeMapRaw,
  tilesets: [
    // sheet 0 is described by the map itself (firstgid 1); keep the map's copy of its metadata.
    { get url() { return sheets()[0] }, embedded: true },
    {
      get url() { return sheets()[1] },
      firstgid: 513,
      image: 'a5',
      imagewidth: 256,
      imageheight: 512,
      tilewidth: 16,
      tileheight: 16,
      columns: 16,
      tilecount: 512
    },
    {
      get url() { return sheets()[2] },
      firstgid: 1025,
      image: 'interiors',
      imagewidth: 256,
      imageheight: 1424,
      tilewidth: 16,
      tileheight: 16,
      columns: 16,
      tilecount: 1424
    }
  ],
  primarySeatNames: [
    'desk-ceo',
    'pc-1',
    'pc-2',
    'pc-3',
    'pc-4',
    'pc-5',
    'pc-6',
    'desk-chief-architect',
    'desk-product-manager',
    'desk-team-lead',
    'desk-backend-engineer',
    'desk-ui-ux-expert',
    'desk-data-engineer',
    'desk-project-manager',
    'desk-market-researcher',
    'desk-agent-organizer'
  ],
  cafeSeatNames: ['cafe-seat-1', 'cafe-seat-2', 'cafe-seat-3', 'cafe-seat-4'],
  cafeStands: [
    ['cafe-stand-coffee', 'coffee'],
    ['cafe-stand-vending', 'vending']
  ],
  monitor: {
    offTopLeftGid: 365,
    onGids: [
      [367, 0, 0],
      [368, 1, 0],
      [383, 0, 1],
      [384, 1, 1]
    ]
  },
  palette: {
    background: colors.ink[900],
    noteColors: { todo: 0xf2df8a, doing: 0x9ecbf0, blocked: 0xf0a3a3, done: 0xa8e0b0 }
  },
  errandSpots: [
    { kind: 'water', stand: { x: 2, y: 20 }, facing: 'left', fx: { x: 1, y: 20 }, duration: 4.5 },
    { kind: 'water', stand: { x: 22, y: 20 }, facing: 'right', fx: { x: 23, y: 20 }, duration: 4.5 },
    { kind: 'water', stand: { x: 30, y: 20 }, facing: 'right', fx: { x: 31, y: 20 }, duration: 4.5 },
    { kind: 'water', stand: { x: 17, y: 4 }, facing: 'up', fx: { x: 17, y: 3 }, duration: 4.5 },
    { kind: 'window', stand: { x: 10, y: 3 }, facing: 'up', fx: { x: 10, y: 1 }, duration: 5 },
    { kind: 'window', stand: { x: 15, y: 3 }, facing: 'up', fx: { x: 14, y: 1 }, duration: 5 },
    { kind: 'dispenser', stand: { x: 16, y: 3 }, facing: 'down', fx: { x: 16, y: 4 }, duration: 3.5 },
    { kind: 'dispenser', stand: { x: 32, y: 4 }, facing: 'up', fx: { x: 32, y: 3 }, duration: 3.5 },
    { kind: 'fridge', stand: { x: 29, y: 20 }, facing: 'up', fx: { x: 29, y: 19 }, duration: 3.2 },
    { kind: 'shelf', stand: { x: 30, y: 20 }, facing: 'up', fx: { x: 30, y: 18 }, duration: 4 },
    { kind: 'bin', stand: { x: 18, y: 20 }, facing: 'left', fx: { x: 17, y: 20 }, duration: 2.6 },
    { kind: 'bin', stand: { x: 31, y: 16 }, facing: 'right', fx: { x: 32, y: 16 }, duration: 2.6 }
  ],
  cast: {
    byName: CAST_BY_NAME as Record<string, CastMember>,
    getFrames: (name: string) => getCastFrames(name as OfficeCharacterName),
    defaultCharacter: DEFAULT_CHARACTER
  }
}
