import { describe, expect, it } from 'vitest'
import {
  AsciiRenderer, CELL_H, CELL_W, MAX_KOI, PALETTES, SEGMENTS, koiTiles, makeKoi, mulberry32, paletteFor, stepKoi, type Koi, type Skin, type Surface,
} from './asciiEngine.ts'

class FakeSurface implements Surface {
  fillStyle: string | CanvasGradient | CanvasPattern = ''
  font = ''
  textBaseline: CanvasTextBaseline = 'top'
  glyphs: string[] = []
  colours = new Set<string>()
  fillRect() { this.colours.add(String(this.fillStyle)) }
  setTransform() {}
  fillText(text: string, x: number, y: number) {
    expect(text).toHaveLength(1)
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    this.glyphs.push(text)
  }
}

const cheap = (): Surface => ({ fillStyle: '', font: '', textBaseline: 'top', fillRect() {}, fillText() {}, setTransform() {} })
const koiAt = (skin: Skin, x = 400, y = 300): Koi => ({ ...makeKoi(x, y, mulberry32(3), 0), skin })

describe('palettes', () => {
  it('are valid hex colours and fall back to the default', () => {
    for (const p of Object.values(PALETTES)) for (const c of [p.background, p.dim, p.bright]) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    expect(paletteFor('nope')).toBe(PALETTES.default)
    expect(paletteFor(undefined)).toBe(PALETTES.default)
    expect(paletteFor(null)).toBe(PALETTES.default)
  })

  it('stay almost black so the koi stand out, with a distinct tint per church', () => {
    for (const p of Object.values(PALETTES)) expect(parseInt(p.background.slice(1), 16)).toBeLessThan(0x101010)
    const ids = Object.keys(PALETTES).filter((k) => k !== 'default')
    expect(new Set(ids.map((i) => PALETTES[i].background)).size).toBe(3)
  })
})

describe('koiTiles', () => {
  it('makes a body of letter tiles on the grid, one tile per cell', () => {
    const tiles = koiTiles(koiAt('white'), 1)
    expect(tiles.length).toBeGreaterThan(30)
    expect(tiles.length).toBeLessThan(400)
    const keys = tiles.map((t) => `${t.col},${t.row}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const t of tiles) { expect(Number.isInteger(t.col) && Number.isInteger(t.row)).toBe(true); expect(t.glyph).toHaveLength(1) }
  })

  it('paints red patches on kohaku, gold on gold koi, never red on white ones', () => {
    const tones = (s: Skin) => new Set(koiTiles(koiAt(s), 0).map((t) => t.tone))
    expect(tones('kohaku').has('red')).toBe(true)
    expect(tones('gold').has('gold')).toBe(true)
    expect(tones('white').has('red')).toBe(false)
    expect(tones('white').has('gold')).toBe(false)
  })

  it('uses letters on bright tiles and punctuation on the dark outline', () => {
    for (const t of koiTiles(koiAt('kohaku'), 2)) {
      if (t.tone === 'dark' || t.tone === 'darkGold') expect(':+*.;').toContain(t.glyph)
      else expect('ZXzx%#o').toContain(t.glyph)
    }
  })

  it('is deterministic for the same koi and time', () => {
    expect(koiTiles(koiAt('gold'), 4.2)).toEqual(koiTiles(koiAt('gold'), 4.2))
  })
})

describe('stepKoi', () => {
  it('keeps every koi on screen and its body the same length for a long time', () => {
    const school = Array.from({ length: 5 }, (_, i) => makeKoi(100 + i * 120, 100 + i * 80, mulberry32(i + 1), i))
    for (let i = 0; i < 1200; i++) stepKoi(school, 1 / 60, 800, 600, i % 90 < 30 ? { x: 400, y: 300 } : null, i / 60)
    for (const k of school) {
      expect(k.spine).toHaveLength(SEGMENTS)
      for (const p of k.spine) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
        expect(p.x).toBeGreaterThanOrEqual(-60)
        expect(p.x).toBeLessThanOrEqual(860)
        expect(p.y).toBeGreaterThanOrEqual(-60)
        expect(p.y).toBeLessThanOrEqual(660)
      }
      const gap = Math.hypot(k.spine[1].x - k.spine[0].x, k.spine[1].y - k.spine[0].y)
      expect(gap).toBeCloseTo(CELL_W * 0.95 * k.scale, 3)
    }
  })

  it('does nothing for a zero step, an empty sea or a zero-size screen', () => {
    const school = [koiAt('white')]
    const before = JSON.stringify(school)
    stepKoi(school, 0, 800, 600, null, 0)
    expect(JSON.stringify(school)).toBe(before)
    expect(() => stepKoi(school, 1 / 60, 0, 0, null, 0)).not.toThrow()
    expect(() => stepKoi([], 1 / 60, 800, 600, null, 0)).not.toThrow()
  })

  it('survives NaN, negative and huge time steps', () => {
    for (const dt of [NaN, -5, Infinity, 1e9]) {
      const school = [koiAt('gold')]
      stepKoi(school, dt, 800, 600, null, 0)
      expect(Number.isFinite(school[0].spine[0].x)).toBe(true)
    }
  })

  it('makes room: a koi near the cursor ends up farther from it than one left alone', () => {
    const far = (pointer: boolean) => {
      const k = koiAt('white', 420, 300)
      k.heading = Math.PI // swimming straight at the cursor
      const p = { x: 330, y: 300 }
      for (let i = 0; i < 90; i++) stepKoi([k], 1 / 60, 2000, 2000, pointer ? p : null, i / 60)
      return Math.hypot(k.spine[0].x - p.x, k.spine[0].y - p.y)
    }
    expect(far(true)).toBeGreaterThan(far(false))
  })
})

describe('AsciiRenderer', () => {
  it('draws tiles with letters and several tile colours, and the school is capped', () => {
    const s = new FakeSurface()
    const r = new AsciiRenderer(s)
    r.resize(1280, 720, 1)
    r.draw(0)
    const painted = r.draw(16)
    expect(r.fishCount).toBeGreaterThanOrEqual(3)
    expect(r.fishCount).toBeLessThanOrEqual(MAX_KOI)
    expect(painted).toBeGreaterThan(50)
    expect(s.glyphs.length).toBeGreaterThan(50)
    expect(s.colours.size).toBeGreaterThan(3)
  })

  it('survives degenerate and hostile sizes', () => {
    const r = new AsciiRenderer(new FakeSurface())
    for (const [w, h, d] of [[0, 0, 1], [-10, -10, 1], [NaN, NaN, NaN], [Infinity, 100, 0], [1e9, 1e9, 99], [1, 1, -3]] as const)
      expect(() => { r.resize(w, h, d); r.draw(0); r.draw(16) }).not.toThrow()
    r.resize(1e9, 1e9, 2)
    expect(r.fishCount).toBeLessThanOrEqual(MAX_KOI)
  })

  it('keeps the work per frame flat on huge screens', () => {
    const r = new AsciiRenderer(cheap())
    r.resize(7680, 4320, 1)
    r.draw(0)
    r.draw(16)
    const started = performance.now()
    r.draw(33)
    expect(performance.now() - started).toBeLessThan(250)
  })

  it('ignores invalid pointers and times', () => {
    const r = new AsciiRenderer(new FakeSurface())
    r.resize(400, 300)
    r.setPointer({ x: NaN, y: 1 })
    expect(() => { r.draw(NaN); r.draw(Infinity); r.draw(-5) }).not.toThrow()
  })

  it('is deterministic for the same sequence of frames', () => {
    const run = () => {
      const s = new FakeSurface()
      const r = new AsciiRenderer(s)
      r.resize(900, 600)
      for (let i = 0; i < 30; i++) r.draw(i * 16)
      return JSON.stringify(r.koi) + s.glyphs.join('')
    }
    expect(run()).toBe(run())
  })

  it('swims slower with reduced motion', () => {
    const move = (reduced: boolean) => {
      const r = new AsciiRenderer(cheap(), reduced)
      r.resize(900, 600)
      r.draw(0)
      const start = r.koi.map((k) => ({ ...k.spine[0] }))
      for (let i = 1; i <= 30; i++) r.draw(i * 16)
      return r.koi.reduce((sum, k, i) => sum + Math.hypot(k.spine[0].x - start[i].x, k.spine[0].y - start[i].y), 0)
    }
    expect(move(true)).toBeLessThan(move(false))
  })

  it('aligns tiles to the grid', () => {
    expect(CELL_W).toBeGreaterThan(8)
    expect(CELL_H).toBeGreaterThan(CELL_W)
  })
})
