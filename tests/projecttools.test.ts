import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eslintFile, prettierFormat, projectBin } from '../src/main/projecttools'

const project = () => mkdtempSync(join(tmpdir(), 'ventriee-tools-'))
const fakePackage = (root: string, name: string, script: string) => {
  mkdirSync(join(root, 'node_modules', name, 'bin'), { recursive: true })
  writeFileSync(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, bin: { [name]: 'bin/cli.js' } }))
  writeFileSync(join(root, 'node_modules', name, 'bin', 'cli.js'), script)
}

describe("the project's own tools", { timeout: 30_000 }, () => {
  it('finds only tools installed in the project', () => {
    const root = project()
    expect(projectBin(root, 'prettier')).toBeNull()
    fakePackage(root, 'prettier', '')
    expect(projectBin(root, 'prettier')).toMatch(/cli\.js$/)
  })

  it('formats through the project Prettier with the file path, and reports its errors', async () => {
    const root = project()
    expect(await prettierFormat(root, 'a.ts', 'x')).toBeNull()
    fakePackage(root, 'prettier', "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{if(s.includes('bad')){console.error('SyntaxError: nope');process.exit(2)}process.stdout.write(process.argv.slice(2).join(' ')+'|'+s.toUpperCase())})")
    expect(await prettierFormat(root, 'src/a.ts', 'const a=1')).toBe('--stdin-filepath src/a.ts|CONST A=1')
    await expect(prettierFormat(root, 'src/a.ts', 'bad')).rejects.toThrow('SyntaxError: nope')
    await expect(prettierFormat(root, '../x.ts', 'a')).rejects.toThrow()
  })

  it('turns an ESLint JSON report into editor findings and ignores configuration failures', async () => {
    const root = project()
    expect(await eslintFile(root, 'a.js', 'x')).toEqual([])
    fakePackage(root, 'eslint', "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{if(s.includes('noconfig'))process.exit(2);console.log(JSON.stringify([{messages:[{line:2,column:3,endLine:2,endColumn:8,severity:2,message:'x is not defined',ruleId:'no-undef'},{line:4,column:1,severity:1,message:'unused',ruleId:null}]}]));process.exit(1)})")
    expect(await eslintFile(root, 'a.js', 'code')).toEqual([
      { line: 2, column: 3, endLine: 2, endColumn: 8, severity: 'error', message: 'x is not defined (no-undef)' },
      { line: 4, column: 1, endLine: 4, endColumn: 2, severity: 'warning', message: 'unused' }])
    expect(await eslintFile(root, 'a.js', 'noconfig')).toEqual([])
  })
})
