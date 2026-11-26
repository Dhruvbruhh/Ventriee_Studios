import { useCallback, useEffect, useRef, useState } from 'react'
import { guard, useStore, type Panel, type Workspace } from '../store'
import type { VoiceSettings } from '../../../shared/types'
import { Mic } from '../voice/mic'
import { Speaker } from '../voice/speaker'
import { DEFAULT_VAD, Vad, concat, downsample, encodeWav, rms } from '../voice/audio'
import { SentenceStream, afterWakeWord, parseAction, speechStyle, stripAction, type VoiceAction } from '../voice/text'

type Status = 'idle' | 'listening' | 'hearing' | 'transcribing' | 'thinking' | 'speaking'
type Mode = 'handsfree' | 'push' | 'wake' | 'text'
interface Turn { id: string; role: 'user' | 'assistant'; text: string; error?: boolean }
interface Metrics { sttMs?: number; firstTokenMs?: number; firstAudioMs?: number }
type Lines = { en: string; hinglish: string; hi: string }

const HISTORY_KEY = 'ventriee.voice.history'
const MODE_KEY = 'ventriee.voice.mode'
const MAX_TURN_MS = 30_000
const PREROLL_FRAMES = 15
const FOLLOW_UP_MS = 8000
/** Whisper invents these from silence or breath. */
const HALLUCINATION = /^(thank you\.?|thanks for watching!?|you\.?|\.+|bye\.?|subtitles by .*)$/i
const MODES: Array<[Mode, string, string]> = [
  ['handsfree', 'Hands-free', 'Talk any time; pauses end your turn'],
  ['push', 'Push', 'Hold the button (or Space on it) while you talk'],
  ['wake', 'Wake word', 'Start with "Hey Ventriee"'],
  ['text', 'Text', 'Type, read the replies, no sound']
]
const STATUS_LABEL: Record<Status, string> = {
  idle: 'Ready', listening: 'Listening', hearing: 'Hearing you', transcribing: 'Understanding', thinking: 'Thinking', speaking: 'Speaking'
}
const WORKSPACES: Workspace[] = ['home', 'plan', 'code', 'office']
const PANELS: Panel[] = ['clients', 'analytics', 'workflows', 'runs', 'settings', 'resources', 'skills', 'memory', 'automations']

const id = () => crypto.randomUUID()
const loadTurns = (): Turn[] => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] } }
const ms = (n?: number) => (n === undefined ? '–' : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`)

export function VoiceAssistant() {
  const voice = useStore((s) => s.snapshot?.settings.voice)
  const running = useStore((s) => s.snapshot?.running ?? false)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(() => (MODES.some(([m]) => m === localStorage.getItem(MODE_KEY)) ? localStorage.getItem(MODE_KEY) as Mode : 'handsfree'))
  const [status, setStatusState] = useState<Status>('idle')
  const [turns, setTurns] = useState<Turn[]>(loadTurns)
  const [partial, setPartial] = useState('')
  const [level, setLevel] = useState(0)
  const [metrics, setMetrics] = useState<Metrics>({})
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  // Everything the audio callbacks read lives here so they never see a stale render.
  const st = useRef({
    status: 'idle' as Status, mode, open, voice, turns,
    frames: [] as Float32Array[], preroll: [] as Float32Array[], turnStart: 0, pushing: false,
    requestId: '', stream: null as SentenceStream | null, t0: 0, firstToken: false, firstAudio: false,
    metrics: {} as Metrics, followUntil: 0, lastUserText: '', lastLevelAt: 0
  }).current
  st.mode = mode; st.open = open; st.voice = voice; st.turns = turns

  const vad = useRef(new Vad()).current
  const mic = useRef(new Mic()).current
  const restStatus = (): Status => (st.mode === 'text' || st.mode === 'push' ? 'idle' : 'listening')
  const setStatus = useCallback((s: Status) => { st.status = s; setStatusState(s) }, [st])
  const addTurn = useCallback((t: Omit<Turn, 'id'>) => setTurns((old) => [...old, { ...t, id: id() }].slice(-40)), [])

  const speaker = useRef<Speaker | null>(null)
  if (!speaker.current) {
    speaker.current = new Speaker(
      () => { const v = st.voice as VoiceSettings | undefined; return { tts: v?.tts ?? 'system', voiceName: v?.voiceName ?? '', rate: v?.rate ?? 1, volume: v?.volume ?? 1 } },
      {
        onStart: () => {
          if (!st.firstAudio && st.t0) { st.firstAudio = true; st.metrics.firstAudioMs = performance.now() - st.t0; setMetrics({ ...st.metrics }) }
          setStatus('speaking')
        },
        onIdle: () => { if (!st.requestId && (st.status === 'speaking' || st.status === 'thinking')) setStatus(restStatus()) },
        onError: (message) => setError(message)
      }
    )
  }
  const tts = speaker.current

  const say = useCallback((lines: Lines) => {
    const text = lines[speechStyle(st.lastUserText)]
    addTurn({ role: 'assistant', text })
    if (st.mode !== 'text') tts.enqueue(text)
  }, [st, tts, addTurn])

  /** Stop talking and drop the answer in flight; whatever was already said stays in the log. */
  const interrupt = useCallback(() => {
    if (st.requestId) {
      void window.ventriee.voiceCancel(st.requestId)
      const said = stripAction(st.stream?.text ?? '')
      if (said) addTurn({ role: 'assistant', text: `${said} …` })
      st.requestId = ''
      setPartial('')
    }
    tts.stop()
  }, [st, tts, addTurn])

  const runAction = useCallback(async (action: VoiceAction) => {
    const ui = useStore.getState()
    const snap = ui.snapshot
    if (!snap) return
    const active = snap.activeProjectId
    switch (action.type) {
      case 'open_project': {
        const want = action.name.toLowerCase()
        const project = snap.projects.find((p) => p.name.toLowerCase() === want)
          ?? snap.projects.find((p) => p.name.toLowerCase().includes(want) || want.includes(p.name.toLowerCase()))
        if (!project) return say({ en: `I couldn't find a project called ${action.name}.`, hinglish: `${action.name} naam ka project nahi mila.`, hi: `${action.name} नाम का प्रोजेक्ट नहीं मिला।` })
        if (project.id === active) return
        if (ui.editorDirty && !window.confirm('Discard unsaved code edits and switch projects?')) return
        await guard(() => window.ventriee.selectProject(project.id))
        return
      }
      case 'show': {
        if ((WORKSPACES as string[]).includes(action.view)) { ui.setPanel('none'); ui.setWorkspace(action.view as Workspace) }
        else if ((PANELS as string[]).includes(action.view)) ui.setPanel(action.view as Panel)
        return
      }
      case 'run': {
        if (!active) return say({ en: 'Open a project first, then I can start the team.', hinglish: 'Pehle koi project open karo, phir main team ko start karta hoon.', hi: 'पहले कोई प्रोजेक्ट खोलिए, फिर मैं टीम को शुरू करता हूँ।' })
        await guard(() => window.ventriee.startRun({ projectId: active, instruction: action.instruction }))
        return
      }
      case 'stop_run':
        if (active) await guard(() => window.ventriee.stopRun(active))
        return
      case 'new_session':
        if (active) { await guard(() => window.ventriee.chatSessionNew(active)); ui.setWorkspace('plan') }
        return
    }
  }, [say])

  const ask = useCallback(async (text: string) => {
    interrupt()
    st.lastUserText = text
    const history = st.turns.slice(-12).filter((t) => !t.error).map((t) => ({ role: t.role, text: t.text }))
    addTurn({ role: 'user', text })
    const requestId = id()
    st.requestId = requestId
    st.stream = new SentenceStream()
    st.firstToken = false
    st.firstAudio = false
    setPartial('')
    setError('')
    setStatus('thinking')
    const speak = st.mode !== 'text'
    try {
      const res = await window.ventriee.voiceAsk({ requestId, text, history })
      if (st.requestId !== requestId) return
      const stream = st.stream!
      if (!stream.text && res.reply) for (const s of stream.push(res.reply)) if (speak) tts.enqueue(s)
      for (const s of stream.flush()) if (speak) tts.enqueue(s)
      const action = parseAction(stream.text)
      const reply = stripAction(stream.text)
      if (reply) addTurn({ role: 'assistant', text: reply })
      setPartial('')
      if (action) await runAction(action)
    } catch (e) {
      if (st.requestId !== requestId) return
      const detail = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
      addTurn({ role: 'assistant', text: detail, error: true })
      setPartial('')
      if (speak) tts.enqueue({ en: 'Sorry, that failed. The reason is on screen.', hinglish: 'Sorry, ye fail ho gaya. Reason screen pe hai.', hi: 'माफ़ कीजिए, यह नहीं हो पाया। कारण स्क्रीन पर है।' }[speechStyle(text)])
    } finally {
      if (st.requestId === requestId) {
        st.requestId = ''
        if (!tts.active) setStatus(restStatus())
      }
    }
  }, [st, tts, interrupt, addTurn, runAction, setStatus])

  const heard = useCallback((raw: string) => {
    const text = raw.trim()
    if (!text || HALLUCINATION.test(text)) { st.t0 = 0; setStatus(restStatus()); return }
    if (st.mode === 'wake' && performance.now() > st.followUntil) {
      const rest = afterWakeWord(text)
      if (rest === null) { st.t0 = 0; setStatus(restStatus()); return }
      if (!rest) {
        st.followUntil = performance.now() + FOLLOW_UP_MS
        st.lastUserText = text
        st.t0 = 0
        setStatus(restStatus())
        return say({ en: 'Yes?', hinglish: 'Haan, boliye?', hi: 'हाँ, बोलिए?' })
      }
      st.followUntil = performance.now() + FOLLOW_UP_MS
      return void ask(rest)
    }
    if (st.mode === 'wake') st.followUntil = performance.now() + FOLLOW_UP_MS
    void ask(text)
  }, [st, ask, say, setStatus])

  const finishTurn = useCallback(async () => {
    const frames = st.frames
    st.frames = []
    const pcm = downsample(concat(frames), mic.sampleRate, 16000)
    if (pcm.length < 16000 * 0.3) { setStatus(restStatus()); return }
    st.t0 = performance.now()
    st.metrics = {}
    setStatus('transcribing')
    try {
      const text = await window.ventriee.voiceTranscribe(encodeWav(pcm, 16000))
      st.metrics.sttMs = performance.now() - st.t0
      setMetrics({ ...st.metrics })
      heard(text)
    } catch (e) {
      st.t0 = 0
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
      setStatus(restStatus())
    }
  }, [st, mic, heard, setStatus])

  const onFrame = (frame: Float32Array) => {
    const level = rms(frame)
    const now = performance.now()
    if (now - st.lastLevelAt > 60) { st.lastLevelAt = now; setLevel(Math.min(1, level * 12)) }
    st.preroll.push(frame)
    if (st.preroll.length > PREROLL_FRAMES) st.preroll.shift()
    if (st.mode === 'push') { if (st.pushing) st.frames.push(frame); return }
    if (st.status === 'transcribing') return
    const assistantBusy = tts.active || Boolean(st.requestId)
    if (assistantBusy && !st.voice?.bargeIn) { vad.reset(); return }
    // While the assistant talks, its own voice can reach the mic: only a clearly louder voice interrupts.
    const event = vad.push(level, tts.active ? 3.5 : 1)
    if (event === 'start') {
      if (assistantBusy) interrupt()
      st.frames = [...st.preroll]
      st.turnStart = now
      setStatus('hearing')
    } else if (st.status === 'hearing') {
      st.frames.push(frame)
      if (event === 'end' || now - st.turnStart > MAX_TURN_MS) { vad.reset(); void finishTurn() }
    }
  }
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  // Mic on while the panel is open and not in text mode.
  useEffect(() => {
    if (!open || mode === 'text') { setStatus('idle'); setLevel(0); return }
    let cancelled = false
    vad.opts = { ...DEFAULT_VAD, endSilenceMs: voice?.endSilenceMs ?? DEFAULT_VAD.endSilenceMs }
    vad.reset()
    mic.start((f) => onFrameRef.current(f))
      .then(() => { if (!cancelled) { setError(''); setStatus(restStatus()) } })
      .catch((e) => { if (!cancelled) { setError(`Microphone unavailable: ${e instanceof Error ? e.message : e}`); setStatus('idle') } })
    return () => { cancelled = true; mic.stop(); st.frames = []; st.pushing = false }
  }, [open, mode, voice?.endSilenceMs]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { localStorage.setItem(MODE_KEY, mode) }, [mode])
  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(turns.slice(-40))) }, [turns])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [turns, partial, open])
  useEffect(() => () => { interrupt(); mic.stop() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => window.ventriee.onVoiceChunk(({ requestId, chunk }) => {
    if (requestId !== st.requestId || !st.stream) return
    if (!st.firstToken && st.t0) { st.firstToken = true; st.metrics.firstTokenMs = performance.now() - st.t0; setMetrics({ ...st.metrics }) }
    const sentences = st.stream.push(chunk)
    setPartial(stripAction(st.stream.text))
    if (st.mode !== 'text') for (const s of sentences) tts.enqueue(s)
  }), [st, tts])

  // Speak up when the agent team starts or stops.
  const runState = useRef({ running, failedAtStart: 0 })
  useEffect(() => {
    const prev = runState.current.running
    runState.current.running = running
    if (!st.open || prev === running) return
    const failed = (useStore.getState().snapshot?.tasks ?? []).filter((t) => t.status === 'failed').length
    if (running) {
      runState.current.failedAtStart = failed
      say({ en: 'The agent team has started.', hinglish: 'Team ne kaam shuru kar diya hai.', hi: 'टीम ने काम शुरू कर दिया है।' })
    } else {
      const newFailures = failed - runState.current.failedAtStart
      say(newFailures > 0
        ? { en: `The run finished, but ${newFailures} task${newFailures === 1 ? '' : 's'} failed. Check Runs for the reason.`, hinglish: `Run khatam ho gaya, par ${newFailures} task fail hue. Runs mein reason dekh lo.`, hi: `रन पूरा हुआ, पर ${newFailures} टास्क फेल हुए। कारण Runs में देखिए।` }
        : { en: 'Done. The run finished.', hinglish: 'Ho gaya, run complete hai.', hi: 'हो गया, रन पूरा हो गया।' })
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+Alt+V opens and closes; Esc cuts the assistant off.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'v') { e.preventDefault(); setOpen((o) => !o) }
      else if (e.key === 'Escape' && st.open && (tts.active || st.requestId)) { e.preventDefault(); interrupt(); setStatus(restStatus()) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [st, tts, interrupt, setStatus])

  const close = () => { interrupt(); setOpen(false) }
  const pushStart = () => {
    if (st.mode !== 'push' || st.pushing) return
    interrupt()
    st.pushing = true
    st.frames = [...st.preroll]
    setStatus('hearing')
  }
  const pushEnd = () => {
    if (!st.pushing) return
    st.pushing = false
    void finishTurn()
  }
  const toggleSource = () => {
    if (!voice) return
    void guard(() => window.ventriee.saveSettings({ voice: { ...voice, source: voice.source === 'local' ? 'cloud' : 'local' } }))
  }
  const sendTyped = () => {
    const text = typed.trim()
    if (!text) return
    setTyped('')
    st.t0 = performance.now()
    st.metrics = {}
    void ask(text)
  }

  const bars = Array.from({ length: 18 }, (_, i) => {
    const shape = 0.35 + 0.65 * Math.sin(((i + 1) / 19) * Math.PI)
    const live = status === 'hearing' || status === 'listening' ? level : 0
    return Math.max(0.08, Math.min(1, shape * (0.15 + live * 1.6)))
  })

  if (!open) {
    return (
      <button className="vx-pill" onClick={() => setOpen(true)} title="Talk to Ventriee (Ctrl+Alt+V)" aria-label="Open the Ventriee voice assistant">
        <span className="vx-pill-bars" aria-hidden>{[0.5, 0.9, 0.6, 1, 0.55].map((h, i) => <i key={i} style={{ height: `${h * 100}%` }} />)}</span>
        <span>Ventriee</span>
      </button>
    )
  }

  return (
    <section className={`vx-card vx-${status}`} role="dialog" aria-label="Ventriee voice assistant">
      <header className="vx-head">
        <span className="vx-dot" aria-hidden />
        <b>Ventriee</b>
        <span className="vx-status" aria-live="polite">{mode === 'text' && status === 'idle' ? 'Text only' : STATUS_LABEL[status]}</span>
        <span className="vx-spacer" />
        <button className="vx-chip" onClick={toggleSource} title="Which model answers: the planner engine (cloud) or a local Ollama model">
          {voice?.source === 'local' ? 'Local' : 'Cloud'}
        </button>
        <button className="vx-icon" onClick={() => { interrupt(); setTurns([]) }} title="Clear the conversation" aria-label="Clear the conversation">⟲</button>
        <button className="vx-icon" onClick={close} title="Close (Ctrl+Alt+V)" aria-label="Close the voice assistant">✕</button>
      </header>

      <div className="vx-log" ref={logRef} aria-live="polite">
        {!turns.length && !partial ? (
          <p className="vx-empty">
            {mode === 'wake' ? 'Say "Hey Ventriee", then what you need.' : mode === 'push' ? 'Hold the button and talk.' : mode === 'text' ? 'Type a message below.' : 'Just start talking. Hindi, English or Hinglish.'}
          </p>
        ) : null}
        {turns.map((t) => <div key={t.id} className={`vx-msg vx-${t.role}${t.error ? ' vx-error' : ''}`}>{t.text}</div>)}
        {partial ? <div className="vx-msg vx-assistant vx-streaming">{partial}</div> : null}
      </div>

      <div className="vx-viz" aria-hidden>
        {bars.map((h, i) => <i key={i} style={{ transform: `scaleY(${h})`, animationDelay: `${(i % 6) * 70}ms` }} />)}
      </div>

      {mode === 'text' ? (
        <form className="vx-type" onSubmit={(e) => { e.preventDefault(); sendTyped() }}>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Message Ventriee…" aria-label="Message Ventriee" autoFocus />
          <button className="btn primary" type="submit" disabled={!typed.trim()}>Send</button>
        </form>
      ) : mode === 'push' ? (
        <button
          className={`vx-talk${status === 'hearing' ? ' on' : ''}`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pushStart() }}
          onPointerUp={pushEnd}
          onPointerCancel={pushEnd}
          onKeyDown={(e) => { if (e.key === ' ' && !e.repeat) { e.preventDefault(); pushStart() } }}
          onKeyUp={(e) => { if (e.key === ' ') { e.preventDefault(); pushEnd() } }}
        >
          {status === 'hearing' ? 'Release to send' : 'Hold to talk'}
        </button>
      ) : status === 'speaking' || status === 'thinking' ? (
        <button className="vx-talk" onClick={() => { interrupt(); setStatus(restStatus()) }}>Stop (Esc)</button>
      ) : null}

      <div className="vx-modes" role="radiogroup" aria-label="Conversation mode">
        {MODES.map(([m, label, hint]) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} title={hint} onClick={() => { interrupt(); setMode(m) }}>{label}</button>
        ))}
      </div>

      {error ? <p className="vx-err" role="alert">{error}</p> : null}
      <footer className="vx-metrics" title="Measured on this computer for the last turn. Hands-free turns also wait for the end-of-turn silence before this clock starts.">
        <span>Heard {ms(metrics.sttMs)}</span>
        <span>First word {ms(metrics.firstTokenMs)}</span>
        <span>First sound {ms(metrics.firstAudioMs)}</span>
      </footer>
    </section>
  )
}
