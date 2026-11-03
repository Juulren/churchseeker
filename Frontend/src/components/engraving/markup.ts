import { chooseFor } from './choose.ts'
import { SHEET_H, SHEET_W } from './draft.ts'
import { plateFor } from './plates.ts'

export interface EngravingOptions {
  /** Names the picture for assistive technology; leave out when something beside it already says it (it is then hidden). */
  label?: string
  /** The lines draw themselves in once, then the hatching comes up (stops under reduced motion). */
  draw?: boolean
  className?: string
}

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

const HATCHES = [['fine', 1.7, 0.7], ['medium', 2.6, 0.7], ['coarse', 3.8, 1.25]] as const

/**
 * A church as a line engraving, as SVG text: its front elevation in strokes, with parallel hatching for the shaded sides
 * and the dark openings, in the ink of the text around it. `uid` makes the hatch pattern ids unique on the page. The
 * only text that comes from outside is the label, and it is escaped.
 */
export function engravingMarkup(churchId: string, uid: string, opts: EngravingOptions = {}): string {
  const choice = chooseFor({ id: churchId })
  const plate = plateFor(choice.kind, choice.variation)
  const safe = uid.replace(/[^a-zA-Z0-9_-]/g, '')
  let line = 0
  const parts = plate.parts.map((p) => {
    if (p.kind === 'solid') return `<path d="${p.d}" fill="var(--engraving-ground, var(--stone))" stroke="none"/>`
    if (p.kind === 'line') {
      const delay = opts.draw ? ` style="animation-delay:${(line++ % 40) * 28}ms"` : ''
      return `<path d="${p.d}" pathLength="1"${opts.draw ? ' class="engraving-draw"' : ''}${delay}/>`
    }
    return `<path d="${p.d}" fill="url(#${safe}-${p.kind})" stroke="none"${opts.draw ? ' class="engraving-fade"' : ''}/>`
  }).join('')
  const defs = HATCHES.map(([kind, gap, w]) =>
    `<pattern id="${safe}-${kind}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="${gap / 2}" y1="0" x2="${gap / 2}" y2="${gap}" stroke="currentColor" stroke-width="${w}"/></pattern>`).join('')
  const access = opts.label ? ` role="img" aria-label="${escape(opts.label)}"` : ' aria-hidden="true"'
  return `<svg class="engraving ${escape(opts.className ?? '')}" viewBox="0 0 ${SHEET_W} ${SHEET_H}"${access} focusable="false" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMax meet"><defs>${defs}</defs>${parts}</svg>`
}
