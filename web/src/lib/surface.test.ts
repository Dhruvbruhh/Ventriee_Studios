import { expect, test } from 'vitest'
import { surfaceFromHost } from './surface'

test('hostname picks the surface', () => {
  expect(surfaceFromHost('workspace.ventriee.in')).toBe('workspace')
  expect(surfaceFromHost('dashboard.ventriee.in')).toBe('dashboard')
  expect(surfaceFromHost('app.ventriee.in')).toBe('app')
  expect(surfaceFromHost('localhost')).toBe('workspace')
  expect(surfaceFromHost('ventriee-web.pages.dev')).toBe('workspace')
})

test('?surface= overrides the host', () => {
  expect(surfaceFromHost('localhost', '?surface=app')).toBe('app')
  expect(surfaceFromHost('localhost', '?surface=bogus')).toBe('workspace')
})
