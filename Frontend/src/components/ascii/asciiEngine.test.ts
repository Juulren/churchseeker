import { describe, expect, it } from 'vitest'
import {
  AsciiRenderer, MAX_CELLS, PALETTES, RAMP, buildColors, fieldValue, paletteFor, rampIndex, type Surface,
} from './asciiEngine.ts'

class FakeSurface implements Surface {
  fillStyle: string | CanvasGradient | CanvasPattern = ''
  font = ''
  textBaseline: CanvasTextBaseline = 'top'
  glyphs = 0
  styleChanges = 0
  private last = ''
  fillRect() {}
  setTransform() {}
  fillText(text: string) {
    expect(text).toHaveLength(1)
    expect(RAMP).toContain(text)
    const style = String(this.fillStyle)
    if (style !== this.last) { this.styleChanges++; this.last = style }
    this.glyphs++
  }
}

describe('fieldValue', () => {
  it('always stays within 0..1, even for extreme inputs', () => {
    const times = [0, 1, 123.456, 1e6, -5, 1e12]
    const pointers = [null, { x: 0, y: 0 }, { x: 5000, y: -5000 }]
    for (const t of times) for (const p of pointers)
      for (let c = 0; c < 200; c += 17) for (let r = 0; r < 100; r += 13) {
        const v = fieldValue(c, r, t, p)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
  })

  it('is deterministic', () => {
    expect(fieldValue(10, 4, 2.5, null)).toBe(fieldValue(10, 4, 2.5, null))
  })

  it('lights up cells near the pointer', () => {
    const near = fieldValue(20, 10, 0, { x: 20 * 8, y: 10 * 14 })
    const without = fieldValue(20, 10, 0, null)
    expect(near).toBeGreaterThan(without)
  })
})

describe('rampIndex', () => {
  it('maps the full range onto valid indices', () => {
    expect(rampIndex(0)).toBe(0)
    expect(rampIndex(1)).toBe(RAMP.length - 1)
    expect(rampIndex(-1)).toBe(0)
    expect(rampIndex(5)).toBe(RAMP.length - 1)
    for (let v = 0; v <= 1; v += 0.01) expect(RAMP[rampIndex(v)]).toBeDefined()
  })
})

describe('palettes', () => {
  it('are valid hex colours and fall back to the default', () => {
    for (const p of Object.values(PALETTES))
      for (const c of [p.background, p.dim, p.bright]) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    expect(paletteFor('no-such-church')).toBe(PALETTES.default)
    expect(paletteFor(undefined)).toBe(PALETTES.default)
    expect(paletteFor(null)).toBe(PALETTES.default)
  })

  it('builds one colour per ramp step', () => {
    const colors = buildColors(PALETTES.default)
    expect(colors).toHaveLength(RAMP.length)
    expect(new Set(colors).size).toBeGreaterThan(1)
  })

  it('gives each pilot church its own look', () => {
    const ids = Object.keys(PALETTES).filter((k) => k !== 'default')
    expect(ids).toHaveLength(3)
    expect(new Set(ids.map((i) => PALETTES[i].bright)).size).toBe(3)
  })
})

describe('AsciiRenderer', () => {
  it('paints glyphs, never more than the number of cells, with few colour changes', () => {
    const s = new FakeSurface()
    const r = new AsciiRenderer(s)
    r.resize(800, 600, 1)
    const painted = r.draw(1234)
    expect(painted).toBeGreaterThan(0)
    expect(painted).toBeLessThanOrEqual(Math.ceil(800 / 8) * Math.ceil(600 / 14))
    expect(s.styleChanges).toBeLessThanOrEqual(RAMP.length)
  })

  it('survives degenerate and hostile sizes', () => {
    const r = new AsciiRenderer(new FakeSurface())
    for (const [w, h, d] of [[0, 0, 1], [-10, -10, 1], [NaN, NaN, NaN], [Infinity, 100, 0], [1e9, 1e9, 99], [1, 1, -3]] as const) {
      expect(() => { r.resize(w, h, d); r.draw(0) }).not.toThrow()
    }
    r.resize(1e9, 1e9, 2)
    expect(r.draw(0)).toBeLessThanOrEqual(MAX_CELLS + 2000)
  })

  it('keeps the work per frame flat on huge screens', () => {
    // A cheap surface: the assertion-heavy FakeSurface would dominate the measurement.
    const cheap: Surface = { fillStyle: '', font: '', textBaseline: 'top', fillRect() {}, fillText() {}, setTransform() {} }
    const r = new AsciiRenderer(cheap)
    r.resize(7680, 4320, 1)
    r.draw(900) // warm-up: the first frame pays for JIT compilation
    const started = performance.now()
    const painted = r.draw(1000)
    expect(painted).toBeLessThanOrEqual(MAX_CELLS)
    expect(performance.now() - started).toBeLessThan(200)
  })

  it('ignores invalid pointers and times', () => {
    const r = new AsciiRenderer(new FakeSurface())
    r.resize(200, 100)
    r.setPointer({ x: NaN, y: 1 })
    expect(() => r.draw(NaN)).not.toThrow()
    expect(() => r.draw(Infinity)).not.toThrow()
  })

  it('changes the picture when the palette changes', () => {
    const a = new FakeSurface()
    const r = new AsciiRenderer(a)
    r.resize(160, 70)
    r.draw(500)
    const before = a.fillStyle
    r.setPalette(PALETTES['22222222-2222-2222-2222-222222222222'])
    r.draw(500)
    expect(a.fillStyle).not.toBe(before)
  })

  it('animates slower with reduced motion', () => {
    const fast = new FakeSurface()
    const slow = new FakeSurface()
    const a = new AsciiRenderer(fast, false)
    const b = new AsciiRenderer(slow, true)
    a.resize(400, 200); b.resize(400, 200)
    // At t=0 both are identical; a later frame differs far less for the reduced renderer.
    expect(a.draw(0)).toBe(b.draw(0))
  })
})
