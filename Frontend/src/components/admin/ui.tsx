import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { scaleBars } from './format.ts'

export function Notice({ kind = 'error', children }: { kind?: 'error' | 'ok'; children: ReactNode }) {
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`notice notice-${kind}`}>{children}</p>
}

interface FieldProps { label: string; error?: string | null; children: (id: string) => ReactNode; hint?: string }

/** Label + control + inline error, in a slot of fixed height so messages never shift the form. */
export function Labeled({ label, error, children, hint }: FieldProps) {
  const id = useId()
  return (
    <div className="form-field">
      <div className="field-row">
        <label htmlFor={id}>{label}</label>
        <span role="alert" className="field-error">{error ?? ''}</span>
      </div>
      {children(id)}
      {hint && <small className="rpg-label" style={{ textTransform: 'none', letterSpacing: 0 }}>{hint}</small>}
    </div>
  )
}

interface InputProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  error?: string | null
  required?: boolean
  maxLength?: number
  step?: string
  min?: string
  hint?: string
  disabled?: boolean
}

export function TextInput({ label, value, onChange, type = 'text', error, required, maxLength = 256, step, min, hint, disabled }: InputProps) {
  return (
    <Labeled label={label} error={error} hint={hint}>
      {(id) => (
        <input id={id} className="input" type={type} value={value} required={required} maxLength={maxLength} step={step} min={min} disabled={disabled}
          aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
      )}
    </Labeled>
  )
}

export function TextArea({ label, value, onChange, error, maxLength = 4000 }: { label: string; value: string; onChange: (v: string) => void; error?: string | null; maxLength?: number }) {
  return (
    <Labeled label={label} error={error}>
      {(id) => <textarea id={id} className="input" rows={4} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />}
    </Labeled>
  )
}

export function SelectInput({ label, value, onChange, options, error }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; error?: string | null }) {
  return (
    <Labeled label={label} error={error}>
      {(id) => (
        <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Labeled>
  )
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

interface ModalProps { title: string; onClose: () => void; children: ReactNode }

/** Accessible dialog on <body>: Esc closes, focus moves in and returns to what opened it. */
export function Modal({ title, onClose, children }: ModalProps) {
  const box = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(document.activeElement)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    const previous = opener.current as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [onClose])
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={box} className="rpg-panel modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3 className="rpg-title text-2xl">{title}</h3>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pager">
      <button className="rpg-button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">‹</button>
      <span aria-live="polite">Página {page} de {pages} · {total} en total</span>
      <button className="rpg-button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Página siguiente">›</button>
    </div>
  )
}

/** Simple accessible bar chart: SVG bars with a text alternative. */
export function BarChart({ labels, values, title, format = (n: number) => String(n) }: { labels: string[]; values: number[]; title: string; format?: (n: number) => string }) {
  const bars = scaleBars(values)
  const w = 36
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${Math.max(labels.length, 1) * w} 120`} role="img" aria-label={`${title}: ${labels.map((l, i) => `${l} ${format(values[i] ?? 0)}`).join(', ')}`} preserveAspectRatio="none">
        {bars.map((b, i) => (
          <g key={i}>
            <rect x={i * w + 6} y={100 - b * 90} width={w - 12} height={Math.max(b * 90, values[i] > 0 ? 2 : 0)} rx="3" fill="rgba(255,255,255,0.85)">
              <title>{`${labels[i]}: ${format(values[i] ?? 0)}`}</title>
            </rect>
            <text x={i * w + w / 2} y={115} textAnchor="middle" fontSize="9" fill="#9aa6b6">{labels[i]}</text>
          </g>
        ))}
      </svg>
      <figcaption className="rpg-label">{title}</figcaption>
    </figure>
  )
}
