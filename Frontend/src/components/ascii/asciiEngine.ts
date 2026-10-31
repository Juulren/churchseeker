// Pure rendering logic for the animated ASCII background: schools of fish swimming through a dark sea.
// It has no DOM dependency, so it runs unchanged inside a Web Worker (OffscreenCanvas) or on the main thread.

export interface Palette {
  background: string
  dim: string
  bright: string
}

export const PALETTES: Record<string, Palette> = {
  default: { background: '#050b14', dim: '#2a4560', bright: '#ffffff' },
  // One tint per pilot church (ids from the database seed), always close to white.
  '11111111-1111-1111-1111-111111111111': { background: '#0c0a08', dim: '#5a4d3c', bright: '#fff4e2' },
  '22222222-2222-2222-2222-222222222222': { background: '#041214', dim: '#2a5a60', bright: '#e4fffa' },
  '33333333-3333-3333-3333-333333333333': { background: '#0a0716', dim: '#4a3d6e', bright: '#f1e9ff' },
}

export const paletteFor = (churchId?: string | null): Palette =>
  (churchId && PALETTES[churchId]) || PALETTES.default

export const FONT_PX = 14
export const MAX_FISH = 220
export const MAX_BUBBLES = 120
const MAX_DIM = 8192

export interface Pointer { x: number; y: number }

export interface Fish {
  x: number
  y: number
  vx: number
  vy: number
  phase: number
  big: boolean
}

// Small seeded PRNG: the school starts the same way in every test.
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  const n = m ? parseInt(m[1], 16) : 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Three tones between `dim` and `bright`: far/slow, middle and near/fast creatures. */
export function buildColors(p: Palette): string[] {
  const a = hexToRgb(p.dim)
  const b = hexToRgb(p.bright)
  return [0.35, 0.7, 1].map((k) => {
    const c = a.map((x, j) => Math.round(x + (b[j] - x) * k))
    return `rgb(${c[0]},${c[1]},${c[2]})`
  })
}

const SPEED_MIN = 38
const SPEED_MAX = 92
const SIGHT = 110
const SEPARATION = 26
const FLEE_RADIUS = 150

const clampNum = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n)

/** Boids: separation, alignment, cohesion, a gentle wander and a fright reaction to the cursor. */
export function stepSchool(fish: Fish[], dt: number, w: number, h: number, pointer: Pointer | null, t: number, speedScale = 1) {
  const step = clampNum(Number.isFinite(dt) ? dt : 0, 0, 0.05)
  if (step === 0 || w <= 0 || h <= 0) return
  for (const f of fish) {
    let ax = 0, ay = 0, sx = 0, sy = 0, cx = 0, cy = 0, n = 0
    for (const o of fish) {
      if (o === f) continue
      const dx = o.x - f.x, dy = o.y - f.y
      const d2 = dx * dx + dy * dy
      if (d2 > SIGHT * SIGHT) continue
      n++
      ax += o.vx; ay += o.vy; cx += o.x; cy += o.y
      if (d2 < SEPARATION * SEPARATION) { const d = Math.sqrt(d2) || 1; sx -= dx / d; sy -= dy / d }
    }
    let fx = Math.sin(t * 0.7 + f.phase) * 12, fy = Math.cos(t * 0.5 + f.phase * 1.7) * 8 // wander
    if (n > 0) {
      fx += (ax / n - f.vx) * 1.2 + (cx / n - f.x) * 0.35 + sx * 90
      fy += (ay / n - f.vy) * 1.2 + (cy / n - f.y) * 0.35 + sy * 90
    }
    if (pointer) {
      const dx = f.x - pointer.x, dy = f.y - pointer.y
      const d = Math.hypot(dx, dy)
      if (d < FLEE_RADIUS && d > 0.001) { const k = (1 - d / FLEE_RADIUS) * 520; fx += (dx / d) * k; fy += (dy / d) * k }
    }
    // Stay out of the very top and bottom edges so fish do not hug the borders.
    if (f.y < 30) fy += 40
    if (f.y > h - 30) fy -= 40
    f.vx += fx * step
    f.vy += fy * step
    const speed = Math.hypot(f.vx, f.vy) || 1
    const target = clampNum(speed, SPEED_MIN * speedScale * (f.big ? 0.8 : 1), SPEED_MAX * speedScale * (f.big ? 0.85 : 1))
    f.vx = (f.vx / speed) * target
    f.vy = (f.vy / speed) * target * 0.9
    f.x += f.vx * step
    f.y += f.vy * step
    // Wrap horizontally (they swim off one side and come back on the other); bounce softly vertically.
    if (f.x < -30) f.x = w + 30
    else if (f.x > w + 30) f.x = -30
    f.y = clampNum(f.y, 0, h)
  }
}

// The 2D drawing surface subset the renderer needs: satisfied by both canvas context types.
export interface Surface {
  fillStyle: string | CanvasGradient | CanvasPattern
  font: string
  textBaseline: CanvasTextBaseline
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
}

const SMALL_R = ['><>', '>=>']
const SMALL_L = ['<><', '<=<']
const BIG_R = '><(((°>'
const BIG_L = '<°)))><'

export class AsciiRenderer {
  private width = 0
  private height = 0
  private fish: Fish[] = []
  private pointer: Pointer | null = null
  private palette: Palette = PALETTES.default
  private colors = buildColors(PALETTES.default)
  private last: number | null = null
  private readonly rand = mulberry32(20261031)
  private readonly ctx: Surface
  private readonly reducedMotion: boolean

  constructor(ctx: Surface, reducedMotion = false) {
    this.ctx = ctx
    this.reducedMotion = reducedMotion
  }

  get fishCount() { return this.fish.length }
  get school(): readonly Fish[] { return this.fish }

  resize(width: number, height: number, dpr = 1) {
    // Hostile or degenerate sizes (0, NaN, huge) must never crash or allocate without bound.
    this.width = Number.isFinite(width) ? clampNum(Math.floor(width), 0, MAX_DIM) : 0
    this.height = Number.isFinite(height) ? clampNum(Math.floor(height), 0, MAX_DIM) : 0
    const scale = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0)

    const wanted = this.width * this.height === 0 ? 0 : clampNum(Math.round((this.width * this.height) / 9000), 30, MAX_FISH)
    while (this.fish.length > wanted) this.fish.pop()
    while (this.fish.length < wanted) {
      const dir = this.rand() < 0.5 ? -1 : 1
      this.fish.push({
        x: this.rand() * this.width, y: this.rand() * this.height, vx: dir * (SPEED_MIN + this.rand() * 30),
        vy: (this.rand() - 0.5) * 10, phase: this.rand() * 6.28, big: this.rand() < 0.14,
      })
    }
    for (const f of this.fish) { f.x = clampNum(f.x, 0, this.width); f.y = clampNum(f.y, 0, this.height) }
  }

  setPointer(p: Pointer | null) {
    this.pointer = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null
  }

  setPalette(p: Palette) {
    this.palette = p
    this.colors = buildColors(p)
  }

  /** Advances the school and draws one frame. Returns how many strings were painted. */
  draw(timeMs: number): number {
    const { ctx } = this
    const now = Number.isFinite(timeMs) ? timeMs : 0
    const dt = this.last === null ? 0 : (now - this.last) / 1000
    this.last = now
    const t = now / 1000
    stepSchool(this.fish, dt, this.width, this.height, this.pointer, t, this.reducedMotion ? 0.3 : 1)

    ctx.fillStyle = this.palette.background
    ctx.fillRect(0, 0, this.width, this.height)
    if (this.width === 0 || this.height === 0) return 0

    ctx.font = `${FONT_PX}px ui-monospace, Consolas, monospace`
    ctx.textBaseline = 'middle'
    let painted = 0

    // Bubbles drifting up, each on its own deterministic path.
    ctx.fillStyle = this.colors[0]
    const bubbles = Math.min(MAX_BUBBLES, Math.floor((this.width * this.height) / 16000))
    for (let i = 0; i < bubbles; i++) {
      const a = Math.sin(i * 12.9898) * 43758.5453, b = Math.sin(i * 78.233) * 12345.6789
      const rx = a - Math.floor(a), ry = b - Math.floor(b)
      const speed = (7 + ry * 16) * (this.reducedMotion ? 0.3 : 1)
      const y = this.height - ((t * speed + ry * this.height) % this.height)
      ctx.fillText(ry > 0.7 ? 'o' : '.', rx * this.width + Math.sin(t * 0.8 + i) * 9, y)
      painted++
    }

    // Fish: far ones dim, fast ones bright. Tail frames alternate with time.
    for (const f of this.fish) {
      const right = f.vx >= 0
      const frame = Math.floor(t * 3 + f.phase) & 1
      const text = f.big ? (right ? BIG_R : BIG_L) : (right ? SMALL_R : SMALL_L)[frame]
      const speed = Math.hypot(f.vx, f.vy)
      ctx.fillStyle = this.colors[f.big ? 2 : speed > 70 ? 2 : speed > 52 ? 1 : 0]
      ctx.fillText(text, f.x - (right ? text.length * 4 : 0), f.y)
      painted++
    }
    return painted
  }
}
