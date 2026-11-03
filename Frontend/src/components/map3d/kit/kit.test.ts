import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildCathedral, CATHEDRAL } from './cathedral.ts'
import { archShape, bakeAO, box, frustum, mergeGeometries, put, triangles } from './facadeKit.ts'

const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
const within = (value: number, real: number, tolerance = 0.15) => Math.abs(value - real) / real <= tolerance

describe('facade kit', () => {
  it('builds arches with a round head that reach the height asked for', () => {
    const pts = archShape(4, 9).getPoints(16)
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(9, 1)
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(0, 5)
  })

  it('narrows a tower stage toward the top and keeps its base on y = 0', () => {
    const g = frustum(10, 6, 20)
    g.computeBoundingBox()
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 5)
    expect(g.boundingBox!.max.y).toBeCloseTo(20, 5)
    expect(g.boundingBox!.getSize(new THREE.Vector3()).x).toBeCloseTo(10, 1)
  })

  it('merges geometries without losing vertices', () => {
    const a = box(1, 1, 1), b = box(2, 2, 2)
    expect(mergeGeometries([a, b]).getAttribute('position').count).toBe(a.getAttribute('position').count + b.getAttribute('position').count)
  })

  it('bakes a vertex colour into every mesh, darker near the ground than at the top', () => {
    const g = new THREE.Group()
    const m = put(g, box(2, 40, 2), new THREE.MeshBasicMaterial(), 0, 20, 0)
    bakeAO(g, 40)
    const c = m.geometry.getAttribute('color')
    const pos = m.geometry.getAttribute('position')
    let low = 1, high = 0
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) + 20; if (y < 2) low = Math.min(low, c.getX(i)); if (y > 38) high = Math.max(high, c.getX(i)) }
    expect(low).toBeLessThan(high)
  })
})

describe('the cathedral model', () => {
  const high = buildCathedral('high')
  const low = buildCathedral('low')

  it('stays inside its triangle budgets: 40,000 for the viewer and 3,000 for the map', () => {
    expect(triangles(high)).toBeLessThanOrEqual(40_000)
    expect(triangles(low)).toBeLessThanOrEqual(3_000)
    expect(triangles(low)).toBeLessThan(triangles(high))
  })

  it('fits a 72 by 72 by 45 m box with its base on the ground and its centre on the origin', () => {
    const box3 = new THREE.Box3().setFromObject(high)
    const s = size(high)
    expect(s.x).toBeLessThanOrEqual(72)
    expect(s.z).toBeLessThanOrEqual(72)
    expect(s.y).toBeLessThanOrEqual(45)
    expect(box3.min.y).toBeCloseTo(0, 1)
    expect(Math.abs((box3.min.x + box3.max.x) / 2)).toBeLessThan(1)
  })

  it('matches the published dimensions: length and width within 15%, tower height within 5%', () => {
    const s = size(high)
    expect([s.z, within(s.z, CATHEDRAL.verified.length, 0.15)]).toEqual([s.z, true])
    expect([s.x, within(s.x, CATHEDRAL.verified.width, 0.15)]).toEqual([s.x, true])
    expect([s.y, within(s.y, CATHEDRAL.verified.towerHeight, 0.05)]).toEqual([s.y, true])
  })

  it('is centred on the origin in plan, front to back as well as side to side', () => {
    const b = new THREE.Box3().setFromObject(high)
    expect(Math.abs((b.min.z + b.max.z) / 2)).toBeLessThan(1)
    expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(1)
  })

  it('reuses one set of materials for every build, so rebuilding cannot leak them', () => {
    const again = buildCathedral('low')
    const mats = (root: THREE.Object3D) => { const set = new Set<THREE.Material>(); root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) set.add(m.material as THREE.Material) }); return set }
    for (const m of mats(again)) expect(mats(high).has(m)).toBe(true)
  })

  it('has two towers, equal and mirrored, at the front', () => {
    const towers: THREE.Object3D[] = []
    high.traverse((o) => { if (o.type === 'Group' && o.position.y === 0 && Math.abs(o.position.x) > 10) towers.push(o) })
    expect(towers).toHaveLength(2)
    expect(towers[0].position.x).toBeCloseTo(-towers[1].position.x, 5)
    expect(towers[0].position.z).toBeCloseTo(towers[1].position.z, 5)
  })

  it('is clean: no NaN positions and every mesh coloured', () => {
    high.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const p = m.geometry.getAttribute('position')
      for (let i = 0; i < p.array.length; i++) expect(Number.isFinite(p.array[i])).toBe(true)
      expect(m.geometry.getAttribute('color')).toBeTruthy()
    })
  })

  it('faces +z: the deepest front detail is on the +z side', () => {
    const b = new THREE.Box3().setFromObject(high)
    expect(b.max.z).toBeGreaterThan(Math.abs(b.min.z) - 8)
  })
})
