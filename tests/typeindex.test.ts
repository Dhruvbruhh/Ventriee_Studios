import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileService } from '../src/main/files'
import { parseJsonc, projectTypes } from '../src/main/typeindex'

describe('project type index', () => {
  it('collects sources, declared packages with their @types, and tsconfig options', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-types-'))
    const put = (path: string, text: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text) }
    put('package.json', JSON.stringify({ dependencies: { lodash: '1', '@scope/kit': '1' }, devDependencies: { undeclared: '0' } }))
    put('tsconfig.json', '{\n  // comment\n  "compilerOptions": { "jsx": "react-jsx", "url": "http://x", /* c */ "strict": true, },\n}')
    put('src/a.ts', 'export const a = 1')
    put('src/view.tsx', 'export const V = () => null')
    put('README.md', '# not code')
    put('node_modules/lodash/package.json', '{"name":"lodash"}')
    put('node_modules/lodash/index.js', 'module.exports = {}')
    put('node_modules/@types/lodash/package.json', '{"name":"@types/lodash","types":"index.d.ts"}')
    put('node_modules/@types/lodash/index.d.ts', 'export declare function chunk(): void')
    put('node_modules/@scope/kit/package.json', '{"types":"dist/index.d.ts"}')
    put('node_modules/@scope/kit/dist/index.d.ts', 'export declare const kit: 1')
    put('node_modules/@scope/kit/node_modules/inner/x.d.ts', 'nested')
    put('node_modules/notlisted/index.d.ts', 'skip')
    const types = projectTypes(root, new FileService())
    expect(types.sources.map((s) => s.path).sort()).toEqual(['src/a.ts', 'src/view.tsx'])
    expect(types.libs.map((l) => l.path).sort()).toEqual([
      'node_modules/@scope/kit/dist/index.d.ts', 'node_modules/@scope/kit/package.json',
      'node_modules/@types/lodash/index.d.ts', 'node_modules/@types/lodash/package.json', 'node_modules/lodash/package.json'])
    expect(types.compilerOptions).toEqual({ jsx: 'react-jsx', url: 'http://x', strict: true })
    expect(types.truncated).toBe(false)
  })
  it('parses tsconfig comments without breaking strings that contain slashes', () => {
    expect(parseJsonc('{"a": "//not a comment", /* x */ "b": [1,],}')).toEqual({ a: '//not a comment', b: [1] })
  })
})
