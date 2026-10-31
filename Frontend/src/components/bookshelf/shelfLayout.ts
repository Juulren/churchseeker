import type { PublicBook, StaffBook } from '../../services/types.ts'

export type ShelfBook = PublicBook & Partial<Pick<StaffBook, 'isPublic'>>

export interface BookSlot {
  id: string
  title: string
  x: number
  /** Floor of the row this book stands on. */
  y: number
  w: number
  h: number
  d: number
  tilt: number
  color: string
  /** False only for staff views of private books. */
  isPublic: boolean
}

export interface ShelfLayout { slots: BookSlot[]; width: number; rows: number }

export const MAX_PER_ROW = 14
export const ROW_HEIGHT = 2.7
const MAX_ROW_WIDTH = 13
const GAP = 0.05
const HEX = /^#[0-9a-f]{6}$/i

// FNV-1a so every book keeps the same height and lean on every visit.
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

const safeThickness = (t: number) => (Number.isFinite(t) ? Math.min(10, Math.max(1, Math.round(t))) : 5)
const safeColor = (c: string) => (typeof c === 'string' && HEX.test(c) ? c : '#5b3a29')

/** Thick-spined books side by side, wrapping to a new shelf row when a row is full. Pure and deterministic. */
export function layoutShelf(books: ShelfBook[], perRow = MAX_PER_ROW): ShelfLayout {
  const rows: BookSlot[][] = [[]]
  let rowWidth = 0
  for (const b of books) {
    const w = 0.28 + safeThickness(b.spineThickness) * 0.075
    const current = rows[rows.length - 1]
    if (current.length > 0 && (current.length >= perRow || rowWidth + w > MAX_ROW_WIDTH)) { rows.push([]); rowWidth = 0 }
    const h = hash(b.id)
    rows[rows.length - 1].push({
      id: b.id, title: String(b.title ?? ''), x: rowWidth + w / 2, y: 0, w, h: 1.5 + (h % 6) * 0.1, d: 1.2,
      tilt: h % 9 === 0 ? 0.12 : 0, color: safeColor(b.spineColor), isPublic: b.isPublic !== false,
    })
    rowWidth += w + GAP
  }

  const slots: BookSlot[] = []
  let width = 0
  rows.forEach((row, r) => {
    if (row.length === 0) return
    const used = row[row.length - 1].x + row[row.length - 1].w / 2
    width = Math.max(width, used)
    for (const s of row) slots.push({ ...s, x: s.x - used / 2, y: -r * ROW_HEIGHT })
  })
  return { slots, width, rows: slots.length === 0 ? 0 : rows.filter((r) => r.length > 0).length }
}
