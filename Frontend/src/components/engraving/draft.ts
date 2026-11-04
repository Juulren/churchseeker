// The drawing kit for church engravings: a plate is a list of parts drawn back to front on a 240 by 180 sheet. Lines are
// strokes in the ink of the text around them, solids hide what stands behind them (so a dome can sit behind a facade
// without lines showing through), and shades are fine parallel hatching, the way an engraver models a surface. No
// part is a cross, a crescent or a figure; anything that repeats around a point repeats an odd number of times.

export const SHEET_W = 240
export const SHEET_H = 180
/** The ground line every church stands on. */
export const GROUND = 158

export type PartKind = 'line' | 'solid' | 'fine' | 'medium' | 'coarse'
export interface Part { d: string; kind: PartKind }

const f = (n: number) => Number(n.toFixed(1))

export const rect = (x: number, y: number, w: number, h: number) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`
export const hline = (x1: number, x2: number, y: number) => `M${f(x1)} ${f(y)}H${f(x2)}`

/** A round-headed opening from its base: jambs and a half circle. */
export function roundArch(cx: number, base: number, w: number, h: number): string {
  const r = w / 2
  return `M${f(cx - r)} ${f(base)}V${f(base - h + r)}A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(base - h + r)}V${f(base)}Z`
}

/** A pointed (ogival) opening from its base. */
export function pointedArch(cx: number, base: number, w: number, h: number): string {
  const l = cx - w / 2, r = cx + w / 2, top = base - h, spring = top + h * 0.42
  return `M${f(l)} ${f(base)}V${f(spring)}Q${f(l)} ${f(top + h * 0.12)} ${f(cx)} ${f(top)}Q${f(r)} ${f(top + h * 0.12)} ${f(r)} ${f(spring)}V${f(base)}Z`
}

/** A triangular pediment standing on a base line. */
export const pediment = (x: number, base: number, w: number, rise: number) => `M${f(x)} ${f(base)}L${f(x + w / 2)} ${f(base - rise)}L${f(x + w)} ${f(base)}Z`

/** A half-ellipse dome standing on a base line. */
export const dome = (cx: number, base: number, r: number, rise: number) => `M${f(cx - r)} ${f(base)}A${f(r)} ${f(rise)} 0 0 1 ${f(cx + r)} ${f(base)}Z`

/** The right half of a dome: the side away from the light. */
export const domeShade = (cx: number, base: number, r: number, rise: number) => `M${f(cx)} ${f(base)}H${f(cx + r)}A${f(r)} ${f(rise)} 0 0 0 ${f(cx)} ${f(base - rise)}Z`

/** Seven ribs from the foot of a dome to its crown (an odd number, the middle one straight). */
export function ribs(cx: number, base: number, r: number, rise: number, n = 7): string {
  const out: string[] = []
  for (let k = 0; k < n; k++) {
    const dx = (-1 + (2 * (k + 1)) / (n + 1)) * r * 0.96
    out.push(`M${f(cx + dx)} ${f(base - rise * Math.sqrt(Math.max(0, 1 - (dx / r) ** 2)))}Q${f(cx + dx * 0.7)} ${f(base - rise * 1.05)} ${f(cx)} ${f(base - rise)}`)
  }
  return out.join('')
}

/** A small ball on a stem, the finial that crowns spires, gables and domes. */
export const ball = (cx: number, y: number, r = 2) => `M${f(cx - r)} ${f(y)}a${r} ${r} 0 1 0 ${f(r * 2)} 0a${r} ${r} 0 1 0 ${f(-r * 2)} 0`

/** Evenly spaced columns between two x positions, each a shaft with a base and a capital. */
export function columns(x0: number, x1: number, n: number, base: number, top: number, w = 3.2): string {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1)
    out.push(`M${f(x - w / 2)} ${f(base)}V${f(top)}M${f(x + w / 2)} ${f(base)}V${f(top)}M${f(x - w)} ${f(base)}h${f(w * 2)}M${f(x - w)} ${f(top)}h${f(w * 2)}`)
  }
  return out.join('')
}

/** A slender tower with a belfry opening, a cornice and a pyramid roof ending in a ball. */
export function tower(d: Draft, cx: number, base: number, w: number, top: number, spire = 16): void {
  const belfryH = Math.max(18, (base - top) * 0.28)
  const shaftTop = top + belfryH
  const bw = w - 6
  d.solid(rect(cx - w / 2, shaftTop, w, base - shaftTop))
  d.line(rect(cx - w / 2 - 2, shaftTop - 3, w + 4, 3))
  d.solid(rect(cx - bw / 2, top + 4, bw, belfryH - 7))
  d.line(rect(cx - bw / 2 - 1.5, top + 1.5, bw + 3, 2.5))
  d.shade('coarse', roundArch(cx, shaftTop - 5, Math.min(10, bw - 6), Math.min(16, belfryH - 10)))
  d.solid(pediment(cx - bw / 2 - 1, top + 1.5, bw + 2, spire))
  d.line(ball(cx, top - spire - 1.2, 1.8))
  d.shade('medium', rect(cx + w * 0.16, shaftTop, w * 0.34, base - shaftTop))
  d.shade('medium', rect(cx + bw * 0.16, top + 4, bw * 0.34, belfryH - 7))
  // Two slits in the shaft.
  for (const y of [shaftTop + (base - shaftTop) * 0.35, shaftTop + (base - shaftTop) * 0.65]) d.shade('coarse', roundArch(cx, y + 8, 5, 14))
}

export class Draft {
  readonly parts: Part[] = []
  solid(d: string) { this.parts.push({ d, kind: 'solid' }); this.parts.push({ d, kind: 'line' }) }
  line(d: string) { this.parts.push({ d, kind: 'line' }) }
  shade(kind: 'fine' | 'medium' | 'coarse', d: string) { this.parts.push({ d, kind }) }
  /** The ground the church stands on: a firm line with a band of fine hatching under it and a few ground strokes. */
  ground(x0 = 14, x1 = SHEET_W - 14) {
    this.line(hline(x0, x1, GROUND))
    this.line(hline(x0 + 10, x1 - 10, GROUND + 3))
    this.shade('fine', rect(x0, GROUND + 4, x1 - x0, 6))
  }
}

/** Everything a plate needs to be drawn. */
export interface Plate { parts: Part[] }

export const plateOf = (d: Draft): Plate => ({ parts: d.parts })
