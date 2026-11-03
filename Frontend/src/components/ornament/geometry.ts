// The ornament library: SVG paths drawn in code, in a Gothic, Renaissance and sigil spirit. Nothing is loaded from outside.
//
// Symmetry rule (DESIGN.md): every ornament that repeats around a point repeats an ODD number of times. A pattern with
// 4-fold or 6-fold symmetry can form a cross or a hexagram, which belong to single traditions; an odd fold cannot.
// Shapes that only mirror left and right have fold 1. There is no quatrefoil and there are no figures.

export interface OrnamentDef {
  /** Rotational symmetry: 1 for a shape that only mirrors, otherwise an odd number. */
  folds: number
  /** Viewbox size. */
  w: number
  h: number
  /** One or more paths. Each is drawn with the same stroke so it can draw itself in. */
  paths: () => string[]
}

const f = (n: number) => Number(n.toFixed(2))
const polar = (cx: number, cy: number, r: number, a: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const

/** A lens-shaped petal from the centre to a radius, at an angle. */
function petal(cx: number, cy: number, r1: number, r2: number, a: number, width: number): string {
  const [x1, y1] = polar(cx, cy, r1, a)
  const [x2, y2] = polar(cx, cy, r2, a)
  const [c1x, c1y] = polar(cx, cy, (r1 + r2) / 2 + width, a - 0.5)
  const [c2x, c2y] = polar(cx, cy, (r1 + r2) / 2 + width, a + 0.5)
  return `M${f(x1)} ${f(y1)}Q${f(c1x)} ${f(c1y)} ${f(x2)} ${f(y2)}Q${f(c2x)} ${f(c2y)} ${f(x1)} ${f(y1)}`
}

const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0`

/** Pointed (ogival) arch: two arcs meeting at the apex, straight jambs below. */
export function archPath(w: number, h: number, inset = 0, dx = 0, dy = 0): string {
  const l = inset + dx, r = w - inset + dx, t = inset + dy, b = h - inset + dy
  const spring = t + (b - t) * 0.42
  const mid = w / 2 + dx
  return `M${f(l)} ${f(b)}L${f(l)} ${f(spring)}C${f(l)} ${f(t + (b - t) * 0.16)} ${f(w * 0.36 + dx)} ${f(t + (b - t) * 0.04)} ${f(mid)} ${f(t)}C${f(w * 0.64 + dx)} ${f(t + (b - t) * 0.04)} ${f(r)} ${f(t + (b - t) * 0.16)} ${f(r)} ${f(spring)}L${f(r)} ${f(b)}`
}

/** Rosette: a ring, an inner ring and `folds` petals. */
export function rosettePaths(folds: number, size: number): string[] {
  const c = size / 2
  const paths = [circle(c, c, size * 0.46), circle(c, c, size * 0.1)]
  for (let k = 0; k < folds; k++) {
    const a = (k * Math.PI * 2) / folds - Math.PI / 2
    paths.push(petal(c, c, size * 0.12, size * 0.42, a, size * 0.05))
  }
  return paths
}

/** Tracery: arcs between the petals, like the stone bars of a window. */
export function traceryPaths(folds: number, size: number): string[] {
  const c = size / 2
  const paths: string[] = [circle(c, c, size * 0.47)]
  for (let k = 0; k < folds; k++) {
    const a = (k * Math.PI * 2) / folds - Math.PI / 2
    const b = ((k + 1) * Math.PI * 2) / folds - Math.PI / 2
    const [x1, y1] = polar(c, c, size * 0.3, a)
    const [x2, y2] = polar(c, c, size * 0.3, b)
    const [mx, my] = polar(c, c, size * 0.46, (a + b) / 2)
    paths.push(`M${f(x1)} ${f(y1)}Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}`)
    paths.push(`M${f(c)} ${f(c)}L${f(x1)} ${f(y1)}`)
  }
  return paths
}

/** Trefoil: three overlapping lobes (3-fold). */
export function trefoilPaths(size: number): string[] {
  const c = size / 2
  const r = size * 0.2
  return [0, 1, 2].map((k) => { const [x, y] = polar(c, c, size * 0.2, (k * Math.PI * 2) / 3 - Math.PI / 2); return circle(x, y, r) })
}

/** A divider: two rules with a lozenge in the middle and a pair of small ticks. */
export function dividerPaths(w: number): string[] {
  const m = w / 2
  return [
    `M0 10H${f(m - 24)}`,
    `M${f(m + 24)} 10H${w}`,
    `M${f(m)} 2L${f(m + 8)} 10L${f(m)} 18L${f(m - 8)} 10Z`,
    `M${f(m - 24)} 6V14M${f(m + 24)} 6V14`,
  ]
}

/** A corner mark with a small curl, for the corners of a frame. */
export function cornerPath(size: number): string[] {
  return [`M0 ${size}V10Q0 0 10 0H${size}`, circle(14, 14, 2.5)]
}

/** A cartouche: a plaque with concave corners. */
export function cartouchePath(w: number, h: number): string[] {
  const n = 10
  return [`M${n} 0H${w - n}A${n} ${n} 0 0 0 ${w} ${n}V${h - n}A${n} ${n} 0 0 0 ${w - n} ${h}H${n}A${n} ${n} 0 0 0 0 ${h - n}V${n}A${n} ${n} 0 0 0 ${n} 0Z`]
}

/** A guilloche: two interlaced waves. */
export function guillochePaths(w: number, amp: number, waves: number): string[] {
  const pts = (phase: number) => {
    const out: string[] = []
    const steps = waves * 12
    for (let i = 0; i <= steps; i++) out.push(`${i ? 'L' : 'M'}${f((i / steps) * w)} ${f(amp + Math.sin((i / steps) * waves * Math.PI * 2 + phase) * amp)}`)
    return out.join('')
  }
  return [pts(0), pts(Math.PI)]
}

/** A doorway: a pointed arch with light rays in its opening and a threshold. The light is the symbol; nothing stands in it. */
export function doorwayPaths(w: number, h: number): string[] {
  const rays: string[] = []
  const fold = 7
  for (let k = 0; k < fold; k++) {
    const a = Math.PI + ((k + 0.5) * Math.PI) / fold
    const [x, y] = polar(w / 2, h * 0.88, h * 0.24, a)
    rays.push(`M${f(w / 2)} ${f(h * 0.88)}L${f(x)} ${f(y)}`)
  }
  return [archPath(w, h, 2), archPath(w * 0.78, h * 0.92, 2, w * 0.11, h * 0.08), ...rays, `M0 ${h}H${w}`, `M${f(w * 0.1)} ${f(h + 6)}H${f(w * 0.9)}`]
}

/** A lamp: a low bowl with a spout and a flame. */
export function lampPaths(size: number): string[] {
  const c = size / 2
  return [
    `M${f(c - 22)} ${f(size * 0.7)}Q${f(c)} ${f(size * 0.95)} ${f(c + 22)} ${f(size * 0.7)}Z`,
    `M${f(c + 22)} ${f(size * 0.7)}Q${f(c + 34)} ${f(size * 0.68)} ${f(c + 38)} ${f(size * 0.62)}`,
    `M${f(c + 34)} ${f(size * 0.6)}Q${f(c + 24)} ${f(size * 0.4)} ${f(c + 36)} ${f(size * 0.24)}Q${f(c + 46)} ${f(size * 0.4)} ${f(c + 34)} ${f(size * 0.6)}Z`,
    `M${f(c - 22)} ${f(size * 0.7)}H${f(c + 22)}`,
  ]
}

/** A road running to a doorway: two edges meeting at the horizon, with cross lines getting closer together. */
export function roadPaths(w: number, h: number): string[] {
  const horizon = h * 0.1
  const paths = [`M${f(w * 0.12)} ${h}L${f(w * 0.46)} ${f(horizon)}`, `M${f(w * 0.88)} ${h}L${f(w * 0.54)} ${f(horizon)}`]
  for (let i = 1; i <= 6; i++) {
    const t = 1 - 1 / (1 + i * 0.55)
    const y = horizon + (h - horizon) * (1 - t)
    const half = (w * 0.38 * (y - horizon)) / (h - horizon)
    paths.push(`M${f(w / 2 - half)} ${f(y)}H${f(w / 2 + half)}`)
  }
  return paths
}

/** The catalogue: every ornament with its symmetry, so the tests can check them all. */
export const ORNAMENTS: Record<string, OrnamentDef> = {
  arch: { folds: 1, w: 100, h: 140, paths: () => [archPath(100, 140, 2)] },
  rosette: { folds: 7, w: 120, h: 120, paths: () => rosettePaths(7, 120) },
  tracery: { folds: 7, w: 120, h: 120, paths: () => traceryPaths(7, 120) },
  trefoil: { folds: 3, w: 80, h: 80, paths: () => trefoilPaths(80) },
  divider: { folds: 1, w: 240, h: 20, paths: () => dividerPaths(240) },
  corner: { folds: 1, w: 40, h: 40, paths: () => cornerPath(40) },
  cartouche: { folds: 1, w: 200, h: 56, paths: () => cartouchePath(200, 56) },
  guilloche: { folds: 1, w: 240, h: 24, paths: () => guillochePaths(240, 8, 10) },
  doorway: { folds: 1, w: 120, h: 172, paths: () => doorwayPaths(120, 160) },
  lamp: { folds: 1, w: 100, h: 100, paths: () => lampPaths(100) },
  road: { folds: 1, w: 160, h: 120, paths: () => roadPaths(160, 120) },
}

export type OrnamentName = keyof typeof ORNAMENTS
