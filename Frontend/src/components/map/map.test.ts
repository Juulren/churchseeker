import { describe, expect, it } from 'vitest'
import {
  MERIDA_CENTER, centroid, validCoordinates,
} from './projection.ts'

// The three pilot churches (same coordinates as the database seed).
const CATHEDRAL = { lat: 20.96737, lng: -89.62369 }
const SANTA_LUCIA = { lat: 20.9716, lng: -89.6248 }
const JESUS = { lat: 20.9661, lng: -89.6234 }

describe('validCoordinates', () => {
  it('drops churches whose coordinates are missing or out of range', () => {
    const items = [
      { lat: 20, lng: -89 }, { lat: NaN, lng: 1 }, { lat: 1, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 },
      { lat: undefined as unknown as number, lng: 0 }, { lat: null as unknown as number, lng: 0 },
    ]
    // null coerces to 0 in Number.isFinite? it does not: Number.isFinite(null) is false.
    expect(validCoordinates(items)).toEqual([{ lat: 20, lng: -89 }])
  })

  it('centres the map on the middle of the churches', () => {
    const c = centroid([CATHEDRAL, SANTA_LUCIA, JESUS])
    expect(c.lat).toBeCloseTo((CATHEDRAL.lat + SANTA_LUCIA.lat + JESUS.lat) / 3, 9)
    expect(c.lng).toBeCloseTo((CATHEDRAL.lng + SANTA_LUCIA.lng + JESUS.lng) / 3, 9)
  })

  it('has a sane centroid even for an empty list', () => {
    expect(centroid([])).toEqual(MERIDA_CENTER)
  })
})

