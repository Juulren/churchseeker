// Pure rendering logic for the animated ASCII background. It has no DOM dependency, so it runs
// unchanged inside a Web Worker (OffscreenCanvas) or on the main thread as a fallback.

export interface Palette {
  background: string
  dim: string
  bright: string
}

export const PALETTES: Record<string, Palette> = {
  default: { background: '#0b0705', dim: '#4a3320', bright: '#f2c46b' },
  // One palette per pilot church (ids from the database seed).
  '11111111-1111-1111-1111-111111111111': { background: '#0d0805', dim: '#5a3a14', bright: '#ffb84a' },
  '22222222-2222-2222-2222-222222222222': { background: '#07100f', dim: '#1f4f4a', bright: '#6fe0c8' },
  '33333333-3333-3333-3333-333333333333': { background: '#0c0713', dim: '#43296b', bright: '#c9a0ff' },
}

export const paletteFor = (churchId?: string | null): Palette =>
  (churchId && PALETTES[churchId]) || PALETTES.default

export const RAMP = ' .:-=+*#%@'
export const FONT_PX = 14
export const CELL_W = 8
export const CELL_H = 14
// Upper bound of glyphs per frame. Huge viewports use bigger glyphs instead of more of them,
// so the cost of a frame stays flat on an 8K screen or a zoomed-out browser.
export const MAX_CELLS = 24_000

export interface Pointer { x: number; y: number }

/** Brightness of one cell, always within 0..1. Plasma waves plus a ripple around the pointer. */
export function fieldValue(col: number, row: number, t: number, pointer: Pointer | null, cw = CELL_W, ch = CELL_H): number {
  let v = 0.5
    + 0.18 * Math.sin(col * 0.11 + t * 0.9)
    + 0.16 * Math.sin(row * 0.19 - t * 0.7)
    + 0.14 * Math.sin((col + row) * 0.07 + t * 0.5)
    + 0.12 * Math.sin(Math.hypot(col - 60, row - 20) * 0.16 - t * 1.1)
  if (pointer) {
    const d = Math.hypot(col * cw - pointer.x, row * ch - pointer.y) / cw
    v += 0.55 * Math.exp(-(d * d) / 180) + 0.12 * Math.sin(d * 0.9 - t * 5) * Math.exp(-d / 14)
  }
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export const rampIndex = (v: number): number => Math.min(RAMP.length - 1, Math.max(0, Math.floor(v * RAMP.length)))

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  const n = m ? parseInt(m[1], 16) : 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** One colour per ramp step, fading from `dim` to `bright`. */
export function buildColors(p: Palette): string[] {
  const a = hexToRgb(p.dim)
  const b = hexToRgb(p.bright)
  return Array.from({ length: RAMP.length }, (_, i) => {
    const k = i / (RAMP.length - 1)
    const c = a.map((x, j) => Math.round(x + (b[j] - x) * k))
    return `rgb(${c[0]},${c[1]},${c[2]})`
  })
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

export class AsciiRenderer {
  private cols = 0
  private rows = 0
  private cellW = CELL_W
  private cellH = CELL_H
  private fontPx = FONT_PX
  private width = 0
  private height = 0
  private pointer: Pointer | null = null
  private palette: Palette = PALETTES.default
  private colors = buildColors(PALETTES.default)
  // Cell positions grouped by ramp step, so the fill colour changes at most RAMP.length times a frame.
  private buckets: Int32Array[] = []
  private counts: Int32Array = new Int32Array(RAMP.length)

  private readonly ctx: Surface
  private readonly reducedMotion: boolean

  constructor(ctx: Surface, reducedMotion = false) {
    this.ctx = ctx
    this.reducedMotion = reducedMotion
  }

  resize(width: number, height: number, dpr = 1) {
    // Hostile or degenerate sizes (0, NaN, huge) must never crash or allocate without bound.
    const w = Number.isFinite(width) ? Math.min(Math.max(Math.floor(width), 0), 8192) : 0
    const h = Number.isFinite(height) ? Math.min(Math.max(Math.floor(height), 0), 8192) : 0
    const scale = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1
    this.width = w
    this.height = h
    const base = Math.ceil(w / CELL_W) * Math.ceil(h / CELL_H)
    const grow = base > MAX_CELLS ? Math.sqrt(base / MAX_CELLS) : 1
    this.cellW = CELL_W * grow
    this.cellH = CELL_H * grow
    this.fontPx = FONT_PX * grow
    this.cols = Math.ceil(w / this.cellW)
    this.rows = Math.ceil(h / this.cellH)
    const cells = Math.max(this.cols * this.rows, 1)
    this.buckets = RAMP.split('').map(() => new Int32Array(cells))
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0)
  }

  setPointer(p: Pointer | null) {
    this.pointer = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null
  }

  setPalette(p: Palette) {
    this.palette = p
    this.colors = buildColors(p)
  }

  /** Draws one frame and returns how many glyphs were painted. */
  draw(timeMs: number): number {
    const { ctx } = this
    ctx.fillStyle = this.palette.background
    ctx.fillRect(0, 0, this.width, this.height)
    if (this.cols === 0 || this.rows === 0) return 0

    const t = (Number.isFinite(timeMs) ? timeMs : 0) / 1000 * (this.reducedMotion ? 0.15 : 1)
    this.counts.fill(0)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = rampIndex(fieldValue(c, r, t, this.pointer, this.cellW, this.cellH))
        if (idx === 0) continue
        this.buckets[idx][this.counts[idx]++] = r * this.cols + c
      }
    }

    ctx.font = `${this.fontPx}px ui-monospace, Consolas, monospace`
    ctx.textBaseline = 'top'
    let painted = 0
    for (let i = 1; i < RAMP.length; i++) {
      if (this.counts[i] === 0) continue
      ctx.fillStyle = this.colors[i]
      const ch = RAMP[i]
      const list = this.buckets[i]
      for (let k = 0; k < this.counts[i]; k++) {
        const cell = list[k]
        ctx.fillText(ch, (cell % this.cols) * this.cellW, Math.floor(cell / this.cols) * this.cellH)
        painted++
      }
    }
    return painted
  }
}
