/**
 * Packaged-app check: the built exe must boot on a clean profile
 * and render with no console errors. (Skills come from plugins now, so none are required.)
 *
 * Run after `npm run dist`:  node scripts/packaged-smoke.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, sleep, freePort } from './lib/app.mjs'

const PORT = await freePort()
const exe = join(process.cwd(), 'dist', 'win-unpacked', 'ventriee-studios.exe')
const userData = mkdtempSync(join(tmpdir(), 'ventriee-packaged-'))

const child = spawn(exe, [`--remote-debugging-port=${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VENTRIEE_USERDATA: userData }
})
child.stderr.on('data', (d) => {
  const s = String(d)
  if (s.includes('ERROR') && !s.includes('DevTools')) console.log('[app]', s.trim())
})

const app = await connect(PORT)
await sleep(2500)
const snapshot = await app.evaluate(`window.ventriee.snapshot()`)
const brand = await app.evaluate(`document.querySelector('.brand')?.textContent?.trim() ?? ''`)

console.log('brand:', brand)
console.log('skills installed:', snapshot.skills.length)
console.log('userData:', userData)
console.log('console errors:', app.errors.length ? app.errors.slice(0, 5) : 'none')

app.ws.close()
spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
await sleep(800)
process.exit(brand.includes('VENTRIEE') && app.errors.length === 0 ? 0 : 1)
