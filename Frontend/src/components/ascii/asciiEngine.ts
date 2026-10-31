// Pure rendering logic for the animated background: koi made of letter tiles swimming over a faint grid.
// No DOM dependency, so it runs unchanged inside a Web Worker (OffscreenCanvas) or on the main thread.

export interface Palette {
  background: string
  /** Colour of the faint grid. */
  dim: string
  /** Cream of the white koi. */
  bright: string
}

export const PALETTES: Record<string, Palette> = {
  default: { background: '#050505', dim: '#ffffff', bright: '#ece7dc' },
  // One barely visible tint per pilot church (ids from the database seed).
  '11111111-1111-1111-1111-111111111111': { background: '#080605', dim: '#ffe9c8', bright: '#efe5d2' },
  '22222222-2222-2222-2222-222222222222': { background: '#040808', dim: '#c8fff4', bright: '#e4eeea' },
  '33333333-3333-3333-3333-333333333333': { background: '#07050a', dim: '#e6d8ff', bright: '#e9e4f0' },
}

export const paletteFor = (churchId?: string | null): Palette =>
  (churchId && PALETTES[churchId]) || PALETTES.default

export const CELL_W = 11
export const CELL_H = 14
export const FONT_PX = 12
export const MAX_KOI = 7
export const SEGMENTS = 16
const MAX_DIM = 8192

export interface Pointer { x: number; y: number }

export type Skin = 'kohaku' | 'white' | 'gold' | 'ghost'

export interface Koi {
  /** Spine from head (index 0) to tail, in pixels. */
  spine: { x: number; y: number }[]
  heading: number
  speed: number
  phase: number
  skin: Skin
  scale: number
}

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

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n)
const SKINS: Skin[] = ['kohaku', 'white', 'gold', 'kohaku', 'ghost', 'white', 'gold']
const SPACING = CELL_W * 0.95

export function makeKoi(x: number, y: number, rand: () => number, index: number): Koi {
  const heading = rand() * Math.PI * 2
  const scale = 0.85 + rand() * 0.5
  return {
    spine: Array.from({ length: SEGMENTS }, (_, i) => ({ x: x - Math.cos(heading) * i * SPACING * scale, y: y - Math.sin(heading) * i * SPACING * scale })),
    heading, speed: 34 + rand() * 26, phase: rand() * 6.28, skin: SKINS[index % SKINS.length], scale,
  }
}

const FLEE_RADIUS = 170

/** Moves each koi: a wandering head that turns away from the cursor, and a body that follows it. */
export function stepKoi(school: Koi[], dt: number, w: number, h: number, pointer: Pointer | null, t: number, speedScale = 1) {
  const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05)
  if (step === 0 || w <= 0 || h <= 0) return
  for (const k of school) {
    const head = k.spine[0]
    let want = k.heading + Math.sin(t * 0.35 + k.phase) * 0.9 * step * 3 + Math.sin(t * 0.13 + k.phase * 2) * step
    // Stay on screen: steer back toward the middle near the edges.
    const margin = 90
    if (head.x < margin || head.x > w - margin || head.y < margin || head.y > h - margin) {
      const to = Math.atan2(h / 2 - head.y, w / 2 - head.x)
      want += Math.sin(to - k.heading) * 2.2 * step
    }
    let speed = k.speed * speedScale
    if (pointer) {
      const dx = head.x - pointer.x, dy = head.y - pointer.y
      const d = Math.hypot(dx, dy)
      if (d < FLEE_RADIUS && d > 0.001) {
        // "Make room": turn away from the cursor and speed up a little.
        want += Math.sin(Math.atan2(dy, dx) - k.heading) * 5 * (1 - d / FLEE_RADIUS) * step * 6
        speed *= 1 + (1 - d / FLEE_RADIUS) * 1.4
      }
    }
    k.heading = want
    head.x = clamp(head.x + Math.cos(k.heading) * speed * step, -20, w + 20)
    head.y = clamp(head.y + Math.sin(k.heading) * speed * step, -20, h + 20)
    const gap = SPACING * k.scale
    for (let i = 1; i < k.spine.length; i++) {
      const p = k.spine[i - 1], q = k.spine[i]
      const dx = q.x - p.x, dy = q.y - p.y
      const d = Math.hypot(dx, dy) || 1
      q.x = p.x + (dx / d) * gap
      q.y = p.y + (dy / d) * gap
    }
  }
}

export type Tone = 'cream' | 'grey' | 'dark' | 'red' | 'gold' | 'darkGold'

export interface Tile { col: number; row: number; tone: Tone; glyph: string }

// Glyph sets per tone: letters on bright tiles, punctuation on the dark outline.
const BRIGHT_GLYPHS = 'ZXzx%#oZXzx'
const EDGE_GLYPHS = ':+*.;'

const bodyWidth = (u: number) => (u < 0.12 ? 0.35 + u * 6 : u < 0.55 ? 1.1 + Math.sin(((u - 0.12) / 0.43) * Math.PI) * 0.5 : 1.1 * (1 - (u - 0.55) / 0.45) + 0.12)

const hash = (a: number, b: number) => {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** Turns one koi into tiles on the grid. Tiles are deduplicated: the brightest tone wins a cell. */
export function koiTiles(k: Koi, t: number): Tile[] {
  const cells = new Map<number, Tile>()
  const rank: Record<Tone, number> = { dark: 0, darkGold: 1, grey: 2, gold: 3, red: 4, cream: 5 }
  const put = (x: number, y: number, tone: Tone, _seed: number) => {
    const col = Math.floor(x / CELL_W), row = Math.floor(y / CELL_H)
    const key = row * 100003 + col
    const old = cells.get(key)
    if (old && rank[old.tone] >= rank[tone]) return
    const set = tone === 'dark' || tone === 'darkGold' ? EDGE_GLYPHS : BRIGHT_GLYPHS
    // Glyphs flicker slowly, a few at a time.
    const g = Math.floor(hash(col, row) * set.length + Math.floor(t * 1.5 + hash(row, col) * 4) * (hash(col + 1, row) > 0.8 ? 1 : 0)) % set.length
    cells.set(key, { col, row, tone, glyph: set[g] })
  }

  const n = k.spine.length
  const gold = k.skin === 'gold'
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const p = k.spine[i]
    const next = k.spine[Math.min(i + 1, n - 1)], prev = k.spine[Math.max(i - 1, 0)]
    const ang = Math.atan2(next.y - prev.y, next.x - prev.x) + Math.PI / 2
    const half = bodyWidth(u) * k.scale * 2.1 // half width in cells
    // Slight sideways wave so the body undulates.
    const wave = Math.sin(t * 2.4 - u * 5 + k.phase) * CELL_W * 0.35 * u
    for (let s = -Math.ceil(half); s <= Math.ceil(half); s++) {
      const off = s * CELL_W * 0.9
      const x = p.x + Math.cos(ang) * (off + wave), y = p.y + Math.sin(ang) * (off + wave)
      const edge = Math.abs(s) / (half + 0.01)
      let tone: Tone
      if (u > 0.78) tone = edge > 0.5 ? 'dark' : gold ? 'darkGold' : 'grey' // tail fades out
      else if (edge > 0.8) tone = gold ? 'darkGold' : 'dark'
      else if (gold) tone = 'gold'
      else if (k.skin === 'ghost') tone = edge > 0.45 ? 'grey' : 'cream'
      else if (k.skin === 'kohaku' && Math.sin(u * 9 + k.phase) > 0.3 && edge < 0.75) tone = 'red'
      else tone = edge > 0.6 ? 'grey' : 'cream'
      put(x, y, tone, i)
    }
  }
  // Pectoral fins: two short sparse offshoots that flap.
  const fin = k.spine[Math.floor(n * 0.28)]
  const fa = Math.atan2(k.spine[Math.floor(n * 0.28) + 1].y - fin.y, k.spine[Math.floor(n * 0.28) + 1].x - fin.x)
  for (const side of [-1, 1]) {
    const flap = Math.sin(t * 3 + k.phase + side) * 0.35
    for (let j = 2; j <= 3; j++) {
      const a = fa + Math.PI + side * (1.15 + flap)
      put(fin.x + Math.cos(a) * j * CELL_W * 1.1 * k.scale, fin.y + Math.sin(a) * j * CELL_W * 1.1 * k.scale, gold ? 'darkGold' : 'dark', j)
    }
  }
  // Tail fin: a short fan beyond the last spine point.
  const tail = k.spine[n - 1], pre = k.spine[n - 3]
  const ta = Math.atan2(tail.y - pre.y, tail.x - pre.x)
  for (let j = 1; j <= 3; j++) for (const side of [-1, 0, 1]) {
    const sway = Math.sin(t * 3.2 + k.phase) * 0.25
    const a = ta + side * 0.38 + sway
    put(tail.x + Math.cos(a) * j * CELL_W, tail.y + Math.sin(a) * j * CELL_W, gold ? 'darkGold' : 'dark', j)
  }
  return [...cells.values()]
}

const TILE = {
  cream: (p: Palette) => ({ bg: p.bright, fg: '#3b3b38' }),
  grey: () => ({ bg: '#8f8f8d', fg: '#1d1d1d' }),
  dark: () => ({ bg: '#262626', fg: '#a2a2a0' }),
  red: () => ({ bg: '#e5584a', fg: '#7d1b14' }),
  gold: () => ({ bg: '#f0b52c', fg: '#6d4b00' }),
  darkGold: () => ({ bg: '#6e5c20', fg: '#c9ab4a' }),
} satisfies Record<Tone, (p: Palette) => { bg: string; fg: string }>

// The 2D drawing surface subset the renderer needs: satisfied by both canvas context types.
export interface Surface {
  fillStyle: string | CanvasGradient | CanvasPattern
  font: string
  textAlign?: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  globalAlpha?: number
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
}

export class AsciiRenderer {
  private width = 0
  private height = 0
  private school: Koi[] = []
  private pointer: Pointer | null = null
  private palette: Palette = PALETTES.default
  private last: number | null = null
  private readonly rand = mulberry32(20261101)
  private readonly ctx: Surface
  private readonly reducedMotion: boolean

  constructor(ctx: Surface, reducedMotion = false) {
    this.ctx = ctx
    this.reducedMotion = reducedMotion
  }

  get fishCount() { return this.school.length }
  get koi(): readonly Koi[] { return this.school }

  resize(width: number, height: number, dpr = 1) {
    // Hostile or degenerate sizes (0, NaN, huge) must never crash or allocate without bound.
    this.width = Number.isFinite(width) ? clamp(Math.floor(width), 0, MAX_DIM) : 0
    this.height = Number.isFinite(height) ? clamp(Math.floor(height), 0, MAX_DIM) : 0
    const scale = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0)
    const wanted = this.width * this.height === 0 ? 0 : clamp(Math.round((this.width * this.height) / 210000), 3, MAX_KOI)
    while (this.school.length > wanted) this.school.pop()
    while (this.school.length < wanted)
      this.school.push(makeKoi(this.rand() * this.width, this.rand() * this.height, this.rand, this.school.length))
    for (const k of this.school) for (const p of k.spine) { p.x = clamp(p.x, -20, this.width + 20); p.y = clamp(p.y, -20, this.height + 20) }
  }

  setPointer(p: Pointer | null) { this.pointer = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null }
  setPalette(p: Palette) { this.palette = p }

  /** Advances the school and draws one frame. Returns how many tiles were painted. */
  draw(timeMs: number): number {
    const { ctx } = this
    const now = Number.isFinite(timeMs) ? timeMs : 0
    const dt = this.last === null ? 0 : (now - this.last) / 1000
    this.last = now
    const t = now / 1000
    stepKoi(this.school, dt, this.width, this.height, this.pointer, t, this.reducedMotion ? 0.3 : 1)

    ctx.globalAlpha = 1
    ctx.fillStyle = this.palette.background
    ctx.fillRect(0, 0, this.width, this.height)
    if (this.width === 0 || this.height === 0) return 0

    // Faint grid.
    ctx.globalAlpha = 0.05
    ctx.fillStyle = this.palette.dim
    for (let x = 0; x <= this.width; x += CELL_W) ctx.fillRect(x, 0, 1, this.height)
    for (let y = 0; y <= this.height; y += CELL_H) ctx.fillRect(0, y, this.width, 1)
    ctx.globalAlpha = 1

    ctx.font = `bold ${FONT_PX}px ui-monospace, Consolas, monospace`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    let painted = 0
    for (const k of this.school) {
      for (const tile of koiTiles(k, t)) {
        const x = tile.col * CELL_W, y = tile.row * CELL_H
        if (x < -CELL_W || y < -CELL_H || x > this.width || y > this.height) continue
        const c = TILE[tile.tone](this.palette)
        ctx.fillStyle = c.bg
        ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2)
        ctx.fillStyle = c.fg
        ctx.fillText(tile.glyph, x + CELL_W / 2, y + CELL_H / 2 + 0.5)
        painted++
      }
    }
    return painted
  }
}
