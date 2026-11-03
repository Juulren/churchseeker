import { useEffect, useRef } from 'react'
import type { FieldBackgroundHandle } from 'asciify-engine/kit'
import { useKit } from '../ascii/useKit.ts'

/**
 * Unknown address: 404 drawn large in characters that scatter under the pointer, and a way back to the map that breaks
 * the numerals apart and lets them re-form on its way. The message and the button are plain HTML; without WebGL the kit
 * leaves its still poster of the numerals in the same place, and the link goes home at once.
 */
export default function NotFound() {
  const heading = useRef<HTMLHeadingElement>(null)
  const art = useRef<HTMLDivElement>(null)
  const lost = useRef<FieldBackgroundHandle | null>(null)
  const going = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { heading.current?.focus(); mounted.current = true; return () => { mounted.current = false } }, [])
  useKit(art, (kit, el) => {
    const handle = kit.fieldBackground(el, { preset: 'notFound', text: '404' })
    lost.current = handle
    return { destroy: () => { lost.current = null; handle.destroy() } }
  }, [])

  const home = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    const field = lost.current
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // A modified click, no field to play or reduced motion: the browser follows the link as usual.
    if (!field || still || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    if (going.current) return
    going.current = true
    const here = window.location.hash
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([field.scatter(e.currentTarget), new Promise((r) => { timer = setTimeout(r, 1800) })])
    } catch { /* go home anyway */ }
    clearTimeout(timer)
    going.current = false
    // Only if the person is still on this page: Back or another link during the scatter wins.
    if (mounted.current && window.location.hash === here) window.location.hash = '#/'
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
