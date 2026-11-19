import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Studio manager: swaps all API-engine workers to Inception mercury-3 (the only
 * engine answering reliably on this machine), then drives the current project's
 * run to completion, auto-retrying failed/rework tasks (max 2 extra attempts).
 */
const PORT = 9711
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error('no cdp target')
}

const ws = new WebSocket(await connect())
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
await new Promise((r) => ws.addEventListener('open', r))
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id
  pending.set(n, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))
  ws.send(JSON.stringify({ id: n, method, params }))
})
await send('Runtime.enable')
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const snap = () => ev(`window.ventriee.snapshot()`)

// ---- phase A: move every API worker to mercury-3 ----
const s0 = await snap()
let swapped = 0
for (const a of s0.agents) {
  if (a.engine === 'cli-opencode' || a.engine === 'cli-claude') continue
  if (a.engine !== 'api-inception' || a.model !== 'mercury-3') {
    await ev(`window.ventriee.updateAgent(${JSON.stringify(a.id)}, { engine: 'api-inception', model: 'mercury-3', endpoint: 'https://api.inceptionlabs.ai/v1', reasoning: 'none' })`)
    swapped++
  }
}
console.log(`[manager] swapped ${swapped} workers to api-inception/mercury-3`)

// ---- phase B: drive to completion ----
const projectId = s0.activeProjectId
const maxLoops = 240 // 240 * 30s = 2h
let retriesByTask = new Map()

for (let i = 0; i < maxLoops; i++) {
  const s = await snap()
  const tasks = s.tasks
  const running = s.running
  const terminal = tasks.filter((t) => ['done', 'failed'].includes(t.status))
  const nonBlocked = tasks.filter((t) => !['done', 'failed', 'blocked'].includes(t.status))

  if (!running && nonBlocked.length === 0) {
    const failed = tasks.filter((t) => t.status === 'failed')
    console.log(`[manager] run settled: ${tasks.length} tasks, ${tasks.filter(t => t.status === 'done').length} done, ${failed.length} failed`)
    if (failed.length) {
      // retry each failed task once more (max 2 auto-retries), then give up
      let retriedAny = false
      for (const t of failed) {
        const n = retriesByTask.get(t.id) ?? 0
        if (n < 2 && t.attempts < 3) {
          retriesByTask.set(t.id, n + 1)
          await ev(`window.ventriee.retryTask(${JSON.stringify(t.id)})`)
          console.log(`[manager] retried ${t.role} (${t.id}) attempt ${n + 1}`)
          retriedAny = true
        }
      }
      if (!retriedAny) {
        console.log('[manager] exhausted retries; final state:')
        for (const t of tasks) console.log(`  ${t.role}: ${t.status}${t.review ? ' — ' + t.review.slice(0, 100) : ''}`)
        break
      }
    } else {
      console.log('[manager] ALL TASKS DONE ✓')
      break
    }
  }

  if (i % 4 === 0) {
    console.log(`[manager] t=${Math.round(i * 30)}s running=${running} tasks=${tasks.map(t => t.role[0].toUpperCase() + t.role.slice(0,3) + ':' + t.status[0]).join(' ')}`)
  }
  await sleep(30000)
}

ws.close()
console.log('[manager] done')
