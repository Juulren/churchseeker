import * as THREE from 'three'
import { sigilPath } from '../sigil/sigil.ts'
import { fitTitle } from '../quality/proceduralTextures.ts'

// The inscription at the foot of a church in the viewer: its sigil and its name in Cinzel, cut into a dark plaque.
// Greys only. Returns null where there is no canvas (tests, very old browsers), and the viewer simply has no plaque.

export const PLAQUE_W = 2.2
export const PLAQUE_H = 0.42

/** Draws the plaque once the heading font is ready (Cinzel is loaded lazily by the browser, so it is waited for). */
export async function plaqueTexture(name: string): Promise<THREE.CanvasTexture | null> {
  if (typeof document === 'undefined') return null
  try { await document.fonts?.load('600 40px Cinzel') } catch { /* the fallback serif draws instead */ }
  try { return draw(name) } catch { return null }
}

function draw(name: string): THREE.CanvasTexture | null {
  const w = 1024
  const h = Math.round((w * PLAQUE_H) / PLAQUE_W)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = '#1b1b1b'
  g.fillRect(0, 0, w, h)
  g.strokeStyle = '#9a9a9a'; g.lineWidth = 3
  g.strokeRect(10, 10, w - 20, h - 20)
  g.lineWidth = 1.2
  g.strokeRect(18, 18, w - 36, h - 36)
  // The sigil, on the left, with its ring.
  const s = (h - 56) / 100
  g.save()
  g.translate(40, 28)
  g.scale(s, s)
  g.strokeStyle = '#e6e6e6'; g.lineWidth = 2.4 / s * 0.55; g.lineCap = 'round'; g.lineJoin = 'round'
  g.beginPath(); g.arc(50, 50, 47, 0, Math.PI * 2); g.stroke()
  g.stroke(new Path2D(sigilPath(name)))
  g.restore()
  // The name, in capitals, as large as the space allows.
  const left = 40 + h - 56 + 36
  const family = '"Cinzel", "Palatino Linotype", Georgia, serif'
  const fit = fitTitle((t, px) => { g.font = `600 ${px}px ${family}`; return g.measureText(t).width }, name.toUpperCase(), w - left - 44, Math.round(h * 0.42), 18)
  g.font = `600 ${fit.px}px ${family}`
  g.fillStyle = '#e6e6e6'
  g.textAlign = 'left'; g.textBaseline = 'middle'
  g.fillText(fit.text, left, h / 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
