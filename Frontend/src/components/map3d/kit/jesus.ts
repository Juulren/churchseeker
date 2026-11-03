import * as THREE from 'three'
import { archPanel, archRing, bakeAO, box, finial, frustum, kitMaterials, put, row, type Detail } from './facadeKit.ts'

// The Church of Jesús (Tercera Orden), Mérida, built by the Jesuits in 1618. From published descriptions and from free
// photographs of it. What the sources agree on: a cross plan with a single nave, a hemispherical dome on a drum with
// small windows and a lantern, rubble limestone walls, two slender towers beside a central facade with a carved portal
// (two columns, a stained-glass window above it). What is read from photographs: the towers rise in three stepped
// stages with arched bell openings and cornices, and the white dome sits on a drum with round-arched windows.
// INTERPRETATION (no source gives them): every dimension, the exact tower height, the number of bays, the curved
// top of the facade. Metres, facade toward +z, base on y = 0, centred on the origin.

/** Interpreted sizes (no source gives them); the registry reads them from here. */
export const JESUS = { length: 46, height: 27.5, width: 24.8 }

export function buildJesus(detail: Detail = 'high'): THREE.Group {
  const hi = detail === 'high'
  const g = new THREE.Group()
  const { stone, trim, dark, roof } = kitMaterials()
  const front = 20
  const naveH = 15

  // Single nave, transept and a polygonal apse.
  put(g, box(13, naveH, 38), stone, 0, naveH / 2, 1)
  put(g, box(24, naveH, 11), stone, 0, naveH / 2, -5)
  put(g, box(9, 12, 7), stone, 0, 6, -21.5)
  put(g, box(13.4, 0.7, 38.4), roof, 0, naveH + 0.05, 1)
  put(g, box(24.4, 0.7, 11.4), roof, 0, naveH + 0.05, -5)

  // The crossing dome: a drum with windows, a white dome, a lantern with a small cupola.
  const drum = put(g, new THREE.CylinderGeometry(5.3, 5.6, 4.2, hi ? 16 : 8), stone, 0, naveH + 2.1, -5)
  drum.rotation.y = Math.PI / 16
  put(g, new THREE.SphereGeometry(5.2, hi ? 20 : 10, hi ? 10 : 5, 0, Math.PI * 2, 0, Math.PI / 2), trim, 0, naveH + 4.1, -5).scale.set(1, 0.85, 1)
  put(g, new THREE.CylinderGeometry(0.95, 1.1, 2.4, 8), trim, 0, naveH + 8.2, -5)
  put(g, new THREE.SphereGeometry(0.95, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), trim, 0, naveH + 9.4, -5)

  // The facade: a wall with a curved top between the two towers.
  const wall = new THREE.Shape()
  wall.moveTo(-6.5, 0)
  wall.lineTo(6.5, 0)
  wall.lineTo(6.5, 16)
  wall.quadraticCurveTo(0, 20.2, -6.5, 16) // a shallow curved top, not a half disc
  wall.lineTo(-6.5, 0)
  const faceGeo = new THREE.ExtrudeGeometry(wall, { depth: 2.2, bevelEnabled: false, curveSegments: hi ? 14 : 6 })
  put(g, faceGeo, stone, 0, 0, front - 2.2)
  put(g, box(15, 0.8, 2.8), trim, 0, 14.2, front - 1.1)

  // Towers: three stepped stages with cornices, a bell opening on each face of the upper two.
  for (const s of [-1, 1]) {
    const t = new THREE.Group()
    t.position.set(s * 9.2, 0, front - 2.6)
    put(t, frustum(5.8, 5.0, 16), stone, 0, 0, 0)
    put(t, box(6.4, 0.7, 6.4), trim, 0, 16, 0)
    put(t, frustum(4.6, 4.0, 5.6), stone, 0, 16.7, 0)
    put(t, box(5.1, 0.6, 5.1), trim, 0, 22.3, 0)
    put(t, frustum(3.5, 3.1, 3.7), stone, 0, 22.9, 0)
    put(t, box(4.0, 0.5, 4.0), trim, 0, 26.6, 0)
    put(t, new THREE.ConeGeometry(1.6, 0.7, 4), trim, 0, 27.15, 0).rotation.y = Math.PI / 4
    if (hi) {
      for (let f = 0; f < 4; f++) {
        const face = new THREE.Group()
        face.rotation.y = (f * Math.PI) / 2
        put(face, archPanel(1.6, 3.4), dark, 0, 18.2, 2.15)
        put(face, archPanel(1.3, 2.8), dark, 0, 24.0, 1.62)
        if (f % 2 === 0) put(face, archPanel(1.2, 2.4), dark, 0, 10, 2.62)
        t.add(face)
      }
      // Quoined corners sitting on the tapering shaft.
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) for (let i = 0; i < 3; i++) {
        const y = 2 + i * 4.8
        const half = (5.8 - 0.8 * (y / 16)) / 2 - 0.2
        put(t, box(0.7, 1.8, 0.7), trim, cx * half, y, cz * half)
      }
    }
    g.add(t)
  }

  if (hi) {
    // The portal: two columns on pedestals, a carved frieze, a round-arched door, and a stained-glass window in a frame above.
    const z = front + 0.2
    for (const sx of [-1, 1]) {
      put(g, box(1.3, 1.2, 1.3), trim, sx * 2.9, 0.6, z)
      put(g, new THREE.CylinderGeometry(0.42, 0.46, 5.6, 10), trim, sx * 2.9, 4.0, z)
      put(g, box(1.1, 0.5, 1.1), trim, sx * 2.9, 7.0, z)
    }
    put(g, box(7.6, 0.9, 1.1), trim, 0, 7.6, z)
    put(g, archRing(4.4, 6.8, 0.45, 0.5), trim, 0, 0.2, z - 0.1)
    put(g, archPanel(3.4, 6.0), dark, 0, 0.2, z + 0.4)
    put(g, box(2.6, 3.6, 0.35), trim, 0, 10.8, z - 0.2)
    put(g, box(1.8, 2.8, 0.2), dark, 0, 10.8, z)
    row(g, finial(1.3), trim, 3, 5.0, -5, 8.2, z)
    // Buttresses and windows along the nave.
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
      const z0 = 15 - i * 7
      const ry = sx > 0 ? Math.PI / 2 : -Math.PI / 2
      put(g, box(1.1, 13, 1.1), trim, sx * 7.05, 6.5, z0 - 3.5)
      put(g, archPanel(1.3, 3.6), dark, sx * 6.52, 8.5, z0, ry)
    }
    // Drum windows.
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI * 2) / 6 + Math.PI / 16
      const w = put(g, archPanel(0.9, 1.9), dark, Math.cos(a) * 5.65, naveH + 1.0, -5 + Math.sin(a) * 5.65)
      w.rotation.y = Math.PI / 2 - a
    }
  } else {
    put(g, box(7.6, 8, 1), trim, 0, 4, front + 0.3)
  }

  bakeAO(g, JESUS.height)
  const b = new THREE.Box3().setFromObject(g)
  g.position.z = -(b.min.z + b.max.z) / 2
  return g
}
