// A sigil for each church, drawn from its name. It is seven-fold symmetric on purpose: a pattern repeated seven times
// around a point can never contain a cross (four-fold) or a hexagram (six-fold), so it cannot be taken for the emblem
// of one tradition. The name only decides which marks are used and how far they reach.

export const SIGIL_FOLD = 7

export interface SigilMark { kind: 'line' | 'petal' | 'dot' | 'ring'; r1: number; r2: number; spread: number }

function hash(text: string): number {
  let h = 2166136261
  for (const ch of text.normalize('NFC').toLowerCase()) { h ^= ch.codePointAt(0) ?? 0; h = Math.imul(h, 16777619) >>> 0 }
  return h >>> 0
}

function next(state: { v: number }): number {
  state.v = (Math.imul(state.v, 1664525) + 1013904223) >>> 0
  return state.v / 4294967296
}

/** The marks of one sector. The sigil is this sector rotated seven times. */
export function sigilMarks(name: string): SigilMark[] {
  const s = { v: hash(name) || 1 }
  const kinds: SigilMark['kind'][] = ['line', 'petal', 'dot', 'ring']
  const marks: SigilMark[] = []
  const count = 3 + Math.floor(next(s) * 3)
  for (let i = 0; i < count; i++) {
    const r1 = 0.18 + next(s) * 0.3
    marks.push({ kind: kinds[Math.floor(next(s) * kinds.length)], r1, r2: Math.min(0.95, r1 + 0.12 + next(s) * 0.35), spread: (next(s) - 0.5) * 0.5 })
  }
  return marks
}

const f = (n: number) => n.toFixed(2)

/** SVG path data on a 100 by 100 grid, centred at 50,50. */
export function sigilPath(name: string): string {
  const parts: string[] = []
  const sector = (Math.PI * 2) / SIGIL_FOLD
  for (let k = 0; k < SIGIL_FOLD; k++) {
    const base = k * sector - Math.PI / 2
    for (const m of sigilMarks(name)) {
      const a = base + m.spread * sector
      const x1 = 50 + Math.cos(a) * m.r1 * 48, y1 = 50 + Math.sin(a) * m.r1 * 48
      const x2 = 50 + Math.cos(a) * m.r2 * 48, y2 = 50 + Math.sin(a) * m.r2 * 48
      if (m.kind === 'line') parts.push(`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`)
      else if (m.kind === 'petal') {
        const w = 0.22 * sector
        const cx1 = 50 + Math.cos(a - w) * m.r2 * 52, cy1 = 50 + Math.sin(a - w) * m.r2 * 52
        const cx2 = 50 + Math.cos(a + w) * m.r2 * 52, cy2 = 50 + Math.sin(a + w) * m.r2 * 52
        parts.push(`M${f(x1)} ${f(y1)}Q${f(cx1)} ${f(cy1)} ${f(x2)} ${f(y2)}Q${f(cx2)} ${f(cy2)} ${f(x1)} ${f(y1)}`)
      } else if (m.kind === 'dot') parts.push(`M${f(x2 - 1.6)} ${f(y2)}a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0`)
      else parts.push(`M${f(x1 + (x2 - x1) / 2 - 3)} ${f(y1 + (y2 - y1) / 2)}a3 3 0 1 0 6 0a3 3 0 1 0 -6 0`)
    }
  }
  return parts.join('')
}
