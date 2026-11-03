import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ORNAMENTS, rosettePaths, traceryPaths, trefoilPaths, type OrnamentName } from './geometry.ts'
import Ornament from './Ornament.tsx'

const names = Object.keys(ORNAMENTS) as OrnamentName[]

describe('ornament library', () => {
  it('only repeats an odd number of times, so it can never form a cross or a hexagram', () => {
    for (const n of names) {
      const { folds } = ORNAMENTS[n]
      expect([n, folds % 2 === 1]).toEqual([n, true])
      expect([n, folds % 4 !== 0 && folds % 6 !== 0]).toEqual([n, true])
    }
  })

  it('draws exactly as many petals and bars as its fold count says', () => {
    expect(rosettePaths(7, 120)).toHaveLength(2 + 7)
    expect(traceryPaths(7, 120)).toHaveLength(1 + 2 * 7)
    expect(trefoilPaths(80)).toHaveLength(3)
    expect(ORNAMENTS.rosette.paths()).toHaveLength(2 + ORNAMENTS.rosette.folds)
    expect(ORNAMENTS.tracery.paths()).toHaveLength(1 + 2 * ORNAMENTS.tracery.folds)
    expect(ORNAMENTS.trefoil.paths()).toHaveLength(ORNAMENTS.trefoil.folds)
  })

  it('has no quatrefoil and no four-lobed shape', () => {
    expect(names).not.toContain('quatrefoil')
    expect(trefoilPaths(80)).toHaveLength(3)
  })

  it('has no plus sign: no two straight horizontal and vertical strokes cross each other',  () => {
    type Seg = { x1: number; y1: number; x2: number; y2: number }
    const segs = (d: string): Seg[] => {
      const out: Seg[] = []
      let x = 0, y = 0
      for (const m of d.matchAll(/([MHVL])\s*(-?[\d.]+)(?:[\s,](-?[\d.]+))?/g)) {
        const [, c, a, b] = m
        let nx = x, ny = y
        if (c === 'M' || c === 'L') { nx = Number(a); ny = Number(b) } else if (c === 'H') nx = Number(a); else ny = Number(a)
        if (c !== 'M') out.push({ x1: x, y1: y, x2: nx, y2: ny })
        x = nx; y = ny
      }
      return out
    }
    for (const n of names) {
      const all = ORNAMENTS[n].paths().flatMap(segs)
      const horizontal = all.filter((s) => s.y1 === s.y2 && s.x1 !== s.x2)
      const vertical = all.filter((s) => s.x1 === s.x2 && s.y1 !== s.y2)
      for (const h of horizontal) for (const v of vertical) {
        const inside = (a: number, b: number, t: number) => t > Math.min(a, b) + 0.01 && t < Math.max(a, b) - 0.01
        expect([n, inside(h.x1, h.x2, v.x1) && inside(v.y1, v.y2, h.y1)]).toEqual([n, false])
      }
    }
  })

  it('keeps the doorway rays inside the opening', () => {
    const d = ORNAMENTS.doorway
    for (const p of d.paths().slice(2, 9)) for (const m of p.matchAll(/L(-?[\d.]+) (-?[\d.]+)/g)) {
      expect(Number(m[1])).toBeGreaterThan(0)
      expect(Number(m[1])).toBeLessThan(d.w)
    }
  })

  it('produces clean paths: not empty, and no NaN or Infinity', () => {
    for (const n of names) {
      const paths = ORNAMENTS[n].paths()
      expect(paths.length).toBeGreaterThan(0)
      for (const d of paths) { expect(d.startsWith('M')).toBe(true); expect(d).not.toMatch(/NaN|Infinity|undefined/) }
    }
  })

  it('stays small: at most 6 KB per ornament and 40 KB for the whole library', () => {
    let total = 0
    for (const n of names) {
      const bytes = ORNAMENTS[n].paths().join('').length
      expect([n, bytes <= 6000]).toEqual([n, true])
      total += bytes
    }
    expect(total).toBeLessThanOrEqual(40_000)
  })

  it('renders as decoration: hidden from assistive technology, not focusable, and never capturing the pointer', () => {
    for (const n of names) {
      const html = renderToStaticMarkup(<Ornament name={n} draw />)
      expect(html).toContain('aria-hidden="true"')
      expect(html).toContain('focusable="false"')
      expect(html).toContain('class="ornament')
      expect(html).not.toContain('tabindex')
      expect(html).not.toContain('role=')
    }
  })
})
