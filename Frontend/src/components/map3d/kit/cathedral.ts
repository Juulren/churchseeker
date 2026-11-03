import * as THREE from 'three'
import { archPanel, archRing, bakeAO, box, finial, frustum, kitMaterials, pediment, put, row, type Detail } from './facadeKit.ts'

// The Cathedral of San Ildefonso, Mérida (1561 to 1598), modelled from published dimensions and from photographs
// of its facade. What is verified: a basilica about 67 m long and 31 m wide, two square towers 43.5 m high, a dome over
// the crossing, a plain limestone facade. What is read from the photographs: a central block with a large relief arch
// above a coat of arms and a window, a framed portal with paired pilasters, niches and a small pediment, two smaller
// pedimented doors at the foot of the towers, battered towers in two stages with arched belfry openings and quoined
// corners. The heights of the stages and the number of bays along the nave are interpretations.
// Metres, facade toward +z, base on y = 0, centred on the origin.

export const CATHEDRAL = {
  length: 68, width: 34, towerHeight: 43.5,
  /** 33.6 m is the dome height given by a single press source citing the cathedral's own site: an interpretation until confirmed. */
  domeHeight: 33.6,
  /** Published figures the model is tested against (within 15%). */
  verified: { length: 66.75, width: 31.3, towerHeight: 43.5 },
}

export function buildCathedral(detail: Detail = 'high'): THREE.Group {
  const hi = detail === 'high'
  const g = new THREE.Group()
  const { stone, trim, dark, roof } = kitMaterials()
  const front = 31 // facade plane
  const naveH = 22, aisleH = 14

  // Nave, aisles and apse. The roofs are flat terraces with a parapet.
  put(g, box(14, naveH, 62), stone, 0, naveH / 2, -0.5)
  for (const s of [-1, 1]) put(g, box(8.5, aisleH, 58), stone, s * 11.25, aisleH / 2, 1.5)
  put(g, box(14, 20, 8), stone, 0, 10, -35)
  put(g, box(14.4, 0.8, 62.4), roof, 0, naveH + 0.1, -0.5) // nave terrace
  for (const s of [-1, 1]) put(g, box(8.8, 0.7, 58.4), roof, s * 11.25, aisleH + 0.05, 1.5)

  // Transept and the crossing dome (octagonal drum, low dome, lantern).
  put(g, box(32, naveH, 12), stone, 0, naveH / 2, -5)
  const drum = put(g, new THREE.CylinderGeometry(6.4, 6.8, 5.2, hi ? 16 : 8), stone, 0, naveH + 2.6, -5)
  drum.rotation.y = Math.PI / 8
  put(g, new THREE.SphereGeometry(6.2, hi ? 20 : 10, hi ? 10 : 5, 0, Math.PI * 2, 0, Math.PI / 2), trim, 0, naveH + 5.2, -5).scale.set(1, 0.9, 1)
  put(g, new THREE.CylinderGeometry(1.1, 1.3, 3, 8), trim, 0, CATHEDRAL.domeHeight - 0.4, -5)

  // Facade: a central block that rises above the nave line, with a cornice.
  put(g, box(15, 26, 4), stone, 0, 13, front - 2)
  put(g, box(16.4, 0.9, 5), trim, 0, 26.2, front - 1.9)
  put(g, box(2 * 8, 18, 4), stone, 0, 9, front - 2)

  // Towers: a battered base stage, a belfry stage and a small crowning stage, each with a cornice.
  for (const s of [-1, 1]) {
    const x = s * 12.4, z = front - 4.9
    const t = new THREE.Group()
    t.position.set(x, 0, z)
    // Width of each stage at a height, so the parts stuck onto a tapering shaft sit on its surface.
    const shaft = (y: number) => 9.6 - 1.4 * (y / 27)
    const belfry = (y: number) => 7.4 - 1.2 * ((y - 27.9) / 9.5)
    const crown = (y: number) => 5.2 - 0.6 * ((y - 38.2) / 4.8)
    put(t, frustum(9.6, 8.2, 27), stone, 0, 0, 0)
    put(t, box(9.6, 0.9, 9.6), trim, 0, 27, 0)
    put(t, frustum(7.4, 6.2, 9.5), stone, 0, 27.9, 0)
    put(t, box(7.6, 0.8, 7.6), trim, 0, 37.4, 0)
    put(t, frustum(5.2, 4.6, 4.8), stone, 0, 38.2, 0)
    put(t, box(5.6, 0.7, 5.6), trim, 0, 43, 0)
    put(t, new THREE.ConeGeometry(2.1, 0.8, 4), trim, 0, 43.7 - 0.35, 0).rotation.y = Math.PI / 4
    if (hi) {
      // Quoined corners, belfry arches on the four faces, small windows.
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) for (let i = 0; i < 6; i++) {
        const y = 2 + i * 4.4
        const half = shaft(y) / 2 - 0.25
        put(t, box(i % 2 ? 1.1 : 1.5, 2.0, i % 2 ? 1.5 : 1.1), trim, cx * half, y, cz * half)
      }
      for (let f = 0; f < 4; f++) {
        const face = new THREE.Group()
        face.rotation.y = (f * Math.PI) / 2
        put(face, archPanel(2.6, 5.5), dark, 0, 29.5, belfry(31) / 2 + 0.02)
        put(face, archPanel(1.6, 3.2), dark, 0, 39.2, crown(40.5) / 2 + 0.02)
        if (f % 2 === 0) put(face, box(0.9, 1.4, 0.15), dark, 0, 18, shaft(18) / 2 + 0.05)
        t.add(face)
      }
      for (const y of [6, 12, 18, 23]) put(t, box(shaft(y) + 0.3, 0.22, shaft(y) + 0.3), trim, 0, y, 0)
      put(t, box(2.6, 0.3, 1.2), trim, 0, 29.2, belfry(29.2) / 2 + 0.5)
      put(t, box(2.6, 0.7, 0.12), trim, 0, 29.7, belfry(29.2) / 2 + 1.05)
      row(t, finial(1.6), trim, 2, 5.2, -2.6, 43.2, 2.6)
      row(t, finial(1.6), trim, 2, 5.2, -2.6, 43.2, -2.6)
    }
    g.add(t)
  }

  if (hi) {
    // The framed portal: paired pilasters on pedestals, an entablature, a small pediment, a round-arched opening, niches.
    const z = front + 0.4
    put(g, box(11.4, 1.1, 1.2), trim, 0, 14.6, z - 0.2)
    put(g, pediment(7.2, 1.6, 0.7), trim, 0, 15.1, z - 0.2)
    for (const sx of [-1, 1]) for (const k of [0, 1]) {
      const x = sx * (3.9 + k * 1.5)
      put(g, box(1.0, 0.9, 1.2), trim, x, 0.45, z)
      put(g, box(0.8, 12.4, 0.9), trim, x, 7.1, z)
      put(g, box(1.05, 0.5, 1.1), trim, x, 13.5, z)
    }
    put(g, archRing(5.4, 9.6, 0.5, 0.6), trim, 0, 0, z - 0.2).rotation.set(0, 0, 0)
    put(g, archPanel(4.4, 8.8), dark, 0, 0.0, z + 0.45)
    for (const sx of [-1, 1]) put(g, box(1.2, 3.2, 0.2), dark, sx * 2.9, 6.4, z + 0.1)
    // A row of finials along the portal cornice and the coat of arms, window and relief arch above it.
    row(g, finial(1.5), trim, 6, 1.9, -4.75, 15.6, z - 0.3)
    for (const y of [4, 8.5, 13]) put(g, box(15.2, 0.2, 0.15), trim, 0, y, front + 0.05)
    row(g, finial(1.4), trim, 5, 3.6, -7.2, 26.5, front - 1.9)
    put(g, archRing(11.5, 8.4, 0.55, 0.5), trim, 0, 17.0, front + 0.3)
    put(g, box(3.2, 3.2, 0.5), trim, 0, 21.5, front + 0.4)
    put(g, box(1.4, 2.4, 0.2), dark, 0, 17.6, front + 0.45)
    // The two smaller pedimented doors at the foot of the towers.
    for (const sx of [-1, 1]) {
      const x = sx * 12.4
      put(g, pediment(5.2, 1.3, 0.5), trim, x, 8.2, front + 0.1)
      put(g, archRing(4.0, 7.0, 0.35, 0.4), trim, x, 0.6, front + 0.15)
      put(g, archPanel(3.2, 6.4), dark, x, 0.6, front + 0.5)
    }
    // Aisle windows, clerestory windows and buttresses along the nave.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const z0 = 22 - i * 7.2
        const ry = sx > 0 ? Math.PI / 2 : -Math.PI / 2
        put(g, archPanel(1.5, 4.2), dark, sx * 15.52, 6.5, z0, ry)
        put(g, archPanel(1.3, 3.4), dark, sx * 7.02, 16.6, z0, ry)
        put(g, box(1.0, aisleH, 1.0), trim, sx * 15.75, aisleH / 2, z0 - 3.6)
      }
    }
  } else {
    put(g, box(11.4, 15, 1.2), trim, 0, 7.5, front + 0.4)
  }


  bakeAO(g, CATHEDRAL.towerHeight)
  const bounds = new THREE.Box3().setFromObject(g)
  g.position.z = -(bounds.min.z + bounds.max.z) / 2
  return g
}
