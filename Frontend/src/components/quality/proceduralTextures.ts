import * as THREE from 'three'
import { mulberry32 } from './random.ts'

// Procedural surface textures drawn on a canvas, so the app ships no image files and works offline.
// Without a DOM (unit tests, server rendering) every function returns null and materials simply have no map.

export interface TexturePair { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }

const hasDom = () => typeof document !== 'undefined'

function surface(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  if (!hasDom()) return null
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  return g ? { c, g } : null
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

const bumpOf = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Per-pixel grain: adds up to ±amount to every colour channel. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const rand = mulberry32(seed)
  const img = g.getImageData(0, 0, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 2 * amount
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
}

const cache = new Map<string, unknown>()
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key) as T
}

/** Aged leather: base colour, fine grain, darker blotches and a few scuffs and creases. */
export function leather(color: string): TexturePair | null {
  return memo(`leather:${color}`, () => {
    const s = surface(256, 256)
    if (!s) return null
    const { c, g } = s
    const rand = mulberry32(11)
    g.fillStyle = color
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.06})`
      g.beginPath()
      g.arc(rand() * 256, rand() * 256, 10 + rand() * 38, 0, Math.PI * 2)
      g.fill()
    }
    grain(g, 256, 256, 16, 5)
    g.strokeStyle = 'rgba(0,0,0,0.22)'
    for (let i = 0; i < 24; i++) {
      g.lineWidth = 0.6 + rand()
      g.beginPath()
      const x = rand() * 256, y = rand() * 256
      g.moveTo(x, y)
      g.quadraticCurveTo(x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 50, x + (rand() - 0.5) * 80, y + (rand() - 0.5) * 80)
      g.stroke()
    }
    const b = surface(256, 256)!
    b.g.fillStyle = '#808080'
    b.g.fillRect(0, 0, 256, 256)
    grain(b.g, 256, 256, 60, 9)
    b.g.strokeStyle = 'rgba(0,0,0,0.5)'
    b.g.drawImage(c, 0, 0)
    b.g.globalCompositeOperation = 'luminosity'
    b.g.drawImage(c, 0, 0)
    return { map: toTexture(c), bump: bumpOf(b.c) }
  })
}

/** Page edges: cream paper with very fine parallel lines. */
export function paper(): TexturePair | null {
  return memo('paper', () => {
    const s = surface(128, 128)
    if (!s) return null
    const rand = mulberry32(21)
    s.g.fillStyle = '#eadfc2'
    s.g.fillRect(0, 0, 128, 128)
    for (let y = 0; y < 128; y += 2) {
      s.g.fillStyle = `rgba(120,100,60,${0.1 + rand() * 0.22})`
      s.g.fillRect(0, y, 128, 1)
    }
    grain(s.g, 128, 128, 7, 3)
    const b = surface(128, 128)!
    for (let y = 0; y < 128; y += 2) { b.g.fillStyle = y % 4 === 0 ? '#9a9a9a' : '#6a6a6a'; b.g.fillRect(0, y, 128, 2) }
    return { map: toTexture(s.c), bump: bumpOf(b.c) }
  })
}

/** Wood with vertical grain and knots. */
export function wood(color: string): TexturePair | null {
  return memo(`wood:${color}`, () => {
    const s = surface(256, 256)
    if (!s) return null
    const rand = mulberry32(31)
    s.g.fillStyle = color
    s.g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 120; i++) {
      const x = rand() * 256
      s.g.strokeStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,230,190'},${0.04 + rand() * 0.1})`
      s.g.lineWidth = 0.5 + rand() * 2
      s.g.beginPath()
      s.g.moveTo(x, 0)
      for (let y = 0; y <= 256; y += 32) s.g.lineTo(x + Math.sin(y * 0.03 + i) * 4, y)
      s.g.stroke()
    }
    grain(s.g, 256, 256, 8, 2)
    const b = surface(256, 256)!
    b.g.drawImage(s.c, 0, 0)
    b.g.globalCompositeOperation = 'saturation'
    b.g.fillStyle = '#808080'
    b.g.fillRect(0, 0, 256, 256)
    return { map: toTexture(s.c), bump: bumpOf(b.c) }
  })
}

/** Lime plaster / dressed stone: mottled with speckles. */
export function plaster(color: string, blocks = false): TexturePair | null {
  return memo(`plaster:${color}:${blocks}`, () => {
    const s = surface(256, 256)
    if (!s) return null
    const rand = mulberry32(41)
    s.g.fillStyle = color
    s.g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 90; i++) {
      s.g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + rand() * 0.06})`
      s.g.beginPath()
      s.g.arc(rand() * 256, rand() * 256, 6 + rand() * 40, 0, Math.PI * 2)
      s.g.fill()
    }
    grain(s.g, 256, 256, 13, 6)
    if (blocks) {
      s.g.strokeStyle = 'rgba(60,50,35,0.35)'
      s.g.lineWidth = 1.5
      for (let y = 0; y < 256; y += 32) {
        s.g.beginPath(); s.g.moveTo(0, y); s.g.lineTo(256, y); s.g.stroke()
        for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) { s.g.beginPath(); s.g.moveTo(x, y); s.g.lineTo(x, y + 32); s.g.stroke() }
      }
    }
    const b = surface(256, 256)!
    b.g.fillStyle = '#808080'
    b.g.fillRect(0, 0, 256, 256)
    grain(b.g, 256, 256, 40, 8)
    if (blocks) { b.g.strokeStyle = '#303030'; b.g.lineWidth = 2; for (let y = 0; y < 256; y += 32) { b.g.beginPath(); b.g.moveTo(0, y); b.g.lineTo(256, y); b.g.stroke() } }
    return { map: toTexture(s.c), bump: bumpOf(b.c) }
  })
}

/** Curved clay roof tiles in staggered rows. */
export function tiles(color: string): TexturePair | null {
  return memo(`tiles:${color}`, () => {
    const s = surface(256, 256)
    if (!s) return null
    const rand = mulberry32(51)
    const b = surface(256, 256)!
    s.g.fillStyle = '#2a1a14'
    s.g.fillRect(0, 0, 256, 256)
    b.g.fillStyle = '#202020'
    b.g.fillRect(0, 0, 256, 256)
    const rows = 8, cols = 8, h = 256 / rows, w = 256 / cols
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols + 1; col++) {
        const x = col * w - (r % 2 ? w / 2 : 0), y = r * h
        const tint = rand()
        const grad = s.g.createLinearGradient(x, y, x, y + h)
        grad.addColorStop(0, color)
        grad.addColorStop(1, `rgba(40,16,10,${0.5 + tint * 0.3})`)
        s.g.fillStyle = grad
        s.g.beginPath()
        s.g.roundRect(x + 1, y + 1, w - 2, h - 1, [2, 2, w / 2, w / 2])
        s.g.fill()
        const bg = b.g.createLinearGradient(x, y, x, y + h)
        bg.addColorStop(0, '#ffffff')
        bg.addColorStop(1, '#303030')
        b.g.fillStyle = bg
        b.g.beginPath()
        b.g.roundRect(x + 1, y + 1, w - 2, h - 1, [2, 2, w / 2, w / 2])
        b.g.fill()
      }
    }
    grain(s.g, 256, 256, 12, 7)
    return { map: toTexture(s.c), bump: bumpOf(b.c) }
  })
}

export interface SpineOptions { title: string; author?: string | null; color: string; width: number; height: number }

/** Fits a title to a given pixel length by shrinking the font, then trimming with an ellipsis. */
export function fitTitle(measure: (text: string, px: number) => number, title: string, maxPx: number, startPx: number, minPx = 18): { text: string; px: number } {
  const clean = String(title ?? '').replace(/\s+/g, ' ').trim() || '—'
  let px = startPx
  while (px > minPx && measure(clean, px) > maxPx) px -= 2
  let text = clean
  while (text.length > 1 && measure(text, px) > maxPx) text = text.slice(0, -1)
  return { text: text === clean ? clean : text.trimEnd() + '…', px }
}

/** The tooled spine of a bound book: leather, raised bands, gold rules and a gold-foil title. */
export function spine(o: SpineOptions): THREE.CanvasTexture | null {
  const W = 192
  const H = Math.round((W * o.height) / Math.max(o.width, 0.3))
  const s = surface(W, Math.min(H, 1024))
  if (!s) return null
  const { c, g } = s
  const h = c.height
  const pair = leather(o.color)
  if (pair) g.drawImage(pair.map.image as CanvasImageSource, 0, 0, W, h)
  else { g.fillStyle = o.color; g.fillRect(0, 0, W, h) }

  const gold = g.createLinearGradient(0, 0, W, 0)
  gold.addColorStop(0, '#8a6a1c'); gold.addColorStop(0.35, '#f3dc8a'); gold.addColorStop(0.55, '#c9a13a'); gold.addColorStop(1, '#7a5a14')

  // Raised bands (hubs) with gold rules on each side.
  const bands = [0.1, 0.3, 0.7, 0.9]
  for (const f of bands) {
    const y = f * h
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, y - 9, W, 4)
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y + 6, W, 5)
    g.fillStyle = gold
    g.fillRect(8, y - 14, W - 16, 2); g.fillRect(8, y + 12, W - 16, 2)
  }
  // Title panel between the middle bands.
  const top = 0.32 * h, bottom = 0.68 * h
  g.strokeStyle = gold; g.lineWidth = 2
  g.strokeRect(14, top, W - 28, bottom - top)

  g.save()
  g.translate(W / 2, (top + bottom) / 2)
  g.rotate(Math.PI / 2)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const family = '"Palatino Linotype","Book Antiqua",Georgia,"Times New Roman",serif'
  const measure = (t: string, px: number) => { g.font = `bold ${px}px ${family}`; return g.measureText(t).width }
  const fit = fitTitle(measure, o.title, bottom - top - 24, 62)
  g.font = `bold ${fit.px}px ${family}`
  g.fillStyle = 'rgba(0,0,0,0.55)'
  g.fillText(fit.text, 2, 2)
  g.fillStyle = gold
  g.fillText(fit.text, 0, 0)
  g.restore()

  if (o.author) {
    g.save()
    g.translate(W / 2, 0.8 * h)
    g.rotate(Math.PI / 2)
    g.textAlign = 'center'; g.textBaseline = 'middle'
    const a = fitTitle((t, px) => { g.font = `italic ${px}px ${family}`; return g.measureText(t).width }, o.author, 0.16 * h, 30, 14)
    g.font = `italic ${a.px}px ${family}`
    g.fillStyle = gold
    g.fillText(a.text, 0, 0)
    g.restore()
  }
  // Fleurons at head and tail.
  g.fillStyle = gold; g.font = '28px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('✠', W / 2, 0.2 * h); g.fillText('❖', W / 2, 0.8 * h + 0.1 * h)
  const t = toTexture(c, false)
  return t
}
