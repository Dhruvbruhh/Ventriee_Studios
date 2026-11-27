// Original tile art for the office map, drawn in code (no image files, no third-party art).
// office.tmj places tiles by gid; this paints every gid the map uses into three sheets
// with the same layout the map expects (firstgid 1, 513 and 1025, 16 px tiles).

const T = 16
const INK = '#3d3050'

type Ctx = CanvasRenderingContext2D
type Draw = (g: Ctx) => void

/** Sheet geometry, matching the map's tileset entries. */
export const SHEETS = [
  { firstgid: 1, width: 256, height: 512 },
  { firstgid: 513, width: 256, height: 512 },
  { firstgid: 1025, width: 256, height: 1424 }
] as const

const r = (g: Ctx, c: string, x: number, y: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(x, y, w, h) }
/** Filled rectangle with a 1 px ink outline. */
const box = (g: Ctx, c: string, x: number, y: number, w: number, h: number) => { r(g, INK, x, y, w, h); r(g, c, x + 1, y + 1, w - 2, h - 2) }
const disc = (g: Ctx, c: string, cx: number, cy: number, rad: number) => {
  g.fillStyle = INK; g.beginPath(); g.arc(cx, cy, rad + 1, 0, Math.PI * 2); g.fill()
  g.fillStyle = c; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill()
}

// ─── multi-tile objects: drawn whole, then sliced into their gids ────────────
interface Piece { cols: number; rows: number; gids: number[][]; draw: Draw }

const floorWood: Draw = (g) => {
  r(g, '#ecd2a8', 0, 0, 32, 32)
  for (let y = 0; y < 32; y += 8) {
    r(g, '#d9b789', 0, y + 7, 32, 1)
    const seam = (y / 8) % 2 ? 6 : 22
    r(g, '#d9b789', seam, y, 1, 7)
    r(g, '#f5e2c3', 0, y, 32, 1)
  }
}

const rug: Draw = (g) => {
  r(g, '#f6b8c8', 0, 0, 32, 32)
  r(g, '#fde7ee', 2, 2, 28, 28)
  r(g, '#f6b8c8', 4, 4, 24, 24)
  // a heart in the middle
  g.fillStyle = '#fff4f7'
  for (const [x, y, w] of [[11, 12, 4], [17, 12, 4], [10, 13, 12], [10, 14, 12], [11, 15, 10], [12, 16, 8], [13, 17, 6], [14, 18, 4], [15, 19, 2]] as const) g.fillRect(x, y, w, 1)
}

const desk: Draw = (g) => {
  box(g, '#fbe9ef', 0, 2, 48, 18)
  r(g, '#fff7fa', 1, 3, 46, 2)
  r(g, '#e9b8c8', 1, 17, 46, 2)
  for (const x of [2, 42]) box(g, '#d993ab', x, 19, 4, 7)
}

const monitor = (on: boolean): Draw => (g) => {
  box(g, '#5b4d72', 4, 1, 24, 16)
  if (on) {
    r(g, '#bfe9ff', 6, 3, 20, 12)
    for (const [x, y, w, c] of [[8, 5, 9, '#ff8fb5'], [8, 8, 13, '#ffffff'], [10, 11, 8, '#9b7bff']] as const) r(g, c, x, y, w, 1)
  } else {
    r(g, '#2a2238', 6, 3, 20, 12)
    r(g, '#4a3e63', 7, 4, 4, 1)
  }
  r(g, '#5b4d72', 14, 17, 4, 3)
  box(g, '#efe9f7', 6, 22, 18, 6)
  for (let x = 8; x < 22; x += 3) r(g, '#c9bfdc', x, 24, 2, 2)
  disc(g, '#efe9f7', 27, 25, 2)
}

const chair: Draw = (g) => {
  disc(g, '#f4a6c0', 8, 8, 6)
  r(g, '#fcd3e1', 5, 5, 4, 2)
  for (const x of [4, 11]) r(g, INK, x, 15, 1, 4)
}

const window2: Draw = (g) => {
  box(g, '#ffffff', 2, 2, 28, 26)
  r(g, '#bfe3ff', 4, 4, 11, 22); r(g, '#bfe3ff', 17, 4, 11, 22)
  r(g, '#ffffff', 6, 8, 6, 2); r(g, '#ffffff', 20, 6, 5, 2)
  for (const [x, y] of [[9, 18], [22, 14], [24, 21], [12, 23]] as const) r(g, '#ffb3cc', x, y, 2, 2)
  r(g, '#f3c6d6', 1, 27, 30, 3)
}

const counter: Draw = (g) => {
  box(g, '#fffaf5', 0, 4, 48, 12)
  box(g, '#bfe6d6', 0, 15, 48, 14)
  for (const x of [15, 31]) r(g, INK, x, 15, 1, 14)
  for (const x of [7, 23, 39]) r(g, '#7fb8a3', x, 20, 3, 1)
}

const shelf: Draw = (g) => {
  box(g, '#f2d9b8', 1, 4, 30, 44)
  const books = ['#ff8fb5', '#9b7bff', '#7fd3c1', '#ffd36e', '#8ec5ff']
  for (const y of [8, 22, 36]) {
    r(g, '#d9b789', 3, y + 10, 26, 2)
    for (let i = 0; i < 6; i++) r(g, books[(i + y) % books.length], 4 + i * 4, y + 2 + (i % 2), 3, 8 - (i % 2))
  }
}

const fridge: Draw = (g) => {
  box(g, '#e8f4ff', 1, 4, 14, 42)
  r(g, INK, 1, 20, 14, 1)
  r(g, '#9fb7cf', 11, 10, 1, 6); r(g, '#9fb7cf', 11, 24, 1, 8)
  disc(g, '#ff8fb5', 5, 10, 1)
}

const cooler: Draw = (g) => {
  box(g, '#cfeeff', 4, 4, 8, 10)
  r(g, '#eaf8ff', 5, 5, 2, 6)
  box(g, '#f7f3fb', 2, 14, 12, 18)
  disc(g, '#8ec5ff', 6, 20, 1); disc(g, '#ff8fb5', 10, 20, 1)
  box(g, '#d8cfe6', 3, 32, 10, 8)
}

const bin: Draw = (g) => {
  box(g, '#c9bfdc', 3, 10, 10, 4)
  box(g, '#e4dcf0', 4, 13, 8, 13)
  r(g, '#c9bfdc', 6, 15, 1, 9); r(g, '#c9bfdc', 9, 15, 1, 9)
}

const plantSmall: Draw = (g) => {
  g.fillStyle = '#7ccf8f'
  for (const [x, y, w, h] of [[7, 2, 2, 10], [3, 5, 4, 3], [9, 4, 4, 3], [2, 9, 5, 2], [9, 8, 5, 2]] as const) g.fillRect(x, y, w, h)
  r(g, '#ffb3cc', 7, 1, 2, 2)
  box(g, '#f6b8c8', 4, 12, 8, 8)
}

const plantBig = (flower: string): Draw => (g) => {
  g.fillStyle = '#5fbf7a'
  for (const [x, y, w, h] of [[7, 1, 2, 11], [2, 3, 5, 3], [9, 2, 5, 3], [1, 7, 6, 2], [9, 6, 6, 2], [4, 10, 8, 2]] as const) g.fillRect(x, y, w, h)
  for (const [x, y] of [[3, 2], [12, 1], [1, 6]] as const) r(g, flower, x, y, 2, 2)
  box(g, '#e9d3ff', 4, 11, 8, 5)
}

const tableTile: Draw = (g) => {
  r(g, '#c98f74', 0, 0, 16, 16)
  r(g, '#b97d63', 0, 5, 16, 1); r(g, '#b97d63', 0, 11, 16, 1); r(g, '#d9a58b', 0, 1, 16, 1)
}

const armchair = (facing: 'down' | 'up' | 'left'): Draw => (g) => {
  if (facing === 'left') { box(g, '#c9b3f0', 2, 2, 12, 12); box(g, '#b49ae6', 10, 1, 5, 14); return }
  box(g, '#c9b3f0', 2, 3, 12, 11)
  box(g, '#b49ae6', 2, facing === 'down' ? 1 : 11, 12, 4)
}

const legs: Draw = (g) => { for (const x of [3, 12]) r(g, INK, x, 0, 1, 3) }

const clock: Draw = (g) => {
  disc(g, '#fff7fa', 8, 9, 6)
  r(g, '#ff8fb5', 2, 3, 3, 3); r(g, '#ff8fb5', 11, 3, 3, 3)
  r(g, INK, 8, 5, 1, 5); r(g, INK, 8, 9, 3, 1)
}

const flipchart: Draw = (g) => {
  box(g, '#ffffff', 1, 2, 14, 13)
  r(g, '#ff8fb5', 3, 5, 8, 1); r(g, '#9b7bff', 3, 8, 10, 1); r(g, '#7fd3c1', 3, 11, 6, 1)
  for (const x of [3, 12]) r(g, INK, x, 15, 1, 12)
}

const mug = (c: string): Draw => (g) => { box(g, c, 5, 7, 6, 6); r(g, INK, 11, 8, 2, 1); r(g, INK, 12, 8, 1, 4); r(g, '#ffffff', 6, 8, 2, 1) }
const book: Draw = (g) => { box(g, '#9fe0c4', 4, 5, 8, 10); r(g, '#ffffff', 6, 7, 4, 1) }
const laptop: Draw = (g) => { box(g, '#e9e2f5', 2, 4, 12, 8); r(g, '#bfe9ff', 4, 5, 8, 5); box(g, '#d8cfe6', 1, 11, 14, 3) }
const coffeeMachine: Draw = (g) => { box(g, '#f2a6bd', 3, 2, 10, 13); r(g, '#3d3050', 5, 9, 6, 3); r(g, '#ffffff', 5, 4, 3, 2) }
const kettle: Draw = (g) => { box(g, '#bfe6d6', 4, 9, 8, 7); r(g, INK, 7, 7, 2, 2) }
const lowTable: Draw = (g) => { box(g, '#fff0e0', 1, 3, 14, 9); for (const x of [2, 12]) r(g, INK, x, 12, 1, 3) }

const vending: Draw = (g) => {
  box(g, '#c4f2dd', 0, 2, 48, 60)
  r(g, '#a3e3c6', 2, 4, 44, 4)
  box(g, '#fff6fb', 4, 10, 26, 34)
  const snacks = ['#ff8fb5', '#ffd36e', '#9b7bff', '#8ec5ff']
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) r(g, snacks[(row + i) % 4], 7 + i * 6, 13 + row * 10, 4, 6)
  box(g, '#e8f7ef', 33, 10, 11, 20)
  for (let y = 14; y < 26; y += 4) r(g, '#7fb8a3', 36, y, 5, 2)
  box(g, '#5b4d72', 6, 48, 36, 8)
}

const locker: Draw = (g) => {
  box(g, '#dcd6f2', 2, 0, 12, 46)
  r(g, INK, 2, 23, 12, 1)
  for (const y of [4, 8, 27, 31]) r(g, '#b9b0d9', 4, y, 8, 1)
}

const PIECES: Piece[] = [
  { cols: 2, rows: 2, gids: [[783, 784], [799, 800]], draw: floorWood },
  { cols: 2, rows: 2, gids: [[1698, 1699], [1714, 1715]], draw: rug },
  { cols: 3, rows: 2, gids: [[2, 3, 4], [18, 19, 20]], draw: desk },
  { cols: 2, rows: 2, gids: [[365, 366], [381, 382]], draw: monitor(false) },
  { cols: 2, rows: 2, gids: [[367, 368], [383, 384]], draw: monitor(true) },
  { cols: 1, rows: 2, gids: [[289], [305]], draw: chair },
  { cols: 2, rows: 2, gids: [[327, 328], [343, 344]], draw: window2 },
  { cols: 3, rows: 2, gids: [[38, 40, 39], [54, 56, 55]], draw: counter },
  { cols: 2, rows: 3, gids: [[191, 192], [207, 208], [223, 224]], draw: shelf },
  { cols: 1, rows: 3, gids: [[269], [285], [301]], draw: fridge },
  { cols: 1, rows: 3, gids: [[266], [282], [298]], draw: cooler },
  { cols: 1, rows: 2, gids: [[281], [297]], draw: bin },
  { cols: 1, rows: 2, gids: [[452], [468]], draw: plantSmall },
  { cols: 1, rows: 2, gids: [[451], [467]], draw: plantSmall },
  { cols: 1, rows: 2, gids: [[354], [370]], draw: (g) => { g.translate(0, 8); clock(g) } },
  { cols: 1, rows: 2, gids: [[395], [411]], draw: flipchart },
  { cols: 1, rows: 3, gids: [[2248], [2264], [2280]], draw: locker },
  { cols: 3, rows: 4, gids: [[1029, 1026, 1027], [1041, 1042, 1043], [1044, 1076, 1061], [1073, 1074, 1075]], draw: vending }
]

// ─── single tiles ────────────────────────────────────────────────────────────
const SINGLES: Record<number, Draw> = {
  161: tableTile, 162: tableTile, 177: tableTile, 178: tableTile, 193: tableTile, 194: tableTile, 229: tableTile,
  257: armchair('down'), 258: armchair('up'), 260: armchair('left'), 274: legs, 276: legs,
  470: plantBig('#ffb3cc'), 471: plantBig('#ffd36e'), 472: plantBig('#c9b3f0'),
  349: book, 330: mug('#ffd36e'), 431: mug('#ffd36e'), 432: laptop, 329: coffeeMachine, 313: kettle, 1650: lowTable
}

// ─── walls: soft lavender with a white cap and an ink edge ───────────────────
const CAP = '#fbf7ff', FACE = '#e9e0f7', WAINSCOT = '#f6d6e2'
const wall = (edges: { t?: boolean; b?: boolean; l?: boolean; rr?: boolean }, fill = CAP): Draw => (g) => {
  r(g, fill, 0, 0, T, T)
  if (edges.t) r(g, INK, 0, 0, T, 2)
  if (edges.b) r(g, INK, 0, T - 2, T, 2)
  if (edges.l) r(g, INK, 0, 0, 2, T)
  if (edges.rr) r(g, INK, T - 2, 0, 2, T)
}
const pillar = (top: boolean): Draw => (g) => {
  r(g, CAP, 4, 0, 8, T); r(g, INK, 3, 0, 1, T); r(g, INK, 12, 0, 1, T)
  if (top) r(g, INK, 3, 0, 10, 1)
}
Object.assign(SINGLES, {
  514: wall({ t: true, l: true }), 517: wall({ t: true, rr: true }),
  522: wall({ t: true, b: true }),
  530: wall({ l: true }), 533: wall({ rr: true }),
  578: wall({ b: true, l: true }), 579: wall({ t: true, b: true }), 581: wall({ b: true, rr: true }),
  554: (g: Ctx) => { r(g, FACE, 0, 0, T, T); for (let x = 2; x < T; x += 5) r(g, '#ddd2ef', x, 0, 1, T) },
  570: (g: Ctx) => { r(g, WAINSCOT, 0, 0, T, T); r(g, '#ffffff', 0, 0, T, 2); r(g, '#e7b9c9', 0, T - 2, T, 2) },
  611: pillar(true), 643: pillar(false)
} satisfies Record<number, Draw>)

function sheetOf(gid: number) {
  for (let i = SHEETS.length - 1; i >= 0; i--) if (gid >= SHEETS[i].firstgid) return i
  return 0
}

/** Every gid this art covers (the map must not use any other). */
export function coveredGids(): number[] {
  return [...PIECES.flatMap((p) => p.gids.flat()), ...Object.keys(SINGLES).map(Number)]
}

/** Paint the three tile sheets; returns them as data URLs in SHEETS order. */
export function animeTilesetUrls(): string[] {
  const canvases = SHEETS.map((s) => Object.assign(document.createElement('canvas'), { width: s.width, height: s.height }))
  const put = (gid: number, from: CanvasImageSource, sx: number, sy: number) => {
    const i = sheetOf(gid), local = gid - SHEETS[i].firstgid, cols = SHEETS[i].width / T
    canvases[i].getContext('2d')!.drawImage(from, sx, sy, T, T, (local % cols) * T, Math.floor(local / cols) * T, T, T)
  }
  for (const p of PIECES) {
    const c = Object.assign(document.createElement('canvas'), { width: p.cols * T, height: p.rows * T })
    p.draw(c.getContext('2d')!)
    p.gids.forEach((row, y) => row.forEach((gid, x) => put(gid, c, x * T, y * T)))
  }
  for (const [gid, draw] of Object.entries(SINGLES)) {
    const c = Object.assign(document.createElement('canvas'), { width: T, height: T })
    draw(c.getContext('2d')!)
    put(Number(gid), c, 0, 0)
  }
  return canvases.map((c) => c.toDataURL('image/png'))
}
