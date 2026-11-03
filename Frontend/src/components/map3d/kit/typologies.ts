import * as THREE from 'three'
import { archPanel, archRing, bakeAO, box, finial, frustum, kitMaterials, pediment, put, row, type Detail } from './facadeKit.ts'

// Typologies for the churches that have no model of their own: four forms of house of worship made from the same kit,
// none of them tied to one tradition. There is no cross, no crescent and no figure on any of them; the sigil on the
// church's page is what says whose it is. Each is varied by the church's own seed (towers, dome, columns).
// Metres, facade toward +z, base on y = 0, centred on the origin. They are scaled to the scene by the builder.

export type Typology = 'nave' | 'rotunda' | 'portico' | 'courtyard'
export const TYPOLOGIES: Typology[] = ['nave', 'rotunda', 'portico', 'courtyard']

/** Size of each typology in metres (longest side, width, tallest point), so the stage and the map can frame them. */
export const TYPOLOGY_META: Record<Typology, { length: number; width: number; height: number }> = {
  nave: { length: 30, width: 22, height: 24 },
  rotunda: { length: 26, width: 20, height: 22 },
  portico: { length: 26, width: 16, height: 12 },
  courtyard: { length: 30, width: 22, height: 16.6 },
}

export interface Variation { towers: number; dome: boolean; columns: number }

const columns = (g: THREE.Group, mats: ReturnType<typeof kitMaterials>, count: number, x0: number, span: number, z: number, h: number, hi: boolean) => {
  for (let i = 0; i < count; i++) {
    const x = x0 + (span * i) / Math.max(count - 1, 1)
    put(g, box(1.1, 0.7, 1.1), mats.trim, x, 0.35, z)
    put(g, new THREE.CylinderGeometry(0.4, 0.46, h - 1.4, hi ? 10 : 6), mats.trim, x, 0.7 + (h - 1.4) / 2, z)
    put(g, box(1.0, 0.5, 1.0), mats.trim, x, h - 0.45, z)
  }
}

function nave(v: Variation, hi: boolean): THREE.Group {
  const g = new THREE.Group()
  const m = kitMaterials()
  const front = 15
  put(g, box(12, 10, 30), m.stone, 0, 5, 0)
  put(g, box(12.4, 0.6, 30.4), m.roof, 0, 10.05, 0)
  put(g, box(14, 12, 2.6), m.stone, 0, 6, front - 1.3)
  put(g, box(14.6, 0.7, 3.2), m.trim, 0, 12.2, front - 1.3)
  put(g, box(8, 1.0, 2.2), m.stone, 0, 12.9, front - 1.3)
  for (let i = 0; i < Math.min(v.towers, 2); i++) {
    const s = v.towers === 1 ? 1 : i === 0 ? -1 : 1
    const t = new THREE.Group()
    t.position.set(s * 8.2, 0, front - 2.2)
    put(t, frustum(5.4, 4.8, 14), m.stone, 0, 0, 0)
    put(t, box(6, 0.6, 6), m.trim, 0, 14, 0)
    put(t, frustum(4.2, 3.6, 5), m.stone, 0, 14.6, 0)
    put(t, box(4.6, 0.5, 4.6), m.trim, 0, 19.6, 0)
    put(t, new THREE.ConeGeometry(2.0, 1.2, 4), m.trim, 0, 20.4, 0).rotation.y = Math.PI / 4
    if (hi) for (let f = 0; f < 4; f++) { const face = new THREE.Group(); face.rotation.y = (f * Math.PI) / 2; put(face, archPanel(1.5, 3.2), m.dark, 0, 16, 1.9); t.add(face) }
    g.add(t)
  }
  if (hi) {
    put(g, archRing(4.6, 7.4, 0.45, 0.5), m.trim, 0, 0, front + 0.1)
    put(g, archPanel(3.6, 6.6), m.dark, 0, 0, front + 0.4)
    put(g, box(2.2, 3.2, 0.3), m.trim, 0, 9.4, front + 0.1)
    put(g, box(1.4, 2.4, 0.15), m.dark, 0, 9.4, front + 0.25)
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
      const ry = sx > 0 ? Math.PI / 2 : -Math.PI / 2
      put(g, archPanel(1.2, 3.8), m.dark, sx * 6.02, 4.5, 10 - i * 7, ry)
      put(g, box(0.9, 10, 0.9), m.trim, sx * 6.2, 5, 6.5 - i * 7)
    }
  } else put(g, box(4.6, 7.4, 0.5), m.dark, 0, 3.7, front + 0.2)
  if (v.dome) {
    put(g, new THREE.CylinderGeometry(3.4, 3.7, 3.4, hi ? 14 : 8), m.stone, 0, 11.7, -4)
    put(g, new THREE.SphereGeometry(3.4, hi ? 16 : 8, hi ? 8 : 4, 0, Math.PI * 2, 0, Math.PI / 2), m.trim, 0, 13.4, -4)
  }
  return g
}

function rotunda(v: Variation, hi: boolean): THREE.Group {
  const g = new THREE.Group()
  const m = kitMaterials()
  put(g, new THREE.CylinderGeometry(9, 9.4, 11, hi ? 24 : 12), m.stone, 0, 5.5, -2)
  put(g, new THREE.CylinderGeometry(9.5, 9.5, 0.8, hi ? 24 : 12), m.trim, 0, 11.4, -2)
  put(g, new THREE.SphereGeometry(8.8, hi ? 28 : 12, hi ? 12 : 6, 0, Math.PI * 2, 0, Math.PI / 2), m.trim, 0, 11.8, -2).scale.set(1, 0.8, 1)
  put(g, new THREE.CylinderGeometry(1.5, 1.7, 2.8, 10), m.trim, 0, 19.2, -2)
  put(g, new THREE.SphereGeometry(1.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.trim, 0, 20.6, -2)
  // The portico: columns, an entablature and a low pediment, on steps.
  const z = 8.2
  put(g, box(14, 0.5, 6), m.trim, 0, 0.25, z - 1)
  put(g, box(14, 1.0, 5), m.stone, 0, 9.4, z - 1.2)
  put(g, pediment(14, 2.6, 4.6), m.trim, 0, 9.9, z - 3.5)
  columns(g, m, Math.max(4, Math.min(v.columns, 8)), -6, 12, z, 9, hi)
  put(g, box(5, 9, 2), m.stone, 0, 4.5, z - 4.6)
  if (hi) {
    put(g, archPanel(3, 6), m.dark, 0, 0, z - 3.5)
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI * 2) / 8 + Math.PI / 8; const w = put(g, archPanel(1.2, 3), m.dark, Math.cos(a) * 9.45, 4, -2 + Math.sin(a) * 9.45); w.rotation.y = Math.PI / 2 - a }
  }
  return g
}

function portico(v: Variation, hi: boolean): THREE.Group {
  const g = new THREE.Group()
  const m = kitMaterials()
  put(g, box(13, 9, 20), m.stone, 0, 4.5, -3)
  put(g, box(13.6, 0.6, 20.6), m.roof, 0, 9.05, -3)
  const z = 11
  const n = Math.max(4, Math.min(v.columns, 8))
  put(g, box(16, 0.5, 6), m.trim, 0, 0.25, z - 0.5)
  columns(g, m, n, -7, 14, z + 1.5, 8.2, hi)
  put(g, box(16, 1.0, 1.6), m.trim, 0, 8.7, z + 1.5)
  put(g, pediment(16, 2.8, 1.4), m.trim, 0, 9.2, z + 0.8)
  if (hi) {
    put(g, archRing(4.2, 6.6, 0.4, 0.5), m.trim, 0, 0, 7.1)
    put(g, archPanel(3.4, 6), m.dark, 0, 0, 7.5)
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) put(g, archPanel(1.4, 4), m.dark, sx * 6.52, 2.5, 5.5 - i * 6, sx > 0 ? Math.PI / 2 : -Math.PI / 2)
  } else put(g, box(4.2, 6.6, 0.5), m.dark, 0, 3.3, 7.3)
  return g
}

function courtyard(v: Variation, hi: boolean): THREE.Group {
  const g = new THREE.Group()
  const m = kitMaterials()
  // A hall at the back, two wings and a wall with a gate at the front around an open court.
  put(g, box(14, 11, 9), m.stone, 0, 5.5, -10)
  put(g, box(14.6, 0.6, 9.6), m.roof, 0, 11.05, -10)
  for (const s of [-1, 1]) {
    put(g, box(3.4, 7, 22), m.stone, s * 9.3, 3.5, 0)
    put(g, box(3.8, 0.5, 22.4), m.roof, s * 9.3, 7.05, 0)
  }
  for (const s of [-1, 1]) put(g, box(8.4, 4.5, 1.2), m.stone, s * 6.8, 2.25, 11.4)
  put(g, box(5.2, 1.2, 1.2), m.trim, 0, 5.2, 11.4)
  put(g, archRing(5.4, 4.6, 0.45, 1.3), m.trim, 0, 0, 10.8)
  put(g, box(5.4, 0.4, 1.4), m.trim, 0, 5.9, 11.4)
  if (v.dome) {
    put(g, new THREE.CylinderGeometry(3, 3.2, 2.6, hi ? 12 : 8), m.stone, 0, 12.3, -10)
    put(g, new THREE.SphereGeometry(3, hi ? 14 : 8, hi ? 7 : 4, 0, Math.PI * 2, 0, Math.PI / 2), m.trim, 0, 13.6, -10)
  }
  if (hi) {
    put(g, archPanel(3.6, 4), m.dark, 0, 0, 12.05)
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) put(g, archPanel(1.2, 3.4), m.dark, s * 7.58, 2.2, 7 - i * 5, s > 0 ? -Math.PI / 2 : Math.PI / 2)
    put(g, archPanel(3.4, 6), m.dark, 0, 0, -5.45)
    row(g, finial(1.2), m.trim, 4, 3.4, -5.1, 7.4, 11.4)
  }
  return g
}

const BUILDERS: Record<Typology, (v: Variation, hi: boolean) => THREE.Group> = { nave, rotunda, portico, courtyard }

export function buildTypology(kind: Typology, v: Variation, detail: Detail = 'high'): THREE.Group {
  const g = BUILDERS[kind](v, detail === 'high')
  bakeAO(g, TYPOLOGY_META[kind].height)
  const b = new THREE.Box3().setFromObject(g)
  g.position.x = -(b.min.x + b.max.x) / 2
  g.position.z = -(b.min.z + b.max.z) / 2
  return g
}
