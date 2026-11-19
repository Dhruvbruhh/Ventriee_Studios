import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileService } from '../src/main/files'
import { TestService, detectRunners, parseCargoText, parseGoJson, parseJestJson, parseJunit } from '../src/main/testrunner'
import { testAt } from '../src/renderer/src/editor/TestsPanel'
import { baseCatalog } from '../src/shared/catalog'
import type { TestEvent } from '../src/shared/workspace'

const hasPytest = (() => { try { execFileSync('python', ['-m', 'pytest', '--version'], { stdio: 'ignore' }); return true } catch { return false } })()

describe('test runners', () => {
  it('detects runners from project files and package.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-detect-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { vitest: '1' } }))
    writeFileSync(join(root, 'go.mod'), 'module x')
    expect(detectRunners(root, baseCatalog).map((r) => r.id)).toEqual(['vitest', 'go'])
  })

  it('parses JUnit, Jest, go test and cargo test reports', () => {
    expect(parseJunit('<testsuite><testcase classname="tests.test_m" name="test_ok" time="0.01" file="tests/test_m.py" line="3"/><testcase classname="a.test.ts" name="adds &amp; more"><failure message="expected 1">AssertionError: x &lt; y</failure></testcase><testcase name="s"><skipped/></testcase></testsuite>')).toEqual([
      { name: 'test_ok', suite: 'tests.test_m', file: 'tests/test_m.py', line: 3, status: 'passed', duration: 0.01, message: undefined },
      { name: 'adds & more', suite: 'a.test.ts', file: undefined, line: undefined, status: 'failed', duration: undefined, message: 'expected 1\nAssertionError: x < y' },
      { name: 's', suite: '', file: undefined, line: undefined, status: 'skipped', duration: undefined, message: undefined }])
    expect(parseJestJson(JSON.stringify({ testResults: [{ name: join('/p', 'src', 'a.test.js'), assertionResults: [{ title: 'works', ancestorTitles: ['math'], status: 'failed', failureMessages: ['boom'], location: { line: 4 } }] }] }), '/p'))
      .toEqual([{ name: 'works', suite: 'math', file: 'src/a.test.js', line: 4, status: 'failed', duration: undefined, message: 'boom' }])
    expect(parseGoJson(['{"Action":"run","Package":"m","Test":"TestA"}', '{"Action":"output","Package":"m","Test":"TestA","Output":"bad\\n"}', '{"Action":"fail","Package":"m","Test":"TestA","Elapsed":0.1}', '{"Action":"pass","Package":"m","Test":"TestB"}'].join('\n')))
      .toEqual([{ name: 'TestA', suite: 'm', status: 'failed', duration: 0.1, message: 'bad\n' }, { name: 'TestB', suite: 'm', status: 'passed', duration: undefined, message: undefined }])
    expect(parseCargoText('test tests::adds ... ok\ntest tests::fails ... FAILED\n\nfailures:\n\n---- tests::fails stdout ----\npanicked at 1 != 2\n\nfailures:\n    tests::fails\n\ntest result: FAILED'))
      .toEqual([{ name: 'adds', suite: 'tests', status: 'passed', message: undefined }, { name: 'fails', suite: 'tests', status: 'failed', message: 'panicked at 1 != 2' }])
  })

  it('finds the test declared above the cursor', () => {
    expect(testAt('import x\n\ndef test_add():\n    assert 1\n', 4)).toBe('test_add')
    expect(testAt("describe('m', () => {\n  it(\"adds two\", () => {\n    expect(1)\n", 3)).toBe('adds two')
    expect(testAt('func TestSum(t *testing.T) {\n  x := 1\n', 2)).toBe('TestSum')
    expect(testAt('const a = 1\n', 1)).toBeNull()
  })
})

describe.skipIf(!hasPytest)('a real pytest run', { timeout: 60_000 }, () => {
  it('reports passes and failures with their file and line', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-pytest-'))
    mkdirSync(join(root, 'tests'))
    writeFileSync(join(root, 'pytest.ini'), '[pytest]\n')
    writeFileSync(join(root, 'tests', 'test_math.py'), 'def test_ok():\n    assert 1 + 1 == 2\n\n\ndef test_bad():\n    assert 1 + 1 == 3\n')
    const events: TestEvent[] = []
    const done = new Promise<TestEvent>((resolve) => {
      void new TestService(new FileService()).run(1, root, detectRunners(root, baseCatalog)[0], {}, (e) => { events.push(e); if (e.type === 'done') resolve(e) })
    })
    const result = await done
    if (result.type !== 'done') throw new Error('not done')
    expect(result.results.map((r) => [r.name, r.status, r.file, r.line])).toEqual([['test_ok', 'passed', 'tests/test_math.py', 1], ['test_bad', 'failed', 'tests/test_math.py', 5]])
    expect(result.results[1].message).toContain('assert')
  })
})
