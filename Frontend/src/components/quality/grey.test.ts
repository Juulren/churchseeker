import { describe, expect, it } from 'vitest'
import { luma, readableOn, toGrey } from './grey.ts'

describe('toGrey', () => {
  it('keeps black, white and greys', () => {
    expect(toGrey('#000000')).toBe('#000000')
    expect(toGrey('#ffffff')).toBe('#ffffff')
    expect(toGrey('#808080')).toBe('#808080')
  })

  it('always returns equal red, green and blue', () => {
    for (const c of ['#d8c9a3', '#8c5a3c', '#7ba7a0', '#e3b66d', '#f0f', '#123']) {
      const g = toGrey(c)
      expect(g).toMatch(/^#([0-9a-f]{2})\1\1$/)
    }
  })

  it('keeps brightness order: a light wall stays lighter than a dark roof', () => {
    expect(parseInt(toGrey('#f0e0bd').slice(1, 3), 16)).toBeGreaterThan(parseInt(toGrey('#7a3f5e').slice(1, 3), 16))
  })

  it('turns anything that is not a hex colour into mid grey', () => {
    expect(toGrey('red')).toBe('#808080')
    expect(toGrey('rgb(1,2,3)')).toBe('#808080')
  })

  it('picks ink that stays readable on any spine', () => {
    expect(readableOn('#f0f0f0')).toBe('#161616')
    expect(readableOn('#202020')).toBe('#ececec')
    expect(luma('#000000')).toBe(0)
    expect(luma('#ffffff')).toBe(255)
  })
})
