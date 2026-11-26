import { useEffect, useRef, useState } from 'react'
import { Modal } from '../shell'
import { IconSearch } from '../icons'
import { HELP_TOPICS, searchHelp } from '../help'

/**
 * In-app Help Center: a topic list (searchable) beside the content view, with
 * prev/next over the current results. Escape closes via the shared Modal.
 */
export function HelpPanel({ onClose }: { onClose: () => void }) {
  const [topicId, setTopicId] = useState(HELP_TOPICS[0].id)
  const [query, setQuery] = useState('')
  const topics = searchHelp(query)
  const index = Math.max(0, topics.findIndex((t) => t.id === topicId))
  const active = topics[index] ?? topics[0]
  const headRef = useRef<HTMLHeadingElement>(null)

  // Move focus to the article heading when the topic changes.
  useEffect(() => { headRef.current?.focus() }, [active?.id])

  const go = (step: number) => {
    const next = topics[index + step]
    if (next) setTopicId(next.id)
  }

  return (
    <Modal
      title="Help Center"
      subtitle="Short, beginner-friendly guides for the studio's major features."
      onClose={onClose}
      nav={
        <div className="modal-nav help-nav" role="tablist" aria-orientation="vertical" aria-label="Help topics">
          <label className="search-field">
            <IconSearch width={14} height={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${HELP_TOPICS.length} topics`} aria-label="Search help topics" type="search" />
          </label>
          <div className="help-topics">
            {topics.map((t) => (
              <button key={t.id} className={`modal-nav-item${t.id === active.id ? ' on' : ''}`} role="tab" aria-selected={t.id === active.id} onClick={() => setTopicId(t.id)}>
                {t.title}
              </button>
            ))}
            {!topics.length ? <p className="dim text-sm help-empty">No topics match your search.</p> : null}
          </div>
        </div>
      }
    >
      {active ? (
        <article className="help-topic" aria-labelledby="help-topic-title">
          <h3 id="help-topic-title" ref={headRef} tabIndex={-1} className="help-topic-title">{active.title}</h3>
          <p className="help-summary">{active.summary}</p>
          {active.sections.map((section) => (
            <section key={section.heading} className="help-section">
              <h4>{section.heading}</h4>
              <ul>
                {section.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </section>
          ))}
          <footer className="help-foot">
            <span className="help-count dim">Topic {index + 1} of {topics.length}</span>
            <div className="flex gap-8">
              <button className="btn" onClick={() => go(-1)} disabled={index === 0}>‹ Previous</button>
              <button className="btn primary" onClick={() => go(1)} disabled={index >= topics.length - 1}>Next ›</button>
            </div>
          </footer>
        </article>
      ) : null}
    </Modal>
  )
}
