import type { ReactNode } from 'react'

interface Props {
  id: string
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  error: string | null
  icon: ReactNode
  autoComplete?: string
  disabled?: boolean
  inputMode?: 'email' | 'text'
  trailing?: ReactNode
}

/**
 * Labelled pill field. The error lives in the label row, in a slot of fixed height, so showing or clearing it
 * never moves anything below. The focus ring only appears for keyboard focus (:focus-visible).
 */
export default function Field({ id, label, type = 'text', value, onChange, error, icon, autoComplete, disabled, inputMode, trailing }: Props) {
  return (
    <div className="field">
      <div className="field-row">
        <label htmlFor={id}>{label}</label>
        <span id={`${id}-error`} role="alert" className="field-error">{error ?? ''}</span>
      </div>
      <div className="pill" data-invalid={error ? 'true' : undefined}>
        <span className="pill-icon" aria-hidden="true">{icon}</span>
        <input id={id} name={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          autoComplete={autoComplete} inputMode={inputMode} spellCheck={false} maxLength={256}
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-error`} />
        {trailing}
      </div>
    </div>
  )
}

export const MailIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" />
  </svg>
)

export const LockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="10" width="16" height="10" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)
