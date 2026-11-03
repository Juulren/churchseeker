import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { AUTHORED, type AuthoredKind } from '../map3d/kit/registry.ts'
import { buildDrawings, rectPaths } from './drawings.ts'

const kinds = Object.keys(AUTHORED) as AuthoredKind[]

describe.each(kinds)('planta and alzado: %s', (kind) => {
  const model = AUTHORED[kind].build('high')
  const d = buildDrawings(model)

  it('measures the same as the model it is drawn from', () => {
    const s = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
    expect(d.width).toBeCloseTo(s.x, 5)
    expect(d.depth).toBeCloseTo(s.z, 5)
    expect(d.height).toBeCloseTo(s.y, 5)
  })

  it('has masses for the plan and parts for the elevation, all with finite numbers', () => {
    expect(d.plan.length).toBeGreaterThan(2)
    expect(d.elevation.length).toBeGreaterThan(8)
    for (const r of [...d.plan, ...d.elevation]) for (const n of [r.x1, r.y1, r.x2, r.y2]) expect(Number.isFinite(n)).toBe(true)
  })

  it('keeps every rectangle inside the model', () => {
    for (const r of d.plan) { expect(r.x1).toBeGreaterThanOrEqual(-d.width / 2 - 0.01); expect(r.x2).toBeLessThanOrEqual(d.width / 2 + 0.01) }
    for (const r of d.elevation) { expect(r.y1).toBeGreaterThanOrEqual(-0.01); expect(r.y2).toBeLessThanOrEqual(d.height + 0.01) }
  })

  it('turns them into clean SVG paths: openings lighter than the walls', () => {
    const p = rectPaths(d.elevation, (x) => x + d.width / 2, (y) => d.height - y)
    expect(p.solid.startsWith('M')).toBe(true)
    expect(p.light.length).toBeGreaterThan(0)
    expect(p.solid + p.light).not.toMatch(/NaN|Infinity/)
  })
})
