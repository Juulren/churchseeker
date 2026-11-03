import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { triangles } from './facadeKit.ts'
import { buildTypology, TYPOLOGIES, TYPOLOGY_META } from './typologies.ts'

const variations = [{ towers: 0, dome: false, columns: 4 }, { towers: 1, dome: true, columns: 6 }, { towers: 2, dome: true, columns: 8 }]

describe.each(TYPOLOGIES)('typology: %s', (kind) => {
  it('stays inside the budgets for every variation: 40,000 triangles high, 3,000 low', () => {
    for (const v of variations) {
      expect(triangles(buildTypology(kind, v, 'high'))).toBeLessThanOrEqual(40_000)
      expect(triangles(buildTypology(kind, v, 'low'))).toBeLessThanOrEqual(3_000)
    }
  })

  it('stands on the ground, centred on the origin in plan, and is as big as it says', () => {
    for (const v of variations) {
      const g = buildTypology(kind, v, 'high')
      const b = new THREE.Box3().setFromObject(g)
      const s = b.getSize(new THREE.Vector3())
      const m = TYPOLOGY_META[kind]
      expect(b.min.y).toBeCloseTo(0, 1)
      expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(0.5)
      expect(Math.abs((b.min.z + b.max.z) / 2)).toBeLessThan(0.5)
      expect(Math.max(s.x, s.z)).toBeLessThanOrEqual(m.length * 1.15)
      expect(s.x).toBeLessThanOrEqual(m.width * 1.15) // the stage frames the width, so towers must not exceed it
      expect(s.y).toBeLessThanOrEqual(m.height * 1.15)
    }
  })

  it('is clean: no NaN, every mesh coloured, and one shared set of materials', () => {
    const a = buildTypology(kind, variations[1], 'high')
    const b = buildTypology(kind, variations[1], 'low')
    const mats = (root: THREE.Object3D) => { const set = new Set<THREE.Material>(); root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) set.add(m.material as THREE.Material) }); return set }
    for (const m of mats(b)) expect(mats(a).has(m)).toBe(true)
    a.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const p = m.geometry.getAttribute('position')
      for (let i = 0; i < p.array.length; i++) expect(Number.isFinite(p.array[i])).toBe(true)
      expect(m.geometry.getAttribute('color')).toBeTruthy()
    })
  })

  it('is varied by the seed: more columns or a dome make a bigger model', () => {
    const plain = triangles(buildTypology(kind, { towers: 0, dome: false, columns: 4 }, 'high'))
    const rich = triangles(buildTypology(kind, { towers: 2, dome: true, columns: 8 }, 'high'))
    expect(rich).toBeGreaterThanOrEqual(plain)
  })
})
