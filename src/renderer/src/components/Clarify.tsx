import { useState } from 'react'
import { IconSpark } from '../icons'
import type { Clarification } from '../../../shared/types'

/**
 * Ask the planner what a brief is missing before planning it. `ask` resolves the
 * questions, then calls `go` straight away when there are none (clear brief, setting
 * off, no engine) or once the owner answers. Render `panel` where the questions belong.
 */
export function useClarify(projectId: string | undefined) {
  const [pending, setPending] = useState<{ questions: Clarification[]; go: (answers: Clarification[]) => void } | null>(null)
  const [checking, setChecking] = useState(false)

  const ask = async (brief: string, go: (answers: Clarification[]) => void) => {
    if (!projectId) return
    setChecking(true)
    const questions = await window.ventriee.clarifyBrief({ projectId, brief }).catch(() => [] as Clarification[])
    setChecking(false)
    if (questions.length) setPending({ questions, go })
    else go([])
  }

  const panel = pending ? (
    <ClarifyPanel
      questions={pending.questions}
      onDone={(answers) => { setPending(null); pending.go(answers) }}
      onCancel={() => setPending(null)}
    />
  ) : null

  return { ask, checking, pending: Boolean(pending), panel }
}

function ClarifyPanel({ questions, onDone, onCancel }: {
  questions: Clarification[]; onDone: (answers: Clarification[]) => void; onCancel: () => void
}) {
  const [answers, setAnswers] = useState(questions.map((q) => q.answer))
  const answered = () => questions.map((q, i) => ({ question: q.question, answer: answers[i] }))

  return (
    <section className="simple-plan" aria-label="Questions before planning">
      <div className="simple-plan-head"><IconSpark width={14} height={14} /> A few questions before I plan</div>
      {questions.map((q, i) => (
        <div key={i} className="field">
          <label className="field-label" htmlFor={`clarify-${i}`}>{q.question}</label>
          <input
            id={`clarify-${i}`}
            className="input"
            value={answers[i]}
            onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
          />
        </div>
      ))}
      <div className="simple-plan-actions">
        <button className="btn primary" onClick={() => onDone(answered())}>Continue</button>
        <button className="btn" onClick={() => onDone(questions)} title="Plan with the suggested answers">Use defaults</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  )
}
