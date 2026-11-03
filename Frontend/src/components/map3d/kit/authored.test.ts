import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { triangles } from './facadeKit.ts'
import { AUTHORED, AUTHORED_SIZE, authoredScale, type AuthoredKind } from './registry.ts'
import { styleFor } from '../churchStyles.ts'
import { buildChurch, churchTop } from '../churchBuilder.ts'

const kinds = Object.keys(AUTHORED) as AuthoredKind[]
const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())

describe.each(kinds)('authored church: %s', (kind) => {
  const a = AUTHORED[kind]
  const high = a.build('high')
  const low = a.build('low')

  it('stays inside the budgets: 40,000 triangles for the viewer and 3,000 for the map', () => {
    expect(triangles(high)).toBeLessThanOrEqual(40_000)
    expect(triangles(low)).toBeLessThanOrEqual(3_000)
    expect(triangles(low)).toBeLessThan(triangles(high))
  })

  it('fits a 72 by 72 by 45 m box, stands on the ground and is centred on the origin in plan', () => {
    const b = new THREE.Box3().setFromObject(high)
    const s = size(high)
    expect(Math.max(s.x, s.z)).toBeLessThanOrEqual(72)
    expect(s.y).toBeLessThanOrEqual(45)
    expect(b.min.y).toBeCloseTo(0, 1)
    expect(Math.abs((b.min.x + b.max.x) / 2)).toBeLessThan(1)
    expect(Math.abs((b.min.z + b.max.z) / 2)).toBeLessThan(1)
  })

  it('says its own size truthfully: the registered length and height match the model within 5%', () => {
    const s = size(high)
    expect(Math.abs(Math.max(s.x, s.z) - a.length) / a.length).toBeLessThan(0.05)
    expect(Math.abs(s.y - a.height) / a.height).toBeLessThan(0.05)
  })

  it('has as many towers as the real building: pairs of tall square shafts at the front', () => {
    const towers: THREE.Object3D[] = []
    high.traverse((o) => { if (o.type === 'Group' && o.position.y === 0 && Math.abs(o.position.x) > 6 && o !== high) towers.push(o) })
    expect(towers).toHaveLength(a.towers)
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

  it('is scaled into the scene so its longest side is the standard size', () => {
    const id = { cathedral: '11111111-1111-1111-1111-111111111111', santalucia: '22222222-2222-2222-2222-222222222222', jesus: '33333333-3333-3333-3333-333333333333' }[kind]
    const style = styleFor({ id })
    expect(style.authored).toBe(kind)
    const built = buildChurch(style, 'low')
    const s = size(built)
    expect(Math.max(s.x, s.z)).toBeGreaterThan(AUTHORED_SIZE * 0.95)
    // The low plinth the church stands on adds a little to the footprint.
    expect(Math.max(s.x, s.z)).toBeLessThan(AUTHORED_SIZE * 1.6)
    expect(churchTop(style)).toBeCloseTo(a.height * authoredScale(kind), 5)
  })
})
