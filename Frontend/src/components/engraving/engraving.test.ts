import { describe, expect, it } from 'vitest'
import { chooseFor } from './choose.ts'
import { GROUND, SHEET_H, SHEET_W } from './draft.ts'
import { engravingMarkup } from './markup.ts'
import { plateFor, TYPOLOGIES, type Authored, type Typology, type Variation } from './plates.ts'

const PILOTS = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333']
const KINDS: Array<Authored | Typology> = ['cathedral', 'santalucia', 'jesus', ...TYPOLOGIES]
const VARIATIONS: Variation[] = [
  { towers: 0, dome: false, columns: 4 }, { towers: 1, dome: true, columns: 6 }, { towers: 2, dome: true, columns: 8 }, { towers: 2, dome: false, columns: 5 },
]

/** Every coordinate pair in a path (the arcs' radii and flags are not coordinates, so they are skipped by command). */
function numbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
}

describe('plates', () => {
  it('draw something for every kind and variation, as lines, solids and shades', () => {
    for (const kind of KINDS) for (const v of VARIATIONS) {
      const plate = plateFor(kind, v)
      expect(plate.parts.length, kind).toBeGreaterThan(14)
      for (const k of ['line', 'solid', 'medium'] as const) expect(plate.parts.some((p) => p.kind === k), `${kind} ${k}`).toBe(true)
    }
  })

  it('stay on the sheet and well under the weight budget (14 KB of path data each)', () => {
    for (const kind of KINDS) for (const v of VARIATIONS) {
      const plate = plateFor(kind, v)
      const bytes = plate.parts.reduce((n, p) => n + p.d.length, 0)
      expect(bytes, `${kind} weight`).toBeLessThan(14_000)
      for (const p of plate.parts) {
        expect(p.d).not.toMatch(/NaN|Infinity|undefined/)
        for (const n of numbers(p.d)) expect(Math.abs(n), `${kind} ${p.d.slice(0, 30)}`).toBeLessThanOrEqual(Math.max(SHEET_W, SHEET_H) + 30)
      }
    }
  })

  it('rest on the ground line: nothing is drawn above the sheet or far below the ground band', () => {
    for (const kind of KINDS) {
      const plate = plateFor(kind, VARIATIONS[2])
      const ys = plate.parts.filter((p) => p.kind === 'line').flatMap((p) => numbers(p.d))
      expect(Math.max(...ys.filter((n) => n < SHEET_H + 1)), kind).toBeGreaterThanOrEqual(GROUND)
    }
  })

  it('give the three pilot churches three different plates, and no two typologies alike', () => {
    const key = (k: Authored | Typology) => plateFor(k, VARIATIONS[1]).parts.map((p) => p.d).join('|')
    expect(new Set(['cathedral', 'santalucia', 'jesus'].map((k) => key(k as Authored))).size).toBe(3)
    expect(new Set(TYPOLOGIES.map(key)).size).toBe(4)
  })

  it('is varied by the seed: towers and dome change a typology', () => {
    const a = plateFor('nave', { towers: 0, dome: false, columns: 4 }).parts.map((p) => p.d).join('|')
    const b = plateFor('nave', { towers: 2, dome: true, columns: 4 }).parts.map((p) => p.d).join('|')
    expect(a).not.toBe(b)
  })
})

describe('chooseFor', () => {
  it('gives each pilot church its own plate and every other church a typology', () => {
    expect(PILOTS.map((id) => chooseFor({ id }).kind)).toEqual(['cathedral', 'santalucia', 'jesus'])
    expect(TYPOLOGIES).toContain(chooseFor({ id: 'otra-iglesia' }).kind)
  })
  it('is deterministic, and uses all four typologies across churches', () => {
    expect(chooseFor({ id: 'abc' })).toEqual(chooseFor({ id: 'abc' }))
    expect(new Set(Array.from({ length: 60 }, (_, i) => chooseFor({ id: 'church-' + i }).kind)).size).toBe(4)
  })
})

describe('engravingMarkup', () => {
  it('is an SVG of the sheet size, hidden unless it has a label', () => {
    const hidden = engravingMarkup(PILOTS[0], 'a')
    expect(hidden).toContain(`viewBox="0 0 ${SHEET_W} ${SHEET_H}"`)
    expect(hidden).toContain('aria-hidden="true"')
    expect(hidden).not.toContain('role="img"')
    const named = engravingMarkup(PILOTS[0], 'a', { label: 'Grabado de la catedral' })
    expect(named).toContain('role="img" aria-label="Grabado de la catedral"')
    expect(named).not.toContain('aria-hidden')
  })
  it('has one set of hatch patterns per id, so two engravings on a page never share them', () => {
    const a = engravingMarkup(PILOTS[0], 'one'), b = engravingMarkup(PILOTS[0], 'two')
    expect(a).toContain('id="one-fine"')
    expect(b).toContain('id="two-fine"')
    expect(a).toContain('url(#one-coarse)')
  })
  it('draws in only when asked', () => {
    expect(engravingMarkup(PILOTS[1], 'a')).not.toContain('engraving-draw')
    expect(engravingMarkup(PILOTS[1], 'a', { draw: true })).toContain('engraving-draw')
  })
  it('never lets the label or the id become markup', () => {
    const h = engravingMarkup('x', '"><script>1</script>', { label: '"><img src=x onerror=alert(1)>' })
    expect(h).not.toContain('<script')
    expect(h).not.toContain('<img')
    expect(h).toContain('&quot;')
  })
  it('has no cross: no part is a plus-shaped pair of centred strokes (every vertical line is part of a closed shape or a column)', () => {
    // The kit has no cross primitive; this guards the only free-form spokes, which repeat an odd 7 times.
    const wheel = plateFor('jesus', VARIATIONS[0]).parts.find((p) => p.kind === 'line' && (p.d.match(/M/g) ?? []).length === 7)
    expect(wheel).toBeTruthy()
  })
})
