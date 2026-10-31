import { describe, expect, it } from 'vitest'
import {
  AsciiRenderer, MAX_BUBBLES, MAX_FISH, PALETTES, buildColors, mulberry32, paletteFor, stepSchool, type Fish, type Surface,
} from './asciiEngine.ts'

class FakeSurface implements Surface {
  fillStyle: string | CanvasGradient | CanvasPattern = ''
  font = ''
  textBaseline: CanvasTextBaseline = 'top'
  strings: string[] = []
  fillRect() {}
  setTransform() {}
  fillText(text: string, x: number, y: number) {
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    this.strings.push(text)
  }
}

const cheap = (): Surface => ({ fillStyle: '', font: '', textBaseline: 'top', fillRect() {}, fillText() {}, setTransform() {} })

const school = (n: number, w = 800, h = 600): Fish[] => {
  const r = mulberry32(7)
  return Array.from({ length: n }, () => ({ x: r() * w, y: r() * h, vx: (r() - 0.5) * 100, vy: (r() - 0.5) * 20, phase: r() * 6, big: r() < 0.1 }))
}

describe('palettes', () => {
  it('are valid hex colours, close to white, and fall back to the default', () => {
    for (const p of Object.values(PALETTES))
      for (const c of [p.background, p.dim, p.bright]) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    for (const p of Object.values(PALETTES)) expect(parseInt(p.bright.slice(1), 16)).toBeGreaterThan(0xe0e0e0)
    expect(paletteFor('nope')).toBe(PALETTES.default)
    expect(paletteFor(undefined)).toBe(PALETTES.default)
    expect(paletteFor(null)).toBe(PALETTES.default)
  })

  it('builds three tones and gives each pilot church its own tint', () => {
    expect(buildColors(PALETTES.default)).toHaveLength(3)
    const ids = Object.keys(PALETTES).filter((k) => k !== 'default')
    expect(new Set(ids.map((i) => PALETTES[i].background)).size).toBe(3)
  })
})

describe('stepSchool', () => {
  it('keeps every fish inside the water and moving at a sane speed for a long time', () => {
    const fish = school(150)
    for (let i = 0; i < 600; i++) stepSchool(fish, 1 / 60, 800, 600, i % 50 < 25 ? { x: 400, y: 300 } : null, i / 60)
    for (const f of fish) {
      expect(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.vx) && Number.isFinite(f.vy)).toBe(true)
      expect(f.x).toBeGreaterThanOrEqual(-31)
      expect(f.x).toBeLessThanOrEqual(831)
      expect(f.y).toBeGreaterThanOrEqual(0)
      expect(f.y).toBeLessThanOrEqual(600)
      expect(Math.hypot(f.vx, f.vy)).toBeLessThan(120)
    }
  })

  it('moves the fish, and does nothing for a zero step or an empty sea', () => {
    const fish = school(20)
    const before = JSON.stringify(fish)
    stepSchool(fish, 0, 800, 600, null, 0)
    expect(JSON.stringify(fish)).toBe(before)
    stepSchool(fish, 1 / 60, 800, 600, null, 0)
    expect(JSON.stringify(fish)).not.toBe(before)
    expect(() => stepSchool(fish, 1 / 60, 0, 0, null, 0)).not.toThrow()
    expect(() => stepSchool([], 1 / 60, 800, 600, null, 0)).not.toThrow()
  })

  it('survives NaN, negative and huge time steps', () => {
    for (const dt of [NaN, -5, Infinity, 1e9]) {
      const fish = school(30)
      stepSchool(fish, dt, 800, 600, null, 0)
      for (const f of fish) expect(Number.isFinite(f.x) && Number.isFinite(f.y)).toBe(true)
    }
  })

  it('scares fish away from the cursor', () => {
    const fish: Fish[] = [{ x: 410, y: 300, vx: 0, vy: 0, phase: 0, big: false }]
    for (let i = 0; i < 20; i++) stepSchool(fish, 1 / 60, 800, 600, { x: 400, y: 300 }, 0)
    expect(fish[0].x).toBeGreaterThan(420)
  })

  it('keeps a school together (cohesion) rather than scattering it', () => {
    const fish = school(40, 300, 200)
    const spread = () => { const cx = fish.reduce((s, f) => s + f.x, 0) / fish.length; return Math.sqrt(fish.reduce((s, f) => s + (f.x - cx) ** 2, 0) / fish.length) }
    for (let i = 0; i < 300; i++) stepSchool(fish, 1 / 60, 3000, 3000, null, i / 60)
    expect(spread()).toBeLessThan(2500)
  })
})

describe('AsciiRenderer', () => {
  it('paints fish and bubbles as strings, and the school is capped', () => {
    const s = new FakeSurface()
    const r = new AsciiRenderer(s)
    r.resize(1280, 720, 1)
    r.draw(0)
    r.draw(16)
    expect(r.fishCount).toBeGreaterThanOrEqual(30)
    expect(r.fishCount).toBeLessThanOrEqual(MAX_FISH)
    expect(s.strings.some((t) => t === '><>' || t === '<><' || t === '>=>' || t === '<=<' || t.includes('(((') || t.includes(')))'))).toBe(true)
    expect(s.strings.some((t) => t === '.' || t === 'o')).toBe(true)
  })

  it('survives degenerate and hostile sizes', () => {
    const r = new AsciiRenderer(new FakeSurface())
    for (const [w, h, d] of [[0, 0, 1], [-10, -10, 1], [NaN, NaN, NaN], [Infinity, 100, 0], [1e9, 1e9, 99], [1, 1, -3]] as const)
      expect(() => { r.resize(w, h, d); r.draw(0); r.draw(16) }).not.toThrow()
    r.resize(1e9, 1e9, 2)
    expect(r.fishCount).toBeLessThanOrEqual(MAX_FISH)
  })

  it('keeps the work per frame flat on huge screens', () => {
    const r = new AsciiRenderer(cheap())
    r.resize(7680, 4320, 1)
    r.draw(0)
    r.draw(16)
    const started = performance.now()
    const painted = r.draw(33)
    expect(painted).toBeLessThanOrEqual(MAX_FISH + MAX_BUBBLES)
    expect(performance.now() - started).toBeLessThan(200)
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
      r.resize(600, 400)
      for (let i = 0; i < 30; i++) r.draw(i * 16)
      return JSON.stringify(r.school) + s.strings.join('')
    }
    expect(run()).toBe(run())
  })

  it('swims slower with reduced motion', () => {
    const move = (reduced: boolean) => {
      const r = new AsciiRenderer(cheap(), reduced)
      r.resize(600, 400)
      r.draw(0)
      const start = r.school.map((f) => ({ x: f.x, y: f.y }))
      for (let i = 1; i <= 30; i++) r.draw(i * 16)
      return r.school.reduce((s, f, i) => s + Math.hypot(f.x - start[i].x, f.y - start[i].y), 0)
    }
    expect(move(true)).toBeLessThan(move(false))
  })

  it('changes the colours when the palette changes', () => {
    const s = new FakeSurface()
    const r = new AsciiRenderer(s)
    r.resize(300, 200)
    r.draw(0)
    const before = s.fillStyle
    r.setPalette(PALETTES['22222222-2222-2222-2222-222222222222'])
    r.draw(16)
    expect(s.fillStyle).not.toBe(before)
  })
})
