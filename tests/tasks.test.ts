import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listTasks } from '../src/main/tasks'
import { matchProblems } from '../src/shared/problems'

describe('tasks', () => {
  it('collects tasks from tasks.json, package.json, Makefile and Go', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-tasks-'))
    mkdirSync(join(root, '.vscode'))
    writeFileSync(join(root, '.vscode', 'tasks.json'), '{ // tasks\n "tasks": [{ "label": "Build", "type": "shell", "command": "make", "args": ["all", "a b"] }, { "label": "Lint", "type": "npm", "script": "lint" }] }')
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', test: 'vitest' } }))
    writeFileSync(join(root, 'pnpm-lock.yaml'), '')
    writeFileSync(join(root, 'Makefile'), '.PHONY: all\nall: build\nbuild:\n\tcc x.c\nVAR := 1\n')
    writeFileSync(join(root, 'go.mod'), 'module x')
    const tasks = listTasks(root)
    expect(tasks.slice(0, 4).map((t) => [t.label, t.command])).toEqual([['Build', 'make all "a b"'], ['Lint', 'npm run lint'], ['dev', 'pnpm dev'], ['test', 'pnpm test']])
    expect(tasks.filter((t) => t.source === 'Makefile').map((t) => t.label)).toEqual(['make all', 'make build'])
    expect(tasks.some((t) => t.command === 'go build ./...')).toBe(true)
  })

  it('reads problems from tsc, ESLint, gcc, Rust and Go output, inside the project only', () => {
    const toProject = (p: string) => (p.startsWith('/outside') ? null : p.replace(/^\/proj\//, ''))
    const output = [
      '\x1b[96msrc/a.ts\x1b[0m(3,5): error TS2322: Type string is not assignable.',
      'src/b.ts:7:2 - error TS1005: ; expected.',
      '/proj/src/main.c:10:4: warning: unused variable x',
      '/outside/lib.c:1:1: error: nope',
      'error[E0308]: mismatched types',
      '  --> src/main.rs:4:9',
      'pkg/x.go:12:3: undefined: foo',
      '/proj/web/app.js',
      '  2:7  error  no-undef  \'x\' is not defined  no-undef',
      '  5:1  warning  Unexpected console statement  no-console',
      ''
    ].join('\n')
    expect(matchProblems(output, toProject)).toEqual([
      { path: 'src/a.ts', line: 3, column: 5, severity: 'error', message: 'TS2322: Type string is not assignable.' },
      { path: 'src/b.ts', line: 7, column: 2, severity: 'error', message: 'TS1005: ; expected.' },
      { path: 'src/main.c', line: 10, column: 4, severity: 'warning', message: 'unused variable x' },
      { path: 'src/main.rs', line: 4, column: 9, severity: 'error', message: 'mismatched types' },
      { path: 'pkg/x.go', line: 12, column: 3, severity: 'error', message: 'undefined: foo' },
      { path: 'web/app.js', line: 2, column: 7, severity: 'error', message: 'no-undef  \'x\' is not defined (no-undef)' },
      { path: 'web/app.js', line: 5, column: 1, severity: 'warning', message: 'Unexpected console statement (no-console)' }
    ])
  })
})
