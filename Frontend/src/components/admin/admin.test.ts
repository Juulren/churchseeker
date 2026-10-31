import { describe, expect, it } from 'vitest'
import { qs } from '../../services/adminApi.ts'
import { allowedNav } from './nav.ts'
import { addDays, emptyToNull, formatMoney, monthGrid, monthRange, scaleBars, todayIso } from './format.ts'

describe('qs', () => {
  it('skips empty values and encodes the rest', () => {
    expect(qs({})).toBe('')
    expect(qs({ a: 1, b: '', c: null, d: undefined, e: false })).toBe('?a=1&e=false')
    expect(qs({ search: "o'neil & sons=?#" })).toBe('?search=o%27neil+%26+sons%3D%3F%23')
  })
})

describe('dates', () => {
  it('adds days across month and year boundaries without time-zone drift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(addDays('2026-11-01', 120)).toBe('2027-03-01')
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('gives the first and last day of a month', () => {
    expect(monthRange(2026, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange(2028, 1).to).toBe('2028-02-29')
    expect(monthRange(2026, 11)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('monthGrid', () => {
  it('is always 6 weeks of 7 days, Monday first, covering the month exactly once', () => {
    for (const [y, m] of [[2026, 0], [2026, 1], [2026, 10], [2027, 1], [2024, 1], [2026, 11]] as const) {
      const g = monthGrid(y, m)
      expect(g).toHaveLength(6)
      for (const w of g) expect(w).toHaveLength(7)
      const inMonth = g.flat().filter((c) => c.inMonth)
      expect(inMonth.map((c) => c.day)).toEqual(Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => i + 1))
      expect(new Date(g[0][0].iso + 'T12:00:00').getDay()).toBe(1)
    }
  })

  it('has unique, consecutive dates', () => {
    const iso = monthGrid(2026, 9).flat().map((c) => c.iso)
    expect(new Set(iso).size).toBe(42)
    for (let i = 1; i < iso.length; i++) expect(iso[i] > iso[i - 1]).toBe(true)
  })
})

describe('scaleBars', () => {
  it('scales to the largest value and survives hostile series', () => {
    expect(scaleBars([1, 2, 4])).toEqual([0.25, 0.5, 1])
    expect(scaleBars([])).toEqual([])
    expect(scaleBars([0, 0])).toEqual([0, 0])
    expect(scaleBars([-5, NaN, Infinity, 3])).toEqual([0, 0, 0, 1])
  })
})

describe('helpers', () => {
  it('formats money safely', () => {
    expect(formatMoney(1234.5)).toMatch(/1,234\.50/)
    expect(formatMoney(NaN)).toBe('—')
    expect(formatMoney(Infinity)).toBe('—')
  })

  it('turns blank text into null', () => {
    expect(emptyToNull('')).toBeNull()
    expect(emptyToNull('   ')).toBeNull()
    expect(emptyToNull(' hola ')).toBe('hola')
  })
})

describe('role navigation', () => {
  const labels = (r: Parameters<typeof allowedNav>[0]) => allowedNav(r).map((n) => n.path)

  it('shows finance only to Tesorero and Administrador', () => {
    expect(labels('Tesorero')).toContain('donations')
    expect(labels('Administrador')).toContain('donations')
    for (const r of ['Pastor', 'Secretario', 'Coordinador'] as const) expect(labels(r)).not.toContain('donations')
  })

  it('limits settings to the Administrador and members to management', () => {
    expect(labels('Administrador')).toContain('settings')
    for (const r of ['Pastor', 'Secretario', 'Tesorero', 'Coordinador'] as const) expect(labels(r)).not.toContain('settings')
    expect(labels('Coordinador')).not.toContain('members')
    expect(labels('Coordinador')).toContain('ministries')
  })

  it('every role at least sees the dashboard', () => {
    for (const r of ['Administrador', 'Pastor', 'Secretario', 'Tesorero', 'Coordinador'] as const) expect(labels(r)).toContain('dashboard')
  })
})
