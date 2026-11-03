import { ORNAMENTS, type OrnamentName } from './geometry.ts'

interface Props {
  name: OrnamentName
  /** Width in pixels; the height follows the shape. */
  size?: number
  /** Draws the strokes in once, when it first appears. Off under reduced motion through the stylesheet. */
  draw?: boolean
  /** Slowly turns the ornament (rosette, tracery, trefoil). */
  turn?: boolean
  className?: string
}

/**
 * One ornament from the library, in the ink of the text around it. Decorative: hidden from assistive technology, it
 * never takes the pointer and never carries meaning by itself.
 */
export default function Ornament({ name, size = 96, draw = false, turn = false, className = '' }: Props) {
  const def = ORNAMENTS[name]
  const classes = ['ornament', draw ? 'ornament-draw' : '', turn ? 'ornament-turn' : '', className].filter(Boolean).join(' ')
  return (
    <svg className={classes} viewBox={'0 0 ' + def.w + ' ' + def.h} width={size} height={(size * def.h) / def.w} aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {def.paths().map((d, i) => <path key={i} d={d} pathLength={1} style={{ animationDelay: i * 70 + 'ms' }} />)}
    </svg>
  )
}
