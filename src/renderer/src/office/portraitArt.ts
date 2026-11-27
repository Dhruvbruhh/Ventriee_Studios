// Procedural anime-style characters for the office floor and the roster.
//
// Original characters, drawn from recipes: skin → clothing → face → hair →
// accessories on an 18×28 bust (portrait) or an 18×32 standing sprite. No image
// files and no third-party art.

import type { OfficeCharacterName } from './cast';

export const PORTRAIT_W = 18;
export const PORTRAIT_H = 28;
// In-scene walking sprite: same width + upper body as the portrait, taller to add legs.
export const SCENE_W = 18;
export const SCENE_H = 32;
const OUTLINE: RGB = [38, 34, 46];
const HX0 = 4, HX1 = 13; // head skin columns

type RGB = [number, number, number];
type Buf = Uint8ClampedArray;

// Current canvas dims — set per compose() so the same drawing primitives serve
// both the 18×28 portrait and the 18×32 scene sprite. (Rendering is synchronous.)
let CUR_W = PORTRAIT_W, CUR_H = PORTRAIT_H;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function shades(rgb: RGB, dl = 1.22, dd = 0.68): [RGB, RGB, RGB] {
  return [
    [clamp(rgb[0] * dl), clamp(rgb[1] * dl), clamp(rgb[2] * dl)],
    [rgb[0], rgb[1], rgb[2]],
    [clamp(rgb[0] * dd), clamp(rgb[1] * dd), clamp(rgb[2] * dd)],
  ];
}

function set(buf: Buf, x: number, y: number, c: RGB, a = 255): void {
  if (x < 0 || x >= CUR_W || y < 0 || y >= CUR_H) return;
  const i = (y * CUR_W + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = a;
}
function alphaAt(buf: Buf, x: number, y: number): number {
  if (x < 0 || x >= CUR_W || y < 0 || y >= CUR_H) return 0;
  return buf[(y * CUR_W + x) * 4 + 3];
}
function rgbAt(buf: Buf, x: number, y: number): RGB {
  const i = (y * CUR_W + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function eq(a: RGB, b: RGB): boolean { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
function rect(buf: Buf, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(buf, x, y, c);
}

// ─── palettes ────────────────────────────────────────────────────────────────
interface SkinPal { hi: RGB; base: RGB; sh: RGB; line: RGB; }
const SKIN: Record<string, SkinPal> = {
  light: { hi: [255, 221, 189], base: [247, 201, 170], sh: [212, 158, 126], line: [168, 112, 82] },
  tan:   { hi: [232, 182, 136], base: [214, 162, 116], sh: [176, 126, 86],  line: [138, 92, 60] },
  brown: { hi: [180, 130, 94],  base: [158, 112, 78],  sh: [124, 86, 58],   line: [90, 60, 40] },
  dark:  { hi: [142, 98, 70],   base: [120, 80, 56],   sh: [94, 62, 42],    line: [64, 42, 28] },
};

// ─── head + face ─────────────────────────────────────────────────────────────
function drawHead(buf: Buf, skin: string): void {
  const s = SKIN[skin];
  for (let y = 4; y <= 16; y++) {
    for (let x = HX0; x <= HX1; x++) {
      if (((x === HX0 || x === HX1) && (y === 4 || y === 5 || y === 16)) || ((x === 5 || x === 12) && y === 4)) continue;
      set(buf, x, y, s.base);
    }
  }
  for (let y = 6; y < 12; y++) set(buf, 5, y, s.hi);
  set(buf, 6, 5, s.hi); set(buf, 7, 5, s.hi);
  for (let y = 6; y < 15; y++) set(buf, 12, y, s.sh);
  for (const x of [7, 8, 9, 10, 11]) set(buf, x, 16, s.sh);
  for (const ex of [HX0 - 1, HX1 + 1]) { set(buf, ex, 9, s.base); set(buf, ex, 10, s.base); set(buf, ex, 11, s.sh); }
  rect(buf, 7, 17, 10, 18, s.sh); rect(buf, 7, 17, 9, 17, s.base);
}

type Brow = 'flat' | 'angry' | 'raised' | 'soft';
type Mouth = 'neutral' | 'smile' | 'frown' | 'grin';
function drawFace(buf: Buf, skin: string, brow: Brow, mouth: Mouth, blush: boolean, lashes = false): void {
  const s = SKIN[skin];
  const white: RGB = [250, 248, 244], pup: RGB = [46, 38, 42];
  for (const [a, b, p] of [[5, 6, 6], [10, 11, 10]] as const) {
    set(buf, a, 9, white); set(buf, b, 9, white); set(buf, p, 9, pup);
  }
  // Feminine eyes: a dark upper lash line + an outer flick, and a bright glint
  // in each pupil so they read as bigger, rounder, more expressive.
  if (lashes) {
    const lash: RGB = [54, 40, 48], glint: RGB = [252, 250, 248];
    for (const x of [5, 6, 10, 11]) set(buf, x, 8, lash);
    set(buf, 4, 8, lash); set(buf, 12, 8, lash);
    set(buf, 5, 9, glint); set(buf, 10, 9, glint);
  }
  if (brow === 'flat') for (const x of [5, 6, 10, 11]) set(buf, x, 7, s.line);
  else if (brow === 'angry') { set(buf, 5, 8, s.line); set(buf, 6, 7, s.line); set(buf, 10, 7, s.line); set(buf, 11, 8, s.line); }
  else if (brow === 'raised') for (const x of [5, 6, 10, 11]) set(buf, x, 6, s.line);
  else if (brow === 'soft') { for (const x of [5, 11]) set(buf, x, 7, s.line); for (const x of [6, 10]) set(buf, x, 7, s.sh); }
  set(buf, 8, 11, s.sh); set(buf, 8, 12, s.sh); set(buf, 7, 12, s.sh);
  const mc: RGB = [158, 86, 80];
  const mouths: Record<Mouth, [number, number][]> = {
    neutral: [[7, 14], [8, 14], [9, 14], [10, 14]],
    smile: [[7, 14], [8, 14], [9, 14], [10, 14], [6, 13], [11, 13]],
    frown: [[7, 15], [8, 15], [9, 15], [10, 15], [6, 14], [11, 14]],
    grin: [[7, 14], [8, 14], [9, 14], [10, 14], [7, 13], [8, 13], [9, 13], [10, 13], [6, 13], [11, 13]],
  };
  for (const [x, y] of mouths[mouth]) set(buf, x, y, mc);
  if (blush) for (const x of [5, 12]) set(buf, x, 12, [235, 150, 140], 140);
}

/** Big anime eyes: lash line, a tall coloured iris with a glint, and soft blush. */
function drawAnimeEyes(buf: Buf, skin: string, iris: RGB): void {
  const s = SKIN[skin];
  const [hi, base, sh] = shades(iris, 1.35, 0.6);
  const lash: RGB = [46, 34, 52], glint: RGB = [255, 255, 255];
  // clear the plain face below the bangs, then draw tall 2×3 irises under a winged lash line
  for (let x = 5; x <= 12; x++) for (let y = 8; y <= 15; y++) set(buf, x, y, s.base);
  for (const [a, b] of [[4, 7], [10, 13]] as const) for (let x = a; x <= b; x++) set(buf, x, 8, lash);
  set(buf, 4, 9, lash); set(buf, 13, 9, lash);
  for (const x0 of [5, 10]) {
    set(buf, x0, 9, glint); set(buf, x0 + 1, 9, base);
    set(buf, x0, 10, base); set(buf, x0 + 1, 10, sh);
    set(buf, x0, 11, hi); set(buf, x0 + 1, 11, base);
  }
  set(buf, 9, 12, s.sh); // a single-pixel nose
  for (const x of [4, 13]) set(buf, x, 12, [240, 150, 160], 150);
  for (const x of [5, 12]) set(buf, x, 12, [240, 150, 160], 110);
}

/** Small anime mouths, drawn after the eyes clear the lower face. */
function drawAnimeMouth(buf: Buf, mouth: Mouth): void {
  const lip: RGB = [196, 92, 104], inner: RGB = [150, 52, 70], tongue: RGB = [240, 130, 140];
  if (mouth === 'grin') { set(buf, 8, 14, inner); set(buf, 9, 14, inner); set(buf, 8, 15, tongue); set(buf, 9, 15, tongue); return; }
  if (mouth === 'smile') { set(buf, 7, 13, lip); set(buf, 8, 14, lip); set(buf, 9, 14, lip); set(buf, 10, 13, lip); return; }
  if (mouth === 'frown') { set(buf, 8, 14, lip); set(buf, 9, 14, lip); set(buf, 7, 15, lip); set(buf, 10, 15, lip); return; }
  set(buf, 8, 14, lip); set(buf, 9, 14, lip);
}

// ─── moods ───────────────────────────────────────────────────────────────────
/** The eight expressions each character has, as in an anime expression sheet. */
export const MOODS = ['smile', 'angry', 'cry', 'blush', 'surprised', 'laugh', 'tired', 'wink'] as const;
export type Mood = (typeof MOODS)[number];

const LASH: RGB = [46, 34, 52];
/** A closed, happy eye: an upturned arc (^). */
function closedEye(buf: Buf, x0: number): void {
  set(buf, x0 - 1, 10, LASH); set(buf, x0, 9, LASH); set(buf, x0 + 1, 9, LASH); set(buf, x0 + 2, 10, LASH);
}

/** Repaint the eyes and mouth for a mood, over the character's own anime face. */
function drawMood(buf: Buf, skin: string, iris: RGB, mood: Mood): void {
  const s = SKIN[skin];
  const clearEye = (x0: number) => { for (let x = x0 - 1; x <= x0 + 2; x++) for (let y = 8; y <= 11; y++) set(buf, x, y, s.base); };
  const clearMouth = () => { for (let x = 6; x <= 11; x++) for (let y = 13; y <= 15; y++) set(buf, x, y, s.base); };
  const lip: RGB = [196, 92, 104], inner: RGB = [150, 52, 70], tongue: RGB = [240, 130, 140];
  const tear: RGB = [150, 210, 255], cheek: RGB = [240, 130, 150];
  const [, base] = shades(iris, 1.35, 0.6);
  switch (mood) {
    case 'smile':
      clearMouth(); set(buf, 7, 13, lip); set(buf, 8, 14, lip); set(buf, 9, 14, lip); set(buf, 10, 13, lip);
      return;
    case 'angry':
      // brows pulled down toward the nose, a pout, and an anger mark
      for (const x0 of [5, 10]) { set(buf, x0, 8, s.base); set(buf, x0 + 1, 8, s.base); }
      set(buf, 5, 7, LASH); set(buf, 6, 8, LASH); set(buf, 7, 8, LASH); set(buf, 12, 7, LASH); set(buf, 11, 8, LASH); set(buf, 10, 8, LASH);
      clearMouth(); set(buf, 8, 14, lip); set(buf, 9, 14, lip); set(buf, 7, 15, lip); set(buf, 10, 15, lip);
      for (const [x, y] of [[14, 3], [16, 3], [15, 4], [14, 5], [16, 5]] as const) set(buf, x, y, [230, 60, 70]);
      return;
    case 'cry':
      for (const x of [5, 6, 10, 11]) set(buf, x, 9, tear);
      for (const [x, y] of [[5, 12], [5, 13], [5, 14], [12, 12], [12, 13], [12, 14]] as const) set(buf, x, y, tear);
      clearMouth(); set(buf, 7, 15, lip); set(buf, 8, 14, lip); set(buf, 9, 14, lip); set(buf, 10, 15, lip);
      return;
    case 'blush':
      for (const x of [4, 5, 6, 11, 12, 13]) set(buf, x, 12, cheek, 220);
      for (const x of [5, 12]) set(buf, x, 11, cheek, 150);
      clearMouth(); set(buf, 8, 14, lip); set(buf, 9, 14, lip);
      return;
    case 'surprised':
      // white-ringed eyes with small irises, and an "o" mouth
      for (const x0 of [5, 10]) { clearEye(x0); set(buf, x0 - 1, 8, LASH); set(buf, x0, 8, LASH); set(buf, x0 + 1, 8, LASH); set(buf, x0 + 2, 8, LASH);
        for (const y of [9, 10, 11]) { set(buf, x0, y, [255, 255, 255]); set(buf, x0 + 1, y, [255, 255, 255]); }
        set(buf, x0, 10, base); set(buf, x0 + 1, 10, base); }
      clearMouth(); for (const [x, y] of [[8, 13], [9, 13], [8, 14], [9, 14]] as const) set(buf, x, y, inner);
      return;
    case 'laugh':
      clearEye(5); clearEye(10); closedEye(buf, 5); closedEye(buf, 10);
      clearMouth(); for (const x of [7, 8, 9, 10]) set(buf, x, 13, inner); set(buf, 8, 14, tongue); set(buf, 9, 14, tongue);
      for (const x of [4, 13]) set(buf, x, 12, cheek, 200);
      return;
    case 'tired':
      // heavy lids: the lash line drops a row and the glint goes
      for (const x0 of [5, 10]) { clearEye(x0); for (let x = x0 - 1; x <= x0 + 2; x++) set(buf, x, 9, LASH); set(buf, x0, 10, base); set(buf, x0 + 1, 10, base); }
      clearMouth(); set(buf, 8, 14, lip); set(buf, 9, 14, lip); set(buf, 10, 14, lip);
      set(buf, 14, 7, tear); set(buf, 14, 8, tear);
      return;
    case 'wink':
      clearEye(10); closedEye(buf, 10);
      clearMouth(); set(buf, 7, 13, lip); set(buf, 8, 14, lip); set(buf, 9, 14, lip); set(buf, 10, 13, lip);
      return;
  }
}

/** A bow on top of the head. */
function drawRibbon(buf: Buf, c: RGB): void {
  const [hi, base, sh] = shades(c);
  for (const [x, y] of [[11, 0], [12, 0], [11, 1], [12, 1], [15, 0], [16, 0], [15, 1], [16, 1]] as const) set(buf, x, y, base);
  set(buf, 13, 1, sh); set(buf, 14, 1, sh); set(buf, 13, 0, hi);
}

/** The single stray strand anime heroines are known for. */
function drawAhoge(buf: Buf, c: RGB): void {
  const [, base] = shades(c);
  set(buf, 8, 1, base); set(buf, 9, 0, base); set(buf, 10, 0, base);
}

// ─── hairstyles ──────────────────────────────────────────────────────────────
interface HairArgs { part?: 'L' | 'R'; recede?: number; length?: number; vol?: number; }
type HairFn = (buf: Buf, color: RGB, skinBase: RGB, a: HairArgs) => void;

const styleShort: HairFn = (buf, color, skinBase, a) => {
  const [hi, base, sh] = shades(color);
  const part = a.part ?? 'L', recede = a.recede ?? 0;
  rect(buf, HX0, 2, HX1, 4, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 3, base);
  rect(buf, HX0 - 1, 4, HX1 + 1, 5, base);
  for (let y = 6; y < 9; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  if (recede) {
    for (let y = 3; y < 6; y++) for (let x = 6; x < 12; x++) if (eq(rgbAt(buf, x, y), base)) set(buf, x, y, skinBase);
    set(buf, 8, 5, base); // widow's peak
  }
  const hx = part === 'L' ? 6 : 11;
  for (let y = 2; y < 6; y++) set(buf, hx, y, sh);
  for (let x = HX0; x < hx; x++) if (alphaAt(buf, x, 3)) set(buf, x, 3, hi);
  for (let x = HX0; x <= HX1; x++) if (alphaAt(buf, x, 2)) set(buf, x, 2, hi);
};

const styleFloppy: HairFn = (buf, color) => {
  const [hi, base] = shades(color);
  rect(buf, HX0, 2, HX1, 4, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 3, base);
  rect(buf, HX0 - 1, 4, HX1 + 1, 5, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  for (let x = 6; x <= 12; x++) set(buf, x, 6, base);
  set(buf, 9, 7, base); set(buf, 10, 7, base); set(buf, 11, 7, base);
  for (let y = 6; y < 9; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  for (let x = HX0; x <= HX1; x++) if (alphaAt(buf, x, 2)) set(buf, x, 2, hi);
  for (const x of [7, 8, 9]) set(buf, x, 6, hi);
};

const styleFrame: HairFn = (buf, color, skinBase, a) => {
  const [hi, base, sh] = shades(color);
  const length = a.length ?? 17, vol = a.vol ?? 1;
  rect(buf, HX0 - 1, 2, HX1 + 1, 5, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 3, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (let y = 6; y <= length; y++) {
    for (let dx = 0; dx < vol; dx++) { set(buf, HX0 - 1 - dx, y, base); set(buf, HX1 + 1 + dx, y, base); }
    set(buf, HX0, y, base); set(buf, HX1, y, base);
  }
  for (let x = HX0 - 1; x < HX0 + 1; x++) set(buf, x, length + 1, base);
  for (let x = HX1; x < HX1 + 2; x++) set(buf, x, length + 1, base);
  for (let y = 2; y < 6; y++) if (alphaAt(buf, HX1, y)) set(buf, HX1, y, sh);
  for (let x = HX0; x < 9; x++) if (alphaAt(buf, x, 2)) set(buf, x, 2, hi);
};

const styleBun: HairFn = (buf, color, skinBase) => {
  const [hi, base] = shades(color);
  rect(buf, HX0, 3, HX1, 5, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 4, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (let y = 6; y < 9; y++) { set(buf, HX0, y, base); set(buf, HX1, y, base); }
  rect(buf, 7, 1, 10, 2, base);
  for (let x = HX0; x <= HX1; x++) if (alphaAt(buf, x, 3)) set(buf, x, 3, hi);
};

const styleCurly: HairFn = (buf, color, skinBase) => {
  const [hi, base] = shades(color);
  const pts: [number, number][] = [[4, 3], [5, 2], [6, 3], [7, 2], [8, 3], [9, 2], [10, 3], [11, 2], [12, 3], [13, 3],
    [3, 4], [4, 4], [13, 4], [14, 4], [3, 5], [4, 5], [13, 5], [14, 5], [3, 6], [13, 6], [4, 6], [12, 6], [3, 7], [13, 7], [4, 7]];
  rect(buf, HX0, 3, HX1, 5, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 4, base);
  for (const [x, y] of pts) set(buf, x, y, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (const [x, y] of [[5, 2], [7, 2], [9, 2], [11, 2]] as const) set(buf, x, y, hi);
};

const styleMessy: HairFn = (buf, color, skinBase, a) => {
  const [hi, base] = shades(color);
  const length = a.length ?? 8;
  rect(buf, HX0 - 1, 2, HX1 + 1, 5, base);
  const spikes: [number, number][] = [[3, 2], [5, 1], [7, 2], [9, 1], [11, 2], [13, 1], [14, 2], [4, 2], [12, 2]];
  for (const [x, y] of spikes) set(buf, x, y, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (let y = 6; y <= length; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  for (const [x, y] of spikes) set(buf, x, y, hi);
};

const styleRecede: HairFn = (buf, color, skinBase) => {
  const [, base, sh] = shades(color);
  for (let y = 4; y < 10; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  for (let x = HX0; x <= HX1; x++) set(buf, x, 4, base);
  for (let x = HX0 + 1; x < HX1; x++) set(buf, x, 5, base);
  for (let y = 5; y < 9; y++) for (let x = 6; x < 12; x++) if (eq(rgbAt(buf, x, y), base)) set(buf, x, y, skinBase);
  for (let x = HX0; x <= HX1; x++) if (alphaAt(buf, x, 4)) set(buf, x, 4, sh);
};

const styleSpiky: HairFn = (buf, color, skinBase) => {
  const [hi, base] = shades(color);
  rect(buf, HX0, 3, HX1, 5, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 4, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  const spikes: [number, number][] = [[5, 2], [7, 1], [9, 2], [11, 1], [6, 2], [8, 2], [10, 2], [12, 2]];
  for (const [x, y] of spikes) set(buf, x, y, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (let y = 6; y < 8; y++) { set(buf, HX0, y, base); set(buf, HX1, y, base); }
  for (const [x, y] of spikes) set(buf, x, y, hi);
};

// Bald: a rounded skin crown (with a sheen) and only a low horseshoe fringe of
// hair around the temples / back of the head.
const styleBald: HairFn = (buf, color, skinBase, a) => {
  const [shi, sbase, ssh] = shades(skinBase, 1.1, 0.82);
  // rounded skin dome above the forehead
  for (let x = 6; x <= 11; x++) set(buf, x, 2, sbase);
  for (let x = 5; x <= 12; x++) set(buf, x, 3, sbase);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 4, sbase);
  // bald-head sheen + side falloff
  for (const x of [7, 8, 9]) set(buf, x, 2, shi);
  set(buf, 6, 3, shi); set(buf, 7, 3, shi);
  set(buf, 5, 3, ssh); set(buf, 12, 3, ssh); set(buf, HX1, 4, ssh);
  // low horseshoe hair fringe — sides only, leaving the crown bald.
  const [, base, sh] = shades(color);
  const top = a.recede ? 8 : 6; // recede:1 → only a thin fringe very low
  for (let y = top; y <= 10; y++) {
    set(buf, HX0 - 1, y, base); set(buf, HX0, y, base);
    set(buf, HX1, y, base); set(buf, HX1 + 1, y, base);
  }
  for (let y = top; y <= 10; y++) { set(buf, HX0 - 1, y, sh); set(buf, HX1 + 1, y, sh); }
};

/** Full bangs across the forehead with side locks: the base of the anime styles. */
function bangs(buf: Buf, base: RGB, hi: RGB, sh: RGB, sideTo: number): void {
  rect(buf, HX0 - 1, 2, HX1 + 1, 5, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 6, base);
  for (const x of [5, 7, 9, 11, 13]) set(buf, x, 7, base);
  for (let y = 6; y <= sideTo; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  for (const x of [6, 8, 10, 12]) set(buf, x, 6, sh);
  for (let x = HX0; x < 10; x++) set(buf, x, 3, hi);
  set(buf, 6, 2, hi); set(buf, 7, 2, hi);
}

const styleLong: HairFn = (buf, color, _skin, a) => {
  const [hi, base, sh] = shades(color);
  const length = a.length ?? 23;
  bangs(buf, base, hi, sh, length);
  for (let y = 8; y <= length; y++) { set(buf, HX0 - 2, y, base); set(buf, HX1 + 2, y, sh); }
  for (let y = 8; y <= length; y += 3) set(buf, HX0 - 1, y, hi);
};

const styleTwin: HairFn = (buf, color) => {
  const [hi, base, sh] = shades(color);
  bangs(buf, base, hi, sh, 12);
  // a tail tied high on each side, falling past the shoulders
  for (let y = 3; y <= 24; y++) {
    const sway = y > 14 ? 1 : 0;
    set(buf, 1 + sway, y, base); set(buf, 2 + sway, y, base);
    set(buf, 15 - sway, y, sh); set(buf, 16 - sway, y, sh);
  }
  for (const x of [2, 15]) { set(buf, x, 4, [255, 143, 181]); set(buf, x, 5, [255, 143, 181]); }
};

const stylePony: HairFn = (buf, color) => {
  const [hi, base, sh] = shades(color);
  bangs(buf, base, hi, sh, 10);
  // high ponytail sweeping out to one side
  for (let y = 2; y <= 20; y++) { set(buf, 15, y, base); set(buf, 16, y, y > 6 ? sh : base); }
  set(buf, 14, 3, [255, 211, 110]);
};

const styleBob: HairFn = (buf, color) => {
  const [hi, base, sh] = shades(color);
  bangs(buf, base, hi, sh, 14);
  for (const x of [HX0 - 1, HX0, HX1, HX1 + 1]) set(buf, x, 15, sh);
};

const styleHime: HairFn = (buf, color) => {
  const [hi, base, sh] = shades(color);
  bangs(buf, base, hi, sh, 24);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 7, base);  // straight-cut bangs
  set(buf, 8, 7, sh); set(buf, 9, 7, sh);
  for (let y = 11; y <= 24; y++) { set(buf, HX0 - 2, y, base); set(buf, HX1 + 2, y, sh); }
};

const HAIR_FNS = { styleShort, styleFloppy, styleFrame, styleBun, styleCurly, styleMessy, styleRecede, styleSpiky, styleBald, styleLong, styleTwin, stylePony, styleBob, styleHime };
type HairStyle = keyof typeof HAIR_FNS;

// ─── facial hair ─────────────────────────────────────────────────────────────
type Facial = 'mustache' | 'mustacheSm' | 'stubble' | 'goatee';
function drawFacial(buf: Buf, kind: Facial, color: RGB): void {
  const [, base, sh] = shades(color);
  if (kind === 'mustache') {
    for (const x of [6, 7, 8, 9, 10]) set(buf, x, 13, base);
    set(buf, 6, 12, base); set(buf, 10, 12, base);
  } else if (kind === 'mustacheSm') {
    for (const x of [7, 8, 9]) set(buf, x, 13, base);
  } else if (kind === 'stubble') {
    for (const [x, y] of [[5, 14], [6, 15], [7, 15], [8, 15], [9, 15], [10, 15], [11, 14], [12, 13], [4, 13], [5, 15], [10, 15]] as const)
      set(buf, x, y, sh, 150);
  } else if (kind === 'goatee') {
    for (const x of [8, 9]) set(buf, x, 15, base);
    set(buf, 8, 14, base); set(buf, 9, 14, base);
    for (const x of [7, 8, 9, 10]) set(buf, x, 13, base);
  }
}

// ─── glasses ─────────────────────────────────────────────────────────────────
// Clear prescription glasses (NOT sunglasses): a thin rim that frames each eye
// without covering it. The lens interior keeps the eye/skin already drawn, plus
// a small white glint so the lens reads as transparent glass.
/** Round frames sized for the tall anime eyes: rims beside and under each eye, a bridge and a glint. */
function drawAnimeGlasses(buf: Buf): void {
  const frame: RGB = [60, 54, 62], glint: RGB = [236, 240, 246];
  for (const [l, r] of [[4, 7], [9, 12]] as const) {
    for (let y = 9; y <= 11; y++) { set(buf, l, y, frame); set(buf, r, y, frame); }
    for (let x = l; x <= r; x++) set(buf, x, 12, frame);
    set(buf, r - 1, 9, glint);
  }
  set(buf, 8, 9, frame); set(buf, 3, 9, frame); set(buf, 13, 9, frame);
}

function drawGlasses(buf: Buf): void {
  const frame: RGB = [60, 54, 62];
  const glint: RGB = [236, 240, 246];
  // Left lens rim around the eye at (5-6, 9): top, bottom, outer + inner edge.
  for (const x of [5, 6]) { set(buf, x, 8, frame); set(buf, x, 10, frame); }
  set(buf, 4, 9, frame); set(buf, 7, 9, frame);
  set(buf, 4, 8, frame); set(buf, 7, 8, frame);
  // Right lens rim around the eye at (10-11, 9).
  for (const x of [10, 11]) { set(buf, x, 8, frame); set(buf, x, 10, frame); }
  set(buf, 9, 9, frame); set(buf, 12, 9, frame);
  set(buf, 9, 8, frame); set(buf, 12, 8, frame);
  // Bridge over the nose + temple arms out to the hair.
  set(buf, 8, 8, frame);
  set(buf, 3, 9, frame); set(buf, 13, 9, frame);
  // Glass glint on each rim's top-outer corner so the lens reads as clear glass.
  set(buf, 4, 8, glint); set(buf, 9, 8, glint);
}

// ─── clothing ────────────────────────────────────────────────────────────────
type Cloth = 'suit' | 'dressshirt' | 'polo' | 'blouse' | 'cardigan' | 'sweater';
function bodyShape(buf: Buf, col: RGB, heavy = false): void {
  const [, base, sh] = shades(col);
  const rows: [number, number, number][] = heavy
    ? [[19, 5, 12], [20, 3, 14], [21, 2, 15], [22, 1, 16], [23, 1, 16], [24, 0, 17], [25, 0, 17], [26, 0, 17], [27, 0, 17]]
    : [[19, 6, 11], [20, 4, 13], [21, 3, 14], [22, 2, 15], [23, 2, 15], [24, 1, 16], [25, 1, 16], [26, 1, 16], [27, 1, 16]];
  for (const [y, a, b] of rows) rect(buf, a, y, b, y, base);
  const [lo, hi] = heavy ? [1, 16] : [2, 15];
  for (let y = 22; y < 28; y++) { set(buf, lo, y, sh); set(buf, hi, y, sh); }
}
function drawClothing(buf: Buf, kind: Cloth, c1: RGB, c2: RGB | undefined, tie: RGB | undefined, skin: string, heavy = false): void {
  const [hi, base, sh] = shades(c1);
  bodyShape(buf, c1, heavy);
  if (kind === 'suit') {
    const white: RGB = [238, 238, 236];
    for (const [x, y] of [[8, 19], [9, 19], [7, 20], [8, 20], [9, 20], [10, 20], [8, 21], [9, 21]] as const) set(buf, x, y, white);
    for (const [x, y] of [[6, 20], [7, 21], [11, 20], [10, 21], [6, 21], [11, 21]] as const) set(buf, x, y, sh);
    if (tie) { for (let y = 20; y < 26; y++) { set(buf, 8, y, tie); set(buf, 9, y, tie); } set(buf, 8, 20, shades(tie)[0]); }
    else for (let y = 22; y < 26; y++) { set(buf, 8, y, white); set(buf, 9, y, white); }
  } else if (kind === 'dressshirt') {
    for (const [x, y] of [[6, 19], [7, 19], [10, 19], [11, 19], [7, 20], [10, 20]] as const) set(buf, x, y, sh);
    for (let y = 20; y < 27; y += 2) set(buf, 8, y, sh);
    if (tie) for (let y = 19; y < 26; y++) { set(buf, 8, y, tie); set(buf, 9, y, tie); }
  } else if (kind === 'polo') {
    for (const [x, y] of [[6, 19], [7, 19], [10, 19], [11, 19]] as const) set(buf, x, y, hi);
    set(buf, 8, 20, sh); set(buf, 8, 22, sh);
    const accent = c2 ? shades(c2)[1] : hi;
    for (const [x, y] of [[7, 20], [9, 20]] as const) set(buf, x, y, accent);
  } else if (kind === 'blouse') {
    const s = SKIN[skin];
    for (const [x, y] of [[7, 19], [8, 19], [9, 19], [10, 19], [8, 20], [9, 20]] as const) set(buf, x, y, s.sh);
    for (let x = 5; x < 13; x++) if (eq(rgbAt(buf, x, 20), base)) set(buf, x, 20, hi);
  } else if (kind === 'cardigan') {
    const inner: RGB = c2 ? shades(c2)[1] : [235, 233, 226];
    for (let y = 19; y < 27; y++) { set(buf, 8, y, inner); set(buf, 9, y, inner); }
    for (const [x, y] of [[6, 19], [7, 19], [10, 19], [11, 19]] as const) set(buf, x, y, sh);
  } else if (kind === 'sweater') {
    for (const [x, y] of [[6, 19], [7, 19], [8, 19], [9, 19], [10, 19], [11, 19]] as const) set(buf, x, y, sh);
  }
}
function collarNeck(buf: Buf, skin: string): void {
  rect(buf, 7, 18, 10, 19, SKIN[skin].sh);
}

// ─── scene body (full standing figure: torso + legs, front or back) ──────────
// Proportioned for standing (not the portrait bust): a narrower torso over real
// legs. Head (rows 2-16) sits above; this draws rows 18-31.
const SHOE: RGB = [44, 40, 48];

function drawSceneLegs(buf: Buf, pants: RGB, phase: number): void {
  const [, base, sh] = shades(pants);
  // two legs cols 5-7 / 10-12, gap at 8-9
  for (const [lx0, lx1] of [[5, 7], [10, 12]] as const) {
    rect(buf, lx0, 25, lx1, 30, base);
    for (let y = 25; y <= 30; y++) set(buf, lx1, y, sh); // inner shade
  }
  // feet — lift one foot per walk phase for a simple gait
  const leftLow = phase !== 1, rightLow = phase !== 2;
  rect(buf, 5, leftLow ? 31 : 30, 7, leftLow ? 31 : 30, SHOE);
  rect(buf, 10, rightLow ? 31 : 30, 12, rightLow ? 31 : 30, SHOE);
}

function drawSceneTorso(buf: Buf, r: Recipe, back: boolean): void {
  const [hi, base, sh] = shades(r.c1);
  // shoulders → torso, narrower than the portrait bust (wider + rounder if heavy)
  if (r.heavy) {
    rect(buf, 3, 18, 14, 18, base);
    rect(buf, 2, 19, 15, 19, base);
    rect(buf, 2, 20, 15, 24, base);
    for (let y = 20; y <= 24; y++) { set(buf, 2, y, sh); set(buf, 15, y, sh); set(buf, 14, y, sh); }
  } else {
    rect(buf, 4, 18, 13, 18, base);
    rect(buf, 3, 19, 14, 19, base);
    rect(buf, 4, 20, 13, 24, base);
    for (let y = 20; y <= 24; y++) { set(buf, 3, y, sh); set(buf, 14, y, sh); set(buf, 13, y, sh); } // arms / right shade
  }
  if (back) {
    // plain back with a collar line + center seam
    rect(buf, 6, 18, 11, 18, sh);
    for (let y = 19; y <= 24; y++) set(buf, 8, y, sh);
    return;
  }
  const skin = SKIN[r.skin];
  if (r.cloth === 'suit') {
    const white: RGB = [238, 238, 236];
    for (const [x, y] of [[8, 18], [9, 18], [7, 19], [8, 19], [9, 19], [10, 19], [8, 20], [9, 20]] as const) set(buf, x, y, white);
    for (const [x, y] of [[6, 19], [7, 20], [11, 19], [10, 20]] as const) set(buf, x, y, sh);
    if (r.tie) { for (let y = 19; y <= 24; y++) { set(buf, 8, y, r.tie); set(buf, 9, y, r.tie); } set(buf, 8, 19, shades(r.tie)[0]); }
  } else if (r.cloth === 'dressshirt') {
    for (const [x, y] of [[6, 18], [7, 18], [10, 18], [11, 18], [7, 19], [10, 19]] as const) set(buf, x, y, sh);
    if (r.tie) for (let y = 18; y <= 24; y++) { set(buf, 8, y, r.tie); set(buf, 9, y, r.tie); }
    else for (let y = 20; y <= 24; y += 2) set(buf, 8, y, sh);
  } else if (r.cloth === 'polo') {
    for (const [x, y] of [[6, 18], [7, 18], [10, 18], [11, 18]] as const) set(buf, x, y, hi);
    set(buf, 8, 19, sh); set(buf, 8, 21, sh);
  } else if (r.cloth === 'blouse') {
    for (const [x, y] of [[7, 18], [8, 18], [9, 18], [10, 18], [8, 19], [9, 19]] as const) set(buf, x, y, skin.sh);
    for (let x = 5; x < 13; x++) if (eq(rgbAt(buf, x, 19), base)) set(buf, x, 19, hi);
  } else if (r.cloth === 'cardigan') {
    const inner: RGB = r.c2 ? shades(r.c2)[1] : [235, 233, 226];
    for (let y = 18; y <= 24; y++) { set(buf, 8, y, inner); set(buf, 9, y, inner); }
    for (const [x, y] of [[6, 18], [7, 18], [10, 18], [11, 18]] as const) set(buf, x, y, sh);
  } else if (r.cloth === 'sweater') {
    for (const [x, y] of [[6, 18], [7, 18], [8, 18], [9, 18], [10, 18], [11, 18]] as const) set(buf, x, y, sh);
  }
}

/** Back of the head: a rounded hair-covered skull with crown sheen + nape, no face. */
function drawHeadBack(buf: Buf, r: Recipe): void {
  const s = SKIN[r.skin];
  if (r.hair === 'styleBald') { drawHeadBackBald(buf, r); return; }
  const [hi, base, sh] = shades(r.hairc);
  // rounded skull silhouette (narrow at crown + nape, full through the middle)
  const rows: [number, number, number][] = [
    [2, 6, 11], [3, 5, 12], [4, 4, 13], [5, 4, 13], [6, 4, 13], [7, 4, 13], [8, 4, 13],
    [9, 4, 13], [10, 4, 13], [11, 4, 13], [12, 4, 13], [13, 5, 12], [14, 6, 11],
  ];
  for (const [y, a, b] of rows) rect(buf, a, y, b, y, base);
  // long styles drape down the sides past the head
  const len = r.hair === 'styleFrame' ? (r.hairargs?.length ?? 17)
            : r.hair === 'styleMessy' ? (r.hairargs?.length ?? 9)
            : r.hair === 'styleLong' ? (r.hairargs?.length ?? 23)
            : r.hair === 'styleHime' ? 24 : r.hair === 'styleBob' ? 14 : 0;
  for (let y = 11; y <= len; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  // long hair covers the whole back, not just the sides
  if (len > 16) for (let y = 15; y <= len; y++) rect(buf, HX0, y, HX1, y, y % 3 ? base : sh);
  if (r.hair === 'stylePony') for (let y = 13; y <= 22; y++) { set(buf, 8, y, base); set(buf, 9, y, sh); }
  if (r.hair === 'styleTwin') for (let y = 3; y <= 24; y++) { set(buf, 2, y, base); set(buf, 3, y, base); set(buf, 14, y, sh); set(buf, 15, y, sh); }
  // roundness: darken the side edges and the nape
  for (let y = 4; y <= 12; y++) { set(buf, 4, y, sh); set(buf, 13, y, sh); }
  for (const [x, y] of [[5, 3], [12, 3], [5, 13], [12, 13], [6, 14], [11, 14]] as const) set(buf, x, y, sh);
  // crown sheen (rounded top catching the light) + subtle center part
  for (const [x, y] of [[7, 2], [8, 2], [9, 2], [10, 2], [7, 3], [8, 3], [9, 3]] as const) set(buf, x, y, hi);
  for (let y = 4; y <= 11; y++) set(buf, 9, y, hi);   // sheen down the crown
  for (let y = 4; y <= 12; y++) set(buf, 8, y, sh);   // part line
  // nape + neck (skin), unless long hair or a tail hides it
  if (len > 16 || r.hair === 'stylePony' || r.hair === 'styleTwin') return;
  rect(buf, 7, 14, 10, 14, sh);
  rect(buf, 7, 15, 10, 17, s.sh);
  rect(buf, 7, 15, 9, 15, s.base);
}

/** Back of a bald head: a skin skull with a sheen and a low hair fringe ring. */
function drawHeadBackBald(buf: Buf, r: Recipe): void {
  const s = SKIN[r.skin];
  const [shi, sbase, ssh] = shades(s.base, 1.1, 0.82);
  const rows: [number, number, number][] = [
    [2, 6, 11], [3, 5, 12], [4, 4, 13], [5, 4, 13], [6, 4, 13], [7, 4, 13], [8, 4, 13],
    [9, 4, 13], [10, 4, 13], [11, 4, 13], [12, 4, 13], [13, 5, 12], [14, 6, 11],
  ];
  for (const [y, a, b] of rows) rect(buf, a, y, b, y, sbase);
  for (let y = 4; y <= 12; y++) { set(buf, 4, y, ssh); set(buf, 13, y, ssh); }
  for (const [x, y] of [[7, 2], [8, 2], [9, 2], [8, 3], [9, 4], [9, 5]] as const) set(buf, x, y, shi);
  // low hair fringe ring around the back/sides
  const [, base, sh] = shades(r.hairc);
  for (let x = 4; x <= 13; x++) { set(buf, x, 11, base); set(buf, x, 12, base); }
  for (const x of [4, 13]) { set(buf, x, 11, sh); set(buf, x, 12, sh); }
  // nape + neck (skin)
  rect(buf, 7, 14, 10, 14, s.sh);
  rect(buf, 7, 15, 10, 17, s.sh);
  rect(buf, 7, 15, 9, 15, s.base);
}

/** Pleated skirt over tights, for the characters who wear one. */
function drawSkirt(buf: Buf, skirt: RGB, tights: RGB, phase: number): void {
  const [hi, base, sh] = shades(skirt);
  rect(buf, 4, 24, 13, 24, base); rect(buf, 3, 25, 14, 26, base); rect(buf, 3, 27, 14, 27, sh);
  for (const x of [5, 8, 11]) for (const y of [25, 26]) set(buf, x, y, hi);
  for (const [lx0, lx1] of [[6, 7], [10, 11]] as const) rect(buf, lx0, 28, lx1, 30, tights);
  const leftLow = phase !== 1, rightLow = phase !== 2;
  rect(buf, 5, leftLow ? 31 : 30, 7, leftLow ? 31 : 30, SHOE);
  rect(buf, 10, rightLow ? 31 : 30, 12, rightLow ? 31 : 30, SHOE);
}

function drawSceneBody(buf: Buf, r: Recipe, phase: number, back: boolean): void {
  drawSceneTorso(buf, r, back);
  if (r.skirt) drawSkirt(buf, r.skirt, r.tights ?? [61, 48, 80], phase);
  else drawSceneLegs(buf, defaultPants(r), phase);
}

// ─── outline pass ────────────────────────────────────────────────────────────
function outlinePass(buf: Buf): void {
  const pts: [number, number][] = [];
  for (let y = 0; y < CUR_H; y++) {
    for (let x = 0; x < CUR_W; x++) {
      if (alphaAt(buf, x, y) !== 0) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (alphaAt(buf, x + dx, y + dy) === 255) { pts.push([x, y]); break; }
      }
    }
  }
  for (const [x, y] of pts) set(buf, x, y, OUTLINE);
}

// ─── recipes ─────────────────────────────────────────────────────────────────
interface Recipe {
  skin: string; hairc: RGB; hair: HairStyle; hairargs?: HairArgs;
  cloth: Cloth; c1: RGB; c2?: RGB; tie?: RGB; pants?: RGB;
  brow?: Brow; mouth?: Mouth; blush?: boolean; facial?: Facial; glasses?: boolean;
  /** Bigger, lashed eyes for a more feminine, expressive face. */
  lashes?: boolean;
  /** Heavier build: chubby cheeks, a double chin, and a wider torso. */
  heavy?: boolean;
  /** Anime eyes in this iris colour. */
  eyes?: RGB;
  ribbon?: RGB; ahoge?: boolean; skirt?: RGB; tights?: RGB;
}

// Puff the lower face into round cheeks + a double chin so a character reads as
// heavier. Runs after drawHead (adds skin at the jaw) and is safe before the
// face features, which sit higher (eyes y9, mouth y14).
function drawHeavyFace(buf: Buf, skin: string): void {
  const s = SKIN[skin];
  // Chubby cheeks: bulge the jaw outward past the normal x4..13 head box.
  for (let y = 11; y <= 15; y++) { set(buf, HX0 - 1, y, s.base); set(buf, HX1 + 1, y, s.base); }
  set(buf, HX0 - 1, 15, s.sh); set(buf, HX1 + 1, 15, s.sh);
  // Fuller, rounder lower jaw.
  for (const x of [5, 6, 11, 12]) set(buf, x, 16, s.base);
  // Double chin: a second rounded roll under the jaw.
  rect(buf, 6, 17, 11, 18, s.base);
  for (const x of [6, 7, 8, 9, 10, 11]) set(buf, x, 18, s.sh);
  set(buf, 7, 17, s.sh); set(buf, 10, 17, s.sh); // crease shadow between chin + roll
}

const RECIPES: Record<OfficeCharacterName, Recipe> = {
  sakura:  { skin: 'light', hairc: [246, 160, 190], hair: 'styleLong',  eyes: [214, 84, 140],  cloth: 'suit',     c1: [70, 62, 92],    tie: [232, 86, 120], skirt: [70, 62, 92],  ribbon: [255, 255, 255], mouth: 'smile', brow: 'soft', ahoge: true },
  yuki:    { skin: 'light', hairc: [222, 226, 240], hair: 'styleHime',  eyes: [96, 150, 232],  cloth: 'cardigan', c1: [180, 200, 236], c2: [250, 250, 255], skirt: [92, 104, 150], mouth: 'neutral', brow: 'soft' },
  hana:    { skin: 'light', hairc: [250, 214, 120], hair: 'styleTwin',  eyes: [104, 176, 96],  cloth: 'blouse',   c1: [255, 236, 200], skirt: [232, 120, 120], ribbon: [255, 143, 181], mouth: 'grin', brow: 'raised' },
  rin:     { skin: 'light', hairc: [40, 36, 56],    hair: 'stylePony',  eyes: [200, 60, 72],   cloth: 'suit',     c1: [40, 40, 52],    tie: [200, 60, 72],  mouth: 'neutral', brow: 'angry' },
  mei:     { skin: 'tan',   hairc: [150, 110, 220], hair: 'styleBob',   eyes: [170, 120, 240], cloth: 'sweater',  c1: [255, 200, 220], skirt: [120, 96, 168], glasses: true, mouth: 'smile', brow: 'soft' },
  aoi:     { skin: 'light', hairc: [72, 120, 210],  hair: 'styleLong',  hairargs: { length: 20 }, eyes: [60, 110, 210], cloth: 'dressshirt', c1: [236, 242, 255], tie: [72, 120, 210], skirt: [52, 70, 120], mouth: 'smile', brow: 'flat' },
  kaede:   { skin: 'light', hairc: [212, 96, 52],   hair: 'stylePony',  eyes: [230, 140, 50],  cloth: 'polo',     c1: [255, 190, 120], c2: [230, 150, 80], mouth: 'grin', brow: 'raised', ahoge: true },
  nami:    { skin: 'brown', hairc: [120, 214, 196], hair: 'styleBob',   eyes: [60, 180, 160],  cloth: 'blouse',   c1: [200, 240, 230], skirt: [60, 140, 130], mouth: 'smile', brow: 'soft' },
  suzu:    { skin: 'light', hairc: [120, 78, 52],   hair: 'styleTwin',  eyes: [150, 100, 60],  cloth: 'cardigan', c1: [250, 210, 150], c2: [255, 250, 240], skirt: [150, 90, 70], ribbon: [255, 211, 110], mouth: 'smile', brow: 'soft' },
  akane:   { skin: 'light', hairc: [200, 40, 64],   hair: 'styleHime',  eyes: [240, 180, 60],  cloth: 'suit',     c1: [96, 36, 48],    tie: [255, 211, 110], skirt: [96, 36, 48], mouth: 'smile', brow: 'angry' },
  hikari:  { skin: 'light', hairc: [255, 236, 170], hair: 'styleLong',  eyes: [250, 170, 80],  cloth: 'blouse',   c1: [255, 255, 255], skirt: [140, 196, 255], ribbon: [140, 196, 255], mouth: 'grin', brow: 'raised' },
  tsubaki: { skin: 'dark',  hairc: [30, 26, 40],    hair: 'styleHime',  eyes: [220, 70, 110],  cloth: 'sweater',  c1: [140, 40, 70],   skirt: [40, 36, 52], mouth: 'neutral', brow: 'flat' },
  mio:     { skin: 'light', hairc: [62, 58, 110],   hair: 'styleLong',  eyes: [130, 130, 230], cloth: 'cardigan', c1: [90, 100, 160],  c2: [240, 240, 250], skirt: [70, 70, 110], glasses: true, mouth: 'neutral', brow: 'soft' },
  ran:     { skin: 'tan',   hairc: [255, 150, 70],  hair: 'styleBob',   eyes: [80, 200, 120],  cloth: 'polo',     c1: [120, 210, 160], c2: [80, 170, 120], mouth: 'grin', brow: 'raised', ahoge: true },
  koharu:  { skin: 'light', hairc: [255, 196, 214], hair: 'styleTwin',  eyes: [150, 110, 230], cloth: 'sweater',  c1: [200, 180, 250], skirt: [255, 190, 210], ribbon: [255, 255, 255], mouth: 'smile', brow: 'soft' },
};

/** The face/hair group (head → face → facial hair → hair → glasses), no clothing. */
function drawHeadGroup(buf: Buf, r: Recipe, mood?: Mood): void {
  const skinBase = SKIN[r.skin].base;
  drawHead(buf, r.skin);
  if (r.heavy) drawHeavyFace(buf, r.skin);
  drawFace(buf, r.skin, r.brow ?? 'flat', r.mouth ?? 'neutral', r.blush ?? false, r.lashes ?? false);
  if (r.eyes) { drawAnimeEyes(buf, r.skin, r.eyes); drawAnimeMouth(buf, r.mouth ?? 'neutral'); }
  if (r.facial) drawFacial(buf, r.facial, r.hairc);
  HAIR_FNS[r.hair](buf, r.hairc, skinBase, r.hairargs ?? {});
  // after the hair, so brows and marks sit on top of the bangs; before glasses, which sit on the face
  if (mood && r.eyes) drawMood(buf, r.skin, r.eyes, mood);
  if (r.glasses) { if (r.eyes) drawAnimeGlasses(buf); else drawGlasses(buf); }
  if (r.ribbon) drawRibbon(buf, r.ribbon);
  if (r.ahoge) drawAhoge(buf, r.hairc);
}

function defaultPants(r: Recipe): RGB {
  if (r.pants) return r.pants;
  return r.cloth === 'suit' ? shades(r.c1)[2] : [54, 56, 70];
}

/** Portrait bust: shoulders-height clothing + front head group. */
function compose(r: Recipe, mood?: Mood): Buf {
  CUR_W = PORTRAIT_W; CUR_H = PORTRAIT_H;
  const buf = new Uint8ClampedArray(PORTRAIT_W * PORTRAIT_H * 4);
  drawClothing(buf, r.cloth, r.c1, r.c2, r.tie, r.skin, r.heavy ?? false);
  collarNeck(buf, r.skin);
  drawHeadGroup(buf, r, mood);
  outlinePass(buf);
  return buf;
}

/** Full-body 18×32 scene sprite. `back=false` reuses the portrait's exact face. */
function composeScene(r: Recipe, phase: number, back: boolean, mood?: Mood): Buf {
  CUR_W = SCENE_W; CUR_H = SCENE_H;
  const buf = new Uint8ClampedArray(SCENE_W * SCENE_H * 4);
  drawSceneBody(buf, r, phase, back);
  if (back) drawHeadBack(buf, r);
  else drawHeadGroup(buf, r, mood);
  outlinePass(buf);
  return buf;
}

// ─── public render ───────────────────────────────────────────────────────────
const bufCache = new Map<string, Buf>();
const sceneCache = new Map<string, SceneFrames>();

function getBuf(name: OfficeCharacterName, mood?: Mood): Buf {
  const key = `${name}:${mood ?? ''}`;
  let buf = bufCache.get(key);
  if (!buf) {
    buf = compose(RECIPES[name] ?? RECIPES.sakura, mood);
    bufCache.set(key, buf);
  }
  return buf;
}

export interface SceneFrames { front: Buf[]; back: Buf[]; }

/** Walk-phase frames (stand, step-L, step-R) for the in-scene sprite, front + back; `mood` changes the face. */
export function sceneFrameBufs(name: OfficeCharacterName, mood?: Mood): SceneFrames {
  const key = `${name}:${mood ?? ''}`;
  let frames = sceneCache.get(key);
  if (!frames) {
    const r = RECIPES[name] ?? RECIPES.sakura;
    frames = {
      front: [composeScene(r, 0, false, mood), composeScene(r, 1, false, mood), composeScene(r, 2, false, mood)],
      back: [composeScene(r, 0, true), composeScene(r, 1, true), composeScene(r, 2, true)],
    };
    sceneCache.set(key, frames);
  }
  return frames;
}

/** Paint a character's procedural portrait onto `ctx`, nearest-neighbor at `scale`. */
export function paintPortrait(ctx: CanvasRenderingContext2D, name: OfficeCharacterName, scale = 2, mood?: Mood): void {
  const buf = getBuf(name, mood);
  // Stage at 1× on an offscreen canvas, then blit scaled with smoothing off.
  const stage = document.createElement('canvas');
  stage.width = PORTRAIT_W; stage.height = PORTRAIT_H;
  const sctx = stage.getContext('2d')!;
  const img = sctx.createImageData(PORTRAIT_W, PORTRAIT_H);
  img.data.set(buf);
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PORTRAIT_W * scale, PORTRAIT_H * scale);
  ctx.drawImage(stage, 0, 0, PORTRAIT_W, PORTRAIT_H, 0, 0, PORTRAIT_W * scale, PORTRAIT_H * scale);
}
