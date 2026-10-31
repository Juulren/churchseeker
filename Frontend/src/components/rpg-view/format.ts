import type { PublicEvent, ScheduleSlot } from '../../services/types.ts'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^(\d{2}):(\d{2})/

/** Parses `yyyy-MM-dd` as a calendar date (no timezone shifts). Returns null for anything else. */
export function parseDate(value: string): Date | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

/** "martes, 3 de noviembre de 2026"; falls back to the raw text if the date is not valid. */
export function formatDate(value: string): string {
  const d = parseDate(value)
  return d ? new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d) : String(value)
}

export function formatShortDate(value: string): string {
  const d = parseDate(value)
  return d ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(d) : String(value)
}

/** "09:00:00" becomes "09:00". Anything else is returned untouched. */
export function formatTime(value: string): string {
  const m = typeof value === 'string' ? TIME.exec(value) : null
  return m ? `${m[1]}:${m[2]}` : String(value)
}

export const dayName = (day: number): string => DAYS[day] ?? '—'

export const scheduleLabel = (s: ScheduleSlot): string => `${dayName(s.day)} ${formatTime(s.time)} · ${s.description}`

export interface EventGroup { date: string; events: PublicEvent[] }

/** Groups events by day in chronological order (events of a day sorted by time). Input is not mutated. */
export function groupEventsByDate(events: PublicEvent[]): EventGroup[] {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  const groups: EventGroup[] = []
  for (const e of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.date === e.date) last.events.push(e)
    else groups.push({ date: e.date, events: [e] })
  }
  return groups
}

export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
