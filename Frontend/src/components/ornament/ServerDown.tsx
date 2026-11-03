import { useEffect, useRef } from 'react'
import { LostPath } from './Illustrations.tsx'

/** The list of churches did not load: the same lost road as the 404, with what happened, a button to try again and the way in for staff. */
export default function ServerDown({ message, onRetry }: { message: string; onRetry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  return (
    <main className="notfound">
      <LostPath />
      <section>
        <p className="rpg-label">Sin conexión</p>
        <h1 ref={heading} tabIndex={-1} style={{ outline: 'none' }}>No pudimos cargar las iglesias</h1>
        <p role="alert" className="muted" style={{ margin: '8px 0 18px' }}>{message}</p>
        <button type="button" className="rpg-button btn-primary" onClick={onRetry}>Reintentar</button>
        <p style={{ marginTop: 14 }}><a href="#/login" className="muted">Acceso del personal</a></p>
      </section>
    </main>
  )
}
