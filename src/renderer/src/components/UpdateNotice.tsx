import { useEffect, useState } from 'react'
import { guard, useStore } from '../store'
import type { UpdateState } from '../../../shared/types'

export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    void window.ventriee.updateState().then(setState).catch(() => {})
    return window.ventriee.onUpdate(setState)
  }, [])
  return state
}

export async function installUpdate() {
  if (useStore.getState().editorDirty && !window.confirm('Some code files have unsaved changes. Restart to update anyway and lose those edits?')) return
  await guard(() => window.ventriee.updateInstall())
}

/** Top-bar notice: silent until there is something to act on. */
export function UpdateNotice() {
  const state = useUpdateState()
  if (state?.status === 'downloading') return <span className="update-pill" role="status">Downloading {state.version} · {state.percent ?? 0}%</span>
  if (state?.status === 'ready') return <button className="btn tiny primary update-pill" onClick={() => void installUpdate()} title="Your projects and settings stay as they are">Restart to update to {state.version}</button>
  if (state?.status === 'manual' && state.url) return <a className="btn tiny update-pill" href={state.url} target="_blank" rel="noreferrer">Version {state.version} available</a>
  return null
}
