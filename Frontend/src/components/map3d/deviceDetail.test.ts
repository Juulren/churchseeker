import { describe, expect, it } from 'vitest'
import { deviceDetail } from './deviceDetail.ts'

describe('deviceDetail', () => {
  it('builds the full level by default and when nothing is known', () => {
    expect(deviceDetail(null)).toBe('high')
    expect(deviceDetail({})).toBe('high')
    expect(deviceDetail({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe('high')
  })
  it('drops to the light level on a weak device', () => {
    expect(deviceDetail({ deviceMemory: 2 })).toBe('low')
    expect(deviceDetail({ hardwareConcurrency: 2 })).toBe('low')
    expect(deviceDetail({ connection: { saveData: true } })).toBe('low')
  })
})
