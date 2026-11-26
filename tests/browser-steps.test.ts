import { describe, expect, it } from 'vitest'
import { isLocalHost, parseSteps } from '../src/main/browserSteps'

describe('parseSteps', () => {
  it('parses a test flow and fills {{input}}', () => {
    const { steps, errors } = parseSteps(`
      # check the login page
      goto http://localhost:3000/login
      viewport 390x844
      type input[name=email] => {{input}}
      press enter
      waitfor .dashboard
      expect h1 contains Welcome
      screenshot after login
    `, 'a@b.test')
    expect(errors).toEqual([])
    expect(steps.map((s) => s.action)).toEqual(['goto', 'viewport', 'type', 'press', 'waitfor', 'expect', 'screenshot'])
    expect(steps[2]).toMatchObject({ selector: 'input[name=email]', text: 'a@b.test' })
    expect(steps[3]).toMatchObject({ key: 'Enter' })
    expect(steps[6]).toMatchObject({ name: 'after-login' })
  })

  it('refuses non-web addresses and reports bad lines by number', () => {
    const { steps, errors } = parseSteps('goto file:///C:/secrets.txt\nclick\nwait 999999\nfly away')
    expect(steps).toEqual([])
    expect(errors).toHaveLength(4)
    expect(errors[0]).toMatch(/^Line 1: only http/)
    expect(errors[3]).toMatch(/^Line 4: unknown step "fly"/)
  })
})

describe('isLocalHost', () => {
  it('treats only loopback and .localhost as local', () => {
    expect(isLocalHost('localhost')).toBe(true)
    expect(isLocalHost('[::1]')).toBe(true)
    expect(isLocalHost('app.localhost')).toBe(true)
    expect(isLocalHost('localhost.evil.com')).toBe(false)
    expect(isLocalHost('example.com')).toBe(false)
  })
})
