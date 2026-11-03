import * as THREE from 'three'
import { archPanel, bakeAO, box, kitMaterials, pediment, put, type Detail } from './facadeKit.ts'

// The Church of Santa Lucía, Mérida (late 16th century), facing the Parque de Santa Lucía. From published descriptions
// and from free photographs of its facade. What the photographs show: a flat plastered facade without towers, a
// rectangular doorway in a framed stone surround, a rectangular stained-glass window above it with a small pedimented
// canopy, and a bell gable (espadaña) with arched openings in two tiers (two bells, then one) separated by cornices;
// along the nave, buttress pilasters and arched windows with iron grilles.
// INTERPRETATION (no source gives them): every dimension, the number of bays, the flat terrace roof, the apse.
// Metres, facade toward +z, base on y = 0, centred on the origin.

/** Interpreted sizes (no source gives them); the registry reads them from here. */
export const SANTA_LUCIA = { length: 38.5, height: 18.5, width: 13.4 }

export function buildSantaLucia(detail: Detail = 'high'): THREE.Group {
  const hi = detail === 'high'
  const g = new THREE.Group()
  const { stone, trim, dark, roof } = kitMaterials()
  const front = 17
  const naveH = 9

  // The nave with a flat terrace, and a small apse.
  put(g, box(9.6, naveH, 32), stone, 0, naveH / 2, 0)
  put(g, box(10.0, 0.6, 32.4), roof, 0, naveH + 0.05, 0)
  put(g, box(7, 7.5, 5), stone, 0, 3.75, -18.5)

  // The facade: one flat wall, wider than the nave, with stepped shoulders.
  put(g, box(13, 11, 1.6), stone, 0, 5.5, front - 0.8)
  put(g, box(13.4, 0.5, 2.0), trim, 0, 11.1, front - 0.8)
  put(g, box(8.6, 1.2, 1.5), stone, 0, 11.7, front - 0.75)

  // The espadaña: two tiers of arched openings, a cornice between them and a cap.
  put(g, box(7.0, 3.4, 1.3), stone, 0, 13.6, front - 0.9)
  put(g, box(7.4, 0.4, 1.7), trim, 0, 15.4, front - 0.9)
  put(g, box(3.2, 2.6, 1.2), stone, 0, 16.9, front - 0.9)
  put(g, box(3.6, 0.4, 1.6), trim, 0, 18.3, front - 0.9)
  if (hi) {
    for (const x of [-1.7, 1.7]) put(g, archPanel(1.6, 2.6), dark, x, 12.3, front - 0.2)
    put(g, archPanel(1.5, 2.2), dark, 0, 15.9, front - 0.25)
    // The doorway: a framed stone surround with a dark opening, the stained-glass window above it and its canopy.
    const z = front + 0.05
    put(g, box(4.6, 0.7, 0.5), trim, 0, 6.5, z)
    for (const sx of [-1, 1]) put(g, box(0.7, 6.2, 0.5), trim, sx * 1.95, 3.1, z)
    put(g, box(3.2, 5.6, 0.2), dark, 0, 2.8, z + 0.08)
    put(g, box(1.7, 2.8, 0.25), trim, 0, 8.7, z)
    put(g, box(1.2, 2.2, 0.15), dark, 0, 8.7, z + 0.1)
    put(g, pediment(2.6, 0.9, 0.5), trim, 0, 10.3, z)
    // Buttress pilasters and arched windows with grilles along the nave.
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
      const z0 = 13 - i * 6.2
      const ry = sx > 0 ? Math.PI / 2 : -Math.PI / 2
      put(g, box(1.0, naveH, 1.0), stone, sx * 5.3, naveH / 2, z0 - 3.1)
      put(g, archPanel(1.2, 3.2), dark, sx * 4.82, 4.6, z0, ry)
    }
  } else {
    put(g, box(3.2, 5.6, 0.5), dark, 0, 2.8, front + 0.2)
  }

  bakeAO(g, SANTA_LUCIA.height + 3)
  const b = new THREE.Box3().setFromObject(g)
  g.position.z = -(b.min.z + b.max.z) / 2
  return g
}
