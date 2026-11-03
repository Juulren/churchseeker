import { useEffect, useRef } from 'react'
import { useLostField } from './useLostField.ts'

/**
 * The list of churches did not load: the status in large characters that scatter under the pointer (the same field as the
 * 404), what happened, a button that breaks the numerals apart and lets them re-form while it tries again, and the way in
 * for staff. The text and the buttons are plain HTML.
 */
export default function ServerDown({ code, message, onRetry }: { code: string; message: string; onRetry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const { art, play } = useLostField(code)
  useEffect(() => { heading.current?.focus() }, [])
  return (
    <main className="notfound">
      <div ref={art} className="notfound-art" aria-hidden="true" />
      <section>
        <p className="rpg-label">Sin conexión · {code}</p>
        <h1 ref={heading} tabIndex={-1} style={{ outline: 'none' }}>No pudimos cargar las iglesias</h1>
        <p role="alert" className="muted" style={{ margin: '8px 0 18px' }}>{message}</p>
        <button type="button" className="rpg-button btn-primary" onClick={(e) => { void play(e.currentTarget, onRetry) }}>Reintentar</button>
        <p style={{ marginTop: 14 }}><a href="#/login" className="muted">Acceso del personal</a></p>
      </section>
    </main>
  )
}
