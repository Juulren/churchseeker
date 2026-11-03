import * as THREE from 'three'
import { sigilPath } from '../sigil/sigil.ts'

/**
 * The inscription on the plinth: the church's sigil and its name in Cinzel, in greys. Drawn on a canvas, so it ships no
 * image. It waits for the font, because a canvas drawn before Cinzel loads would use a fallback face.
 */
export async function plaqueTexture(name: string): Promise<THREE.CanvasTexture | null> {
  if (typeof document === 'undefined') return null
  // A hung font load must not keep the plaque away: wait up to a second and a half, then draw with whatever face there is.
  try { await Promise.race([document.fonts.load('600 54px Cinzel'), new Promise((r) => setTimeout(r, 1500))]) } catch { /* the fallback face is fine */ }
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 192
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = '#1a1a1a'
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = '#8a8a8a'
  g.lineWidth = 3
  g.strokeRect(10, 10, c.width - 20, c.height - 20)
  // Sigil on the left.
  g.save()
  g.translate(40, 36)
  g.scale(1.2, 1.2)
  g.strokeStyle = '#d8d8d8'
  g.lineWidth = 2.2
  g.lineCap = 'round'
  g.beginPath(); g.arc(50, 50, 47, 0, Math.PI * 2); g.stroke()
  g.stroke(new Path2D(sigilPath(name)))
  g.restore()
  // Name, shrunk until it fits.
  let px = 64
  g.fillStyle = '#ececec'
  g.textBaseline = 'middle'
  const maxW = c.width - 230 - 40
  do { g.font = `600 ${px}px Cinzel, "Palatino Linotype", Georgia, serif`; px -= 2 } while (g.measureText(name).width > maxW && px > 22)
  g.fillText(name, 200, c.height / 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
