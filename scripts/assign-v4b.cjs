;(async () => {
  const PORT = 9712
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const page = list.find((t) => t.type === 'page')
    const ws = new WebSocket(page.webSocketDebuggerUrl)
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
    const snap = await ev(`window.ventriee.snapshot()`)
    const real = snap.projects.find((p) => p.name === 'Bubbling fish')
    if (real && real.id !== snap.activeProjectId) {
      await ev(`window.ventriee.selectProject(${JSON.stringify(real.id)})`)
      await new Promise((r) => setTimeout(r, 1500))
    }
    const v4 = await ev(`window.ventriee.snapshot().then(s => s.prompts.find(p => p.version === 4) ?? s.prompts[s.prompts.length-1])`)
    console.log('v4', v4?.id, v4?.version)
    const assigned = await ev(`window.ventriee.assignPrompt({ projectId: ${JSON.stringify(real.id)}, promptId: ${JSON.stringify(v4.id)}, mode: 'orchestrator' })`)
    console.log('ASSIGNED', JSON.stringify({ jobId: assigned.jobId, taskCount: assigned.taskCount }))
    // wait a bit and count tasks
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 10000))
      const s = await ev(`window.ventriee.snapshot()`)
      console.log(`t=${(i+1)*10}s tasks=${s.tasks.length} ${s.tasks.map(t => t.role + ':' + t.status).join(' ')}`)
      if (s.tasks.length > 0 && !s.running) break
    }
    ws.close()
  } catch (e) {
    console.error('ERR', e.message)
    process.exit(1)
  }
})()
