import { useEffect, useState } from 'react'
import { IconExternal, IconRefresh } from '../icons'
import { useStore, cleanError } from '../store'

/** Files each worker task changed, from its recorded evidence, with Git diff and restore. */
export function AgentChanges({ projectId, onDiff, onOpen }: { projectId: string; onDiff: (path: string) => void; onOpen: (path: string) => void }) {
  const snapshot = useStore((s) => s.snapshot)
  const [repository, setRepository] = useState<boolean | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void window.ventriee.gitStatus(projectId).then((state) => { if (alive) setRepository(state.repository) }).catch(() => { if (alive) setRepository(false) })
    return () => { alive = false }
  }, [projectId])
  const tasks = (snapshot?.tasks ?? []).filter((t) => t.projectId === projectId && t.changedFiles?.length).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50)
  const restore = async (path: string) => {
    if (busy || !window.confirm(`Restore ${path} to the last commit? The current version of this file will be lost.`)) return
    setBusy(path); setError('')
    try {
      await window.ventriee.gitAction(projectId, 'discard', path)
      useStore.getState().notify(`Restored ${path} from the last commit`, 'info')
    } catch (reason) { setError(cleanError(reason)) }
    finally { setBusy('') }
  }
  return <div className="agent-changes">
    <div className="code-section-head"><strong>AGENT CHANGES</strong></div>
    {repository === false ? <p className="tree-note">This project has no Git repository, so changes can be opened but not compared or restored. Initialize one in Source Control.</p>
      : repository ? <p className="tree-note">Diffs compare with Git (the last commit unless you staged changes). Files from several tasks can overlap.</p> : null}
    {error ? <p className="editor-error" role="alert">{error}</p> : null}
    {!tasks.length ? <p className="code-empty">No recorded agent changes yet. Files show up here after a worker task finishes.</p> : null}
    {tasks.map((task) => {
      const agent = snapshot?.agents.find((a) => a.id === task.agentId)
      return <section className="sc-group" key={task.id}><h3 title={task.title}>{task.title}<span>{task.status}</span></h3>
        <small className="dim agent-changes-by">{agent ? `${agent.name}, ${agent.title}` : task.role}</small>
        {task.changedFiles!.map((file) => <div className="sc-file" key={file.path}>
          <button className="sc-path" title={file.path} onClick={() => repository ? onDiff(file.path) : file.removed ? undefined : onOpen(file.path)}>
            <b className={file.removed ? 'git-D' : 'git-M'}>{file.removed ? 'D' : 'M'}</b><span>{file.path}</span></button>
          {!file.removed ? <button className="sc-action" onClick={() => onOpen(file.path)} aria-label={`Open ${file.path}`} title="Open file"><IconExternal width={13} height={13} aria-hidden /></button> : null}
          {repository ? <button className="sc-action" disabled={Boolean(busy)} onClick={() => void restore(file.path)} aria-label={`Restore ${file.path} from the last commit`} title="Restore from last commit"><IconRefresh width={13} height={13} aria-hidden /></button> : null}
        </div>)}
      </section>
    })}
  </div>
}
