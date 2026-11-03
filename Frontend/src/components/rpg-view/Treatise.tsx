import { useMemo } from 'react'
import { AUTHORED, type AuthoredKind } from '../map3d/kit/registry.ts'
import { isUploadedModel } from '../map3d/churchObject.ts'
import type { ChurchStyle } from '../map3d/churchStyles.ts'
import { buildDrawings, rectPaths, type Drawings } from './drawings.ts'

/** One drawing sheet: the outlines, the lighter openings and two dimension marks, with the real size in metres. */
function Sheet({ title, d, view }: { title: string; d: Drawings; view: 'plan' | 'elevation' }) {
  const pad = 6
  const w = d.width
  const h = view === 'plan' ? d.depth : d.height
  const rects = view === 'plan' ? d.plan : d.elevation
  const minX = -d.width / 2
  const paths = view === 'plan'
    ? rectPaths(rects, (x) => x - minX, (z) => d.depth / 2 - z) // front of the church at the bottom
    : rectPaths(rects, (x) => x - minX, (y) => d.height - y)
  return (
    <figure className="treatise-sheet">
      <svg viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2 + 5}`} role="img" aria-label={`${title}: ${w.toFixed(0)} por ${h.toFixed(0)} metros`} fill="none" stroke="currentColor" strokeWidth="0.35" strokeLinejoin="round">
        <path d={paths.solid} />
        <path d={paths.light} opacity="0.55" />
        <path d={`M0 ${h + 3}H${w}M0 ${h + 2}V${h + 4}M${w} ${h + 2}V${h + 4}`} opacity="0.7" />
        <text x={w / 2} y={h + 7.2} textAnchor="middle" fontSize="3" fill="currentColor" stroke="none">{w.toFixed(0)} m</text>
      </svg>
      <figcaption className="rpg-label">{title}</figcaption>
    </figure>
  )
}

// Built once per church, however many times the page is opened.
const cache = new Map<AuthoredKind, Drawings>()
const drawingsFor = (kind: AuthoredKind): Drawings => {
  if (!cache.has(kind)) cache.set(kind, buildDrawings(AUTHORED[kind].build('high')))
  return cache.get(kind)!
}

/**
 * Planta and alzado of an authored church, drawn from its own model. Not shown for a church whose administrator uploaded a
 * scan: the 3D view shows the scan, and drawings of a different model would contradict it.
 */
export default function Treatise({ style, modelUrl }: { style: ChurchStyle; modelUrl: string | null }) {
  const kind = style.authored && !isUploadedModel(modelUrl) ? style.authored : null
  const drawings = useMemo(() => (kind ? drawingsFor(kind) : null), [kind])
  if (!kind || !drawings) return null
  return (
    <section className="treatise" aria-label="Planta y alzado">
      <Sheet title="Planta" d={drawings} view="plan" />
      <Sheet title="Alzado" d={drawings} view="elevation" />
      <p className="muted treatise-note">
        {AUTHORED[kind].sizes === 'published'
          ? 'Largo, ancho y altura de las torres según cifras publicadas; el resto del dibujo es una interpretación de fotografías.'
          : 'Medidas interpretadas a partir de fotografías: no es un levantamiento.'}
      </p>
    </section>
  )
}
