/** Technology-stack pick (W47): chosen in Simple mode before anything builds. */

export interface StackPick {
  frontend: string
  backend: string
  database: string
  styling: string
  tests: string
}

export interface StackPreset {
  id: string
  label: string
  /** One line on when to reach for this preset. */
  hint: string
  pick: StackPick
}

/** The three starting points offered in Simple mode; every field stays editable. */
export const STACK_PRESETS: StackPreset[] = [
  {
    id: 'next-full',
    label: 'Next.js app',
    hint: 'A modern web app with pages, API routes and a database.',
    pick: { frontend: 'Next.js (React, TypeScript)', backend: 'Next.js API routes', database: 'SQLite (better-sqlite3)', styling: 'Tailwind CSS', tests: 'Vitest' }
  },
  {
    id: 'vite-express',
    label: 'React + API server',
    hint: 'A separate frontend and backend API.',
    pick: { frontend: 'React + Vite (TypeScript)', backend: 'Node.js + Express', database: 'SQLite (better-sqlite3)', styling: 'Plain CSS', tests: 'Vitest' }
  },
  {
    id: 'static-site',
    label: 'Simple website',
    hint: 'Plain pages that open anywhere, no server needed.',
    pick: { frontend: 'Static HTML + a little JavaScript', backend: 'None', database: 'None', styling: 'Plain CSS', tests: 'Manual check' }
  }
]

const CAP = 120

/** Fill missing fields from the first preset and clamp lengths; never throws. */
export function normalizeStack(input: Partial<StackPick> | null | undefined): StackPick {
  const base = STACK_PRESETS[0].pick
  const field = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, CAP) : fallback)
  return {
    frontend: field(input?.frontend, base.frontend),
    backend: field(input?.backend, base.backend),
    database: field(input?.database, base.database),
    styling: field(input?.styling, base.styling),
    tests: field(input?.tests, base.tests)
  }
}

/** The owner's pick as one clarification answer, ready to fold into the brief. */
export function stackToAnswer(pick: StackPick): string {
  const s = normalizeStack(pick)
  return `Frontend: ${s.frontend}; Backend: ${s.backend}; Database: ${s.database}; Styling: ${s.styling}; Tests: ${s.tests}`
}
