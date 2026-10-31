import { describe, expect, it } from 'vitest'
import { styleFor } from './churchStyles.ts'
import {
  MERIDA_CENTER, UNIT_METERS, centroid, project, validCoordinates,
} from './projection.ts'

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

