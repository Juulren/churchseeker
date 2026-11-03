import { useEffect, useRef } from 'react'
import { LostPath } from './Illustrations.tsx'

/** Unknown address: a road running to an open doorway, and a way back to the map. */
export default function NotFound() {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  return (
    <main className="notfound">
      <LostPath />
      <section>
        <p className="rpg-label">Error 404</p>
        <h1 ref={heading} tabIndex={-1} style={{ outline: 'none' }}>Este camino no existe</h1>
        <p className="muted" style={{ margin: '8px 0 18px' }}>La página que buscas no está aquí. Vuelve al mapa para encontrar una iglesia.</p>
        <a href="#/" className="rpg-button btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Volver al mapa</a>
      </section>
    </main>
  )
}
