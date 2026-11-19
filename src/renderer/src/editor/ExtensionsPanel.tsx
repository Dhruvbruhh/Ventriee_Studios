import { useEffect, useState } from 'react'
import { RichText } from '../components/RichText'
import { guard, useStore } from '../store'
import { extensionThemes, loadExtensions } from './extensions'
import type { ExtensionInfo, ExtensionSearchHit } from '../../../shared/workspace'

type Details = ExtensionSearchHit & { supported: string[]; needsRuntime: boolean; readme: string }
const LABELS: Record<string, string> = { themes: 'Color themes', snippets: 'Snippets', languages: 'Languages', grammars: 'Syntax highlighting' }

/** Open VSX extensions: search, read what an extension would add, install, enable, update, pick a theme. */
export function ExtensionsPanel() {
  const theme = useStore((s) => s.snapshot?.settings.editorTheme ?? 'ventriee')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ExtensionSearchHit[] | null>(null)
  const [installed, setInstalled] = useState<ExtensionInfo[]>([])
  const [updates, setUpdates] = useState<Array<{ id: string; version: string }>>([])
  const [details, setDetails] = useState<Details | null>(null)
  const [busy, setBusy] = useState('')
  const [themes, setThemes] = useState(extensionThemes)
  const refresh = async () => {
    setInstalled(await window.ventriee.extList().catch(() => []))
    await loadExtensions(theme); setThemes(extensionThemes)
  }
  useEffect(() => { void refresh() }, [])
  const search = async () => {
    if (!query.trim()) return
    setBusy('search'); setDetails(null)
    setHits(await guard(() => window.ventriee.extSearch(query.trim())) ?? [])
    setBusy('')
  }
  const act = async (id: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(id)
    if ((await guard(work, done)) !== null) await refresh()
    setBusy('')
  }
  const useTheme = (id: string) => void guard(() => window.ventriee.saveSettings({ editorTheme: id })).then(() => loadExtensions(id))

  if (details) {
    const have = installed.find((e) => e.id === details.id)
    return <div className="ext-panel">
      <button className="btn tiny" onClick={() => setDetails(null)}>Back</button>
      <h3>{details.name}</h3><p className="tree-note">{details.publisher} · v{details.version} · {details.downloads.toLocaleString()} downloads</p>
      <p>{details.description}</p>
      {details.supported.length ? <p className="tree-note">Adds: {details.supported.map((s) => LABELS[s] ?? s).join(', ')}</p> : null}
      {details.needsRuntime ? <p className="editor-error" role="note">{details.supported.length ? 'Its code features need the VS Code runtime and will not run here; the parts listed above will.' : 'This extension needs the VS Code runtime to run its code, which Ventriee does not run, so it cannot be installed.'}</p> : null}
      {have ? <button className="btn tiny" disabled={busy === details.id} onClick={() => void act(details.id, () => window.ventriee.extUninstall(details.id), `${details.name} removed`)}>Uninstall</button>
        : <button className="btn tiny primary" disabled={!details.supported.length || busy === details.id} onClick={() => void act(details.id, () => window.ventriee.extInstall(details.id), `${details.name} installed`)}>{busy === details.id ? 'Installing…' : 'Install'}</button>}
      {details.readme ? <div className="ext-readme"><RichText text={details.readme} /></div> : null}
    </div>
  }
  return <div className="ext-panel">
    <form onSubmit={(e) => { e.preventDefault(); void search() }}><input className="input" aria-label="Search extensions" placeholder="Search Open VSX (themes, languages, snippets)" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} /></form>
    <p className="tree-note">From Open VSX. Themes, snippets, languages and syntax highlighting work; extension code never runs.</p>
    {busy === 'search' ? <p className="tree-note" role="status">Searching…</p> : null}
    {hits ? <section aria-label="Search results"><h4>Results</h4>{hits.length ? hits.map((h) => <button key={h.id} className="ext-row" onClick={() => void guard(() => window.ventriee.extDetails(h.id)).then((d) => d && setDetails(d))}>
      {h.icon ? <img src={h.icon} alt="" width={28} height={28} /> : <span className="ext-icon" aria-hidden />}<span><b>{h.name}</b><small>{h.publisher} · {h.description}</small></span></button>) : <p className="tree-note">No extensions found.</p>}</section> : null}
    <section aria-label="Editor theme"><h4>Editor theme</h4>
      <select aria-label="Editor theme" value={themes.some((t) => t.id === theme) ? theme : 'ventriee'} onChange={(e) => useTheme(e.target.value)}>
        <option value="ventriee">Ventriee (default)</option>{themes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></section>
    <section aria-label="Installed extensions"><h4>Installed <button className="btn tiny" onClick={() => void guard(() => window.ventriee.extUpdates()).then((u) => { if (u) { setUpdates(u); if (!u.length) useStore.getState().notify('All extensions are up to date') } })}>Check for updates</button></h4>
      {installed.length ? installed.map((e) => { const update = updates.find((u) => u.id === e.id); return <div key={e.id} className="ext-installed">
        <button className="change-path" onClick={() => void guard(() => window.ventriee.extDetails(e.id)).then((d) => d && setDetails(d))}><b>{e.name}</b> <small className="dim">v{e.version}</small></button>
        {update ? <button className="btn tiny primary" disabled={busy === e.id} onClick={() => void act(e.id, () => window.ventriee.extInstall(e.id), `${e.name} updated to ${update.version}`)}>Update</button> : null}
        <label><input type="checkbox" checked={e.enabled} onChange={(x) => void act(e.id, () => window.ventriee.extSetEnabled(e.id, x.target.checked))} /> On</label>
        <button className="btn tiny" disabled={busy === e.id} onClick={() => void act(e.id, () => window.ventriee.extUninstall(e.id), `${e.name} removed`)}>Remove</button></div> })
        : <p className="tree-note">No extensions installed. Try searching for "dracula", "svelte" or "zig".</p>}</section>
  </div>
}
