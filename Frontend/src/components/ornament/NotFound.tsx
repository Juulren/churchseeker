import { useEffect, useRef } from 'react'
import { useLostField } from './useLostField.ts'

/**
 * Unknown address: 404 drawn large in characters that scatter under the pointer, and a way back to the map that breaks
 * the numerals apart and lets them re-form on its way. The message and the button are plain HTML; without WebGL the kit
 * leaves its still poster of the numerals in the same place, and the link goes home at once.
 */
export default function NotFound() {
  const heading = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(true)
  const { art, play } = useLostField('404')
  useEffect(() => { heading.current?.focus(); mounted.current = true; return () => { mounted.current = false } }, [])

  const home = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // A modified click follows the link as usual.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    const here = window.location.hash
    // Only if the person is still on this page afterwards: Back or another link during the scatter wins.
    void play(e.currentTarget, () => { if (mounted.current && window.location.hash === here) window.location.hash = '#/' })
  }

  return (
    <main className="notfound">
      <div ref={art} className="notfound-art" aria-hidden="true" />
      <section>
        <p className="rpg-label">Error 404</p>
        <h1 ref={heading} tabIndex={-1} style={{ outline: 'none' }}>Este camino no existe</h1>
        <p className="muted" style={{ margin: '8px 0 18px' }}>La página que buscas no está aquí. Vuelve al mapa para encontrar una iglesia.</p>
        <a href="#/" onClick={home} className="rpg-button btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Volver al mapa</a>
      </section>
    </main>
  )
}
