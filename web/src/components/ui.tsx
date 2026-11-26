// Small reusable UI kit. Plain elements + the design-system classes in index.css.
import type { ReactNode } from 'react'

export function Button(
  { children, variant = 'default', size, ...rest }:
  { children: ReactNode; variant?: 'default' | 'primary' | 'danger' | 'ghost'; size?: 'sm' } &
  React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size === 'sm' && 'btn-sm'].filter(Boolean).join(' ')
  return <button className={cls} {...rest}>{children}</button>
}

export function Card({ children, pad = true, className = '' }: { children: ReactNode; pad?: boolean; className?: string }) {
  return <div className={`card ${pad ? 'card-pad' : ''} ${className}`}>{children}</div>
}

export function Stat({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <Card className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${danger && value ? 'danger' : ''}`}>{value}</div>
    </Card>
  )
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Spinner() {
  return <div className="center"><div className="spinner" role="status" aria-label="Loading" /></div>
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="state">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state error">
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry && <div style={{ marginTop: 14 }}><Button onClick={onRetry}>Try again</Button></div>}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
