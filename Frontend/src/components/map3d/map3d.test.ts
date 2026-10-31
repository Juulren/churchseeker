import { describe, expect, it } from 'vitest'
import { styleFor } from './churchStyles.ts'
import {
  MERIDA_CENTER, UNIT_METERS, centroid, focusPose, overviewPose, project, validCoordinates,
} from './projection.ts'
import { BLOCK, STREET, mulberry32, scatterHouses, scatterTrees } from './scatter.ts'

// The three pilot churches (same coordinates as the database seed).
const CATHEDRAL = { lat: 20.96737, lng: -89.62369 }
const SANTA_LUCIA = { lat: 20.9716, lng: -89.6248 }
const JESUS = { lat: 20.9661, lng: -89.6234 }

describe('project', () => {
  const origin = centroid([CATHEDRAL, SANTA_LUCIA, JESUS])

  it('puts the origin at zero', () => {
    const p = project(origin, origin)
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.z).toBeCloseTo(0, 9)
  })

  it('maps north to -z and east to +x', () => {
    const north = project({ lat: origin.lat + 0.001, lng: origin.lng }, origin)
    const east = project({ lat: origin.lat, lng: origin.lng + 0.001 }, origin)
    expect(north.z).toBeLessThan(0)
    expect(north.x).toBeCloseTo(0, 9)
    expect(east.x).toBeGreaterThan(0)
    expect(east.z).toBeCloseTo(0, 9)
  })

  it('keeps real-world distances (Cathedral to Santa Lucía is about 480 m)', () => {
    const a = project(CATHEDRAL, origin)
    const b = project(SANTA_LUCIA, origin)
    const metres = Math.hypot(a.x - b.x, a.z - b.z) * UNIT_METERS
    expect(metres).toBeGreaterThan(430)
    expect(metres).toBeLessThan(520)
  })

  it('places the churches far enough apart for their models not to overlap', () => {
    const pts = [CATHEDRAL, SANTA_LUCIA, JESUS].map((c) => project(c, origin))
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)).toBeGreaterThan(8)
  })

  it('stays finite at the poles and across the date line', () => {
    for (const p of [{ lat: 90, lng: 180 }, { lat: -90, lng: -180 }, { lat: 0, lng: 0 }]) {
      const r = project(p, MERIDA_CENTER)
      expect(Number.isFinite(r.x) && Number.isFinite(r.z)).toBe(true)
    }
  })
})

describe('validCoordinates', () => {
  it('drops churches whose coordinates are missing or out of range', () => {
    const items = [
      { lat: 20, lng: -89 }, { lat: NaN, lng: 1 }, { lat: 1, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 },
      { lat: undefined as unknown as number, lng: 0 }, { lat: null as unknown as number, lng: 0 },
    ]
    // null coerces to 0 in Number.isFinite? it does not: Number.isFinite(null) is false.
    expect(validCoordinates(items)).toEqual([{ lat: 20, lng: -89 }])
  })

  it('has a sane centroid even for an empty list', () => {
    expect(centroid([])).toEqual(MERIDA_CENTER)
  })
})

describe('camera poses', () => {
  it('frames a church from the south, above the ground, looking at it', () => {
    const pose = focusPose({ x: 10, z: -4 }, 20)
    expect(pose.position[0]).toBeCloseTo(10)
    expect(pose.position[2]).toBeGreaterThan(-4)
    expect(pose.position[1]).toBeGreaterThan(1.5)
    expect(pose.lookAt[0]).toBe(10)
    expect(pose.lookAt[2]).toBe(-4)
    expect(Math.hypot(pose.position[1] - pose.lookAt[1], pose.position[2] - pose.lookAt[2])).toBeCloseTo(20, 5)
  })

  it('zooms out far enough to show every church', () => {
    const pts = [{ x: -20, z: 10 }, { x: 15, z: -18 }, { x: 5, z: 6 }]
    const pose = overviewPose(pts)
    expect(pose.lookAt[1]).toBe(0)
    const dist = Math.hypot(pose.position[0] - pose.lookAt[0], pose.position[1], pose.position[2] - pose.lookAt[2])
    expect(dist).toBeGreaterThan(55)
    expect(dist).toBeLessThanOrEqual(130 * 1.1)
  })

  it('has a default view when there are no churches', () => {
    expect(overviewPose([])).toEqual({ position: [0, 45, 55], lookAt: [0, 0, 0] })
  })

  it('caps the distance when churches are scattered widely', () => {
    const pose = overviewPose([{ x: -5000, z: 0 }, { x: 5000, z: 0 }])
    const dist = Math.hypot(pose.position[0] - pose.lookAt[0], pose.position[1], pose.position[2] - pose.lookAt[2])
    expect(dist).toBeLessThanOrEqual(130 * 1.1)
  })
})

describe('styleFor', () => {
  it('gives the pilot churches their own architecture', () => {
    const cathedral = styleFor({ id: '11111111-1111-1111-1111-111111111111' })
    const lucia = styleFor({ id: '22222222-2222-2222-2222-222222222222' })
    const jesus = styleFor({ id: '33333333-3333-3333-3333-333333333333' })
    expect(cathedral.towers).toBe(2)
    expect(lucia.arches).toBeGreaterThan(0)
    expect(jesus.dome).toBe(true)
    expect(new Set([cathedral.wall, lucia.wall, jesus.wall]).size).toBe(3)
  })

  it('is stable and valid for churches added later', () => {
    for (const id of ['abc', '', 'ñandú', '00000000-0000-0000-0000-000000000000', 'x'.repeat(5000)]) {
      const a = styleFor({ id })
      expect(styleFor({ id })).toEqual(a)
      expect(a.wall).toMatch(/^#[0-9a-f]{6}$/i)
      expect([0, 1, 2]).toContain(a.towers)
      expect(a.length).toBeGreaterThan(4)
      expect(a.width).toBeGreaterThan(3)
      expect(a.height).toBeGreaterThan(2)
    }
  })
})

describe('scatter', () => {
  const exclusions = [{ x: 0, z: 0, r: 5 }, { x: 20, z: -12, r: 5 }]

  it('is deterministic', () => {
    expect(scatterHouses(7, 38, exclusions)).toEqual(scatterHouses(7, 38, exclusions))
    expect(scatterTrees(7, 38, 100, exclusions)).toEqual(scatterTrees(7, 38, 100, exclusions))
    expect(mulberry32(1)()).toBe(mulberry32(1)())
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('never buries a church under houses or trees', () => {
    const houses = scatterHouses(2026, 38, exclusions)
    const trees = scatterTrees(2026, 38, 140, exclusions)
    expect(houses.length).toBeGreaterThan(50)
    for (const e of exclusions) {
      for (const h of houses) expect(Math.hypot(h.x - e.x, h.z - e.z)).toBeGreaterThanOrEqual(e.r)
      for (const t of trees) expect(Math.hypot(t.x - e.x, t.z - e.z)).toBeGreaterThanOrEqual(e.r)
    }
  })

  it('keeps houses inside the island and trees off the streets', () => {
    for (const h of scatterHouses(2026, 38, [])) {
      expect(Math.abs(h.x)).toBeLessThanOrEqual(38)
      expect(Math.abs(h.z)).toBeLessThanOrEqual(38)
      expect(h.h).toBeGreaterThan(0)
    }
    for (const t of scatterTrees(2026, 38, 140, [])) {
      const fx = ((t.x % BLOCK) + BLOCK) % BLOCK
      const fz = ((t.z % BLOCK) + BLOCK) % BLOCK
      expect(Math.min(fx, BLOCK - fx)).toBeGreaterThanOrEqual(STREET)
      expect(Math.min(fz, BLOCK - fz)).toBeGreaterThanOrEqual(STREET)
    }
  })

  it('terminates and stays bounded with absurd inputs', () => {
    expect(scatterTrees(1, 38, 1_000, [{ x: 0, z: 0, r: 1000 }])).toEqual([])
    expect(scatterHouses(1, 0, [])).toEqual([])
    expect(scatterHouses(1, 38, [{ x: 0, z: 0, r: 1e6 }])).toEqual([])
  })
})
