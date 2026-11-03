import { useRef } from 'react'
import { useKit } from '../ascii/useKit.ts'
import Sigil from './Sigil.tsx'
import { sigilPath } from './sigil.ts'

/**
 * A church's sigil that condenses out of characters into lines when it first appears. It is a full Asciify field, so it
 * is the one surface of the page; without WebGL (or under reduced motion) the plain SVG sigil stays as it is.
 */
export default function SigilMorph({ name, size = 88 }: { name: string; size?: number }) {
  const box = useRef<HTMLDivElement>(null)
  useKit(box, (kit, el) => {
    // Reduced motion: the plain SVG sigil is all there is.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null
    const d = sigilPath(name)
    const draw = (pen: CanvasRenderingContext2D, w: number, h: number) => {
      pen.save()
      pen.scale(w / 100, h / 100)
      pen.strokeStyle = '#fff'
      pen.lineWidth = 3
      pen.lineCap = 'round'
      pen.beginPath(); pen.arc(50, 50, 47, 0, Math.PI * 2); pen.stroke()
      pen.stroke(new Path2D(d))
      pen.restore()
    }
    const handle = kit.morphField(el, { sources: [() => { /* blank: the field starts empty */ }, draw], autoplay: false, hold: 600, transition: 1400, look: { cellSize: 3 }, label: 'Sigilo de ' + name })
    if (!handle.supported) return handle
    const svg = el.querySelector<SVGElement>('svg')
    if (svg) svg.style.visibility = 'hidden'
    handle.go(1)
    return { destroy: () => { if (svg) svg.style.visibility = ''; handle.destroy() } }
  }, [name])
  return <div ref={box} className="sigil-morph" style={{ width: size, height: size }}><Sigil name={name} size={size} /></div>
}
