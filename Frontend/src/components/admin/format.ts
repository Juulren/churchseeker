const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export const formatMoney = (n: number) => (Number.isFinite(n) ? money.format(n) : '—')

export const todayIso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return todayIso(new Date(y, m - 1, d + days))
}

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export interface CalendarCell { iso: string; day: number; inMonth: boolean }

/** Weeks (Monday first) covering a month: always 6 rows of 7 days so the grid never changes height. */
export function monthGrid(year: number, month0: number): CalendarCell[][] {
  const first = new Date(year, month0, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month0, 1 - offset)
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)
      return { iso: todayIso(date), day: date.getDate(), inMonth: date.getMonth() === month0 }
    }))
}

export const monthRange = (year: number, month0: number) => ({
  from: todayIso(new Date(year, month0, 1)),
  to: todayIso(new Date(year, month0 + 1, 0)),
})

/** Bar heights (0..1) for a chart; zero or negative values give empty bars and an all-zero series stays flat. */
export function scaleBars(values: number[]): number[] {
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0))
  const max = Math.max(0, ...safe)
  return safe.map((v) => (max === 0 ? 0 : v / max))
}

export const emptyToNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())
