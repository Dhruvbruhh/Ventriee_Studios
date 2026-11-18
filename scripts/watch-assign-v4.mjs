import { sleep } from './lib/app.mjs'

const PORT = 9711
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

// wait for current run to settle (max 3h)
let settled = false
for (let i = 0; i < 360; i++) {
  const s = await ev(`window.ventriee.snapshot()`)
  const real = s.projects.find((p) => p.name === 'Bubbling fish')
  let realTasks = []
  let realRunning = false
  if (real) {
    const r = await ev(`window.ventriee.snapshot().then(() => null)`)
    realTasks = s.tasks
    realRunning = s.running
    if (real.id !== s.activeProjectId) {
      await ev(`window.ventriee.selectProject(${JSON.stringify(real.id)})`)
      await sleep(1200)
      const s2 = await ev(`window.ventriee.snapshot()`)
      realTasks = s2.tasks
      realRunning = s2.running
    }
  }
  const nonTerminal = realTasks.filter((t) => !['done', 'failed', 'blocked'].includes(t.status))
  if (!realRunning && nonTerminal.length === 0) {
    settled = true
    console.log(`[watcher] run settled: ${realTasks.length} tasks (${realTasks.filter(t => t.status === 'done').length} done, ${realTasks.filter(t => t.status === 'failed').length} failed)`)
    break
  }
  if (i % 10 === 0) console.log(`[watcher] t=${i * 30}s running=${realRunning} pending=${nonTerminal.map(t => t.role).join(',')}`)
  await sleep(30000)
}

if (!settled) { console.log('[watcher] timed out waiting for settle'); process.exit(1) }

// assign v4
const snap = await ev(`window.ventriee.snapshot()`)
const projectId = snap.activeProjectId
const v4 = snap.prompts.find((p) => p.version === 4)
if (!v4) { console.log('[watcher] v4 not found'); process.exit(1) }
const assigned = await ev(`window.ventriee.assignPrompt({ projectId: ${JSON.stringify(projectId)}, promptId: ${JSON.stringify(v4.id)}, mode: 'orchestrator' })`)
console.log('[watcher] assigned v4:', JSON.stringify({ jobId: assigned.jobId, taskCount: assigned.taskCount }))
ws.close()
console.log('[watcher] done')
