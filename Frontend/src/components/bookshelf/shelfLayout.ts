import type { PublicBook, StaffBook } from '../../services/types.ts'
import { luma } from '../quality/grey.ts'

export type ShelfBook = PublicBook & Partial<Pick<StaffBook, 'isPublic'>>

export interface BookSlot {
  id: string
  title: string
  author: string | null
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
// Books are drawn in a handful of greys, from near-black leather to pale vellum: the stored colour only picks the step.
export const SPINE_GREYS = ['#2e2e2e', '#454545', '#5c5c5c', '#757575', '#9a9a9a'] as const
export const quantizeGrey = (c: string): string => SPINE_GREYS[Math.min(SPINE_GREYS.length - 1, Math.floor((luma(c) / 256) * SPINE_GREYS.length))]
const safeColor = (c: string) => (typeof c === 'string' && HEX.test(c) ? quantizeGrey(c) : '#5c5c5c')

/** Thick-spined books side by side, wrapping to a new shelf row when a row is full. Pure and deterministic. */
export function layoutShelf(books: ShelfBook[], perRow = MAX_PER_ROW): ShelfLayout {
  const rows: BookSlot[][] = [[]]
  let rowWidth = 0
  for (const b of books) {
    // About 40% slimmer than before: 0.2 to 0.65 units from the thinnest to the thickest.
    const w = 0.2 + safeThickness(b.spineThickness) * 0.045
    const current = rows[rows.length - 1]
    if (current.length > 0 && (current.length >= perRow || rowWidth + w > MAX_ROW_WIDTH)) { rows.push([]); rowWidth = 0 }
    const h = hash(b.id)
    rows[rows.length - 1].push({
      id: b.id, title: String(b.title ?? ''), author: b.author ? String(b.author) : null, x: rowWidth + w / 2, y: 0, w, h: 1.5 + (h % 6) * 0.1, d: 1.2,
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
