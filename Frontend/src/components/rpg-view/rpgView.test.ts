import { describe, expect, it, vi } from 'vitest'
import { fetchChurchData } from './churchData.ts'
import { dayName, formatDate, formatShortDate, formatTime, groupEventsByDate, isoDate, parseDate, scheduleLabel } from './format.ts'
import type { PublicEvent } from '../../services/types.ts'

const ev = (id: string, date: string, time: string): PublicEvent =>
  ({ id, title: id, description: null, date, time, location: 'Nave', kind: 1, isCancelled: false })

describe('dates and times', () => {
  it('parses only real calendar dates', () => {
    expect(parseDate('2026-11-03')).not.toBeNull()
    for (const bad of ['2026-02-30', '2026-13-01', '03/11/2026', '', 'hoy', '2026-1-1', '2026-11-03T10:00', '<script>', 'NaN-NaN-NaN'])
      expect(parseDate(bad)).toBeNull()
    expect(parseDate(undefined as unknown as string)).toBeNull()
    expect(parseDate(null as unknown as string)).toBeNull()
  })

  it('formats in Spanish and never shows "Invalid Date"', () => {
    expect(formatDate('2026-11-03')).toMatch(/noviembre/i)
    expect(formatDate('2026-11-03')).toContain('2026')
    expect(formatShortDate('2026-11-03')).toMatch(/nov/i)
    expect(formatDate('garbage')).toBe('garbage')
    expect(formatDate('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
  })

  it('does not shift the day across time zones', () => {
    const d = parseDate('2026-01-01')!
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 1])
    expect(isoDate(d)).toBe('2026-01-01')
  })

  it('formats times and schedule lines', () => {
    expect(formatTime('09:00:00')).toBe('09:00')
    expect(formatTime('18:30')).toBe('18:30')
    expect(formatTime('late')).toBe('late')
    expect(dayName(0)).toBe('Domingo')
    expect(dayName(6)).toBe('Sábado')
    expect(dayName(99)).toBe('—')
    expect(scheduleLabel({ day: 0, time: '09:00:00', description: 'Misa dominical' })).toBe('Domingo 09:00 · Misa dominical')
  })
})

describe('groupEventsByDate', () => {
  it('groups by day, sorts chronologically and does not mutate its input', () => {
    const input = [ev('c', '2026-11-05', '10:00:00'), ev('a', '2026-11-03', '18:00:00'), ev('b', '2026-11-03', '09:00:00')]
    const copy = [...input]
    const groups = groupEventsByDate(input)
    expect(input).toEqual(copy)
    expect(groups.map((g) => g.date)).toEqual(['2026-11-03', '2026-11-05'])
    expect(groups[0].events.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('handles an empty list', () => {
    expect(groupEventsByDate([])).toEqual([])
  })
})

describe('fetchChurchData', () => {
  const profile = { id: '1', name: 'X' } as never
  const ok = () => ({
    church: vi.fn(async () => profile),
    events: vi.fn(async () => [ev('e', '2026-11-03', '09:00:00')]),
    announcements: vi.fn(async () => []),
    books: vi.fn(async () => []),
  })

  it('loads every section in parallel', async () => {
    const api = ok()
    const data = await fetchChurchData('abc', api, new Date(2026, 10, 1))
    expect(data.profile.data).toBe(profile)
    expect(data.events.data).toHaveLength(1)
    expect(data.events.error).toBeNull()
    expect(api.events).toHaveBeenCalledWith('abc', '2026-11-01', '2027-03-01')
  })

  it('keeps the other sections when one fails', async () => {
    const api = ok()
    api.events = vi.fn(async () => { throw new Error('boom') })
    api.books = vi.fn(async () => { throw 'not even an Error' })
    const data = await fetchChurchData('abc', api)
    expect(data.events).toEqual({ data: null, error: 'boom' })
    expect(data.books.error).toBe('No se pudo cargar.')
    expect(data.profile.data).toBe(profile)
    expect(data.announcements.data).toEqual([])
  })
})
