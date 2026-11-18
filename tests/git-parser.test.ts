import { describe, expect, it } from 'vitest'
import { parseGitChanges } from '../src/main/git'
describe('Git status framing', () => {
  it('preserves paths with spaces and pairs renamed paths in porcelain -z order', () => {
    expect(parseGitChanges('R  new file.ts\0old file.ts\0 M other.ts\0?? file[1].py\0')).toEqual([
      { index: 'R', working: ' ', path: 'new file.ts', originalPath: 'old file.ts' },
      { index: ' ', working: 'M', path: 'other.ts' },
      { index: '?', working: '?', path: 'file[1].py' }
    ])
  })
  it('keeps both sides of partially staged files and merge conflicts', () => {
    expect(parseGitChanges('MM app.ts\0UU conflict.ts\0')).toEqual([
      { index: 'M', working: 'M', path: 'app.ts' }, { index: 'U', working: 'U', path: 'conflict.ts' }
    ])
  })
})
