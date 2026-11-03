import { describe, expect, it } from 'vitest'
import { SIGIL_FOLD, sigilMarks, sigilPath } from './sigil.ts'

const NAMES = ['Catedral de San Ildefonso', 'Iglesia de Jesús (Tercera Orden)', 'Iglesia de Santa Lucía', 'Mezquita', 'Sinagoga', 'Templo del Sol', '']

describe('sigil', () => {
  it('is seven-fold, so it can never hold a cross or a hexagram', () => {
    expect(SIGIL_FOLD).toBe(7)
    expect(SIGIL_FOLD % 2).toBe(1)
    expect(SIGIL_FOLD % 4).not.toBe(0)
    expect(SIGIL_FOLD % 6).not.toBe(0)
  })

  it('is deterministic per name and differs between names', () => {
    expect(sigilPath('Santa Lucía')).toBe(sigilPath('santa lucía'))
    expect(sigilPath('Catedral de San Ildefonso')).not.toBe(sigilPath('Iglesia de Santa Lucía'))
  })

  it('keeps every mark inside the circle for every name', () => {
    for (const n of NAMES) for (const m of sigilMarks(n)) { expect(m.r1).toBeGreaterThan(0); expect(m.r2).toBeLessThanOrEqual(0.95) }
  })

  it('draws a path for every name, empty names included', () => {
    for (const n of NAMES) expect(sigilPath(n).startsWith('M')).toBe(true)
  })
})
