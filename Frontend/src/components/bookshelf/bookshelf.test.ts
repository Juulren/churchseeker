import { describe, expect, it } from 'vitest'
import { clampPage, looksLikePdf } from './pdfUtils.ts'
import { MAX_PER_ROW, ROW_HEIGHT, layoutShelf, type ShelfBook } from './shelfLayout.ts'

const book = (i: number, thickness = 5, extra: Partial<ShelfBook> = {}): ShelfBook =>
  ({ id: `id-${i}`, title: `Libro ${i}`, description: null, author: null, spineColor: '#6b3f2a', spineThickness: thickness, ...extra })

describe('layoutShelf', () => {
  it('is empty for no books', () => {
    expect(layoutShelf([])).toEqual({ slots: [], width: 0, rows: 0 })
  })

  it('puts books side by side without overlapping, centred on the shelf', () => {
    const { slots, width } = layoutShelf([book(1, 3), book(2, 8), book(3, 10), book(4, 1)])
    for (let i = 1; i < slots.length; i++)
      expect(slots[i].x - slots[i].w / 2).toBeGreaterThanOrEqual(slots[i - 1].x + slots[i - 1].w / 2 - 1e-9)
    const left = slots[0].x - slots[0].w / 2
    const right = slots[slots.length - 1].x + slots[slots.length - 1].w / 2
    expect(left + right).toBeCloseTo(0, 6)
    expect(right - left).toBeCloseTo(width, 6)
  })

  it('makes thicker books wider and keeps heights in a realistic range', () => {
    const { slots } = layoutShelf([book(1, 1), book(2, 10)])
    expect(slots[1].w).toBeGreaterThan(slots[0].w)
    for (const s of layoutShelf(Array.from({ length: 30 }, (_, i) => book(i))).slots) {
      expect(s.h).toBeGreaterThanOrEqual(1.5)
      expect(s.h).toBeLessThanOrEqual(2.0)
    }
  })

  it('wraps to a new row when a row is full, each row lower than the last', () => {
    const many = Array.from({ length: MAX_PER_ROW * 2 + 1 }, (_, i) => book(i, 1))
    const layout = layoutShelf(many)
    expect(layout.rows).toBe(3)
    expect(new Set(layout.slots.map((s) => s.y))).toEqual(new Set([0, -ROW_HEIGHT, -2 * ROW_HEIGHT]))
    expect(layout.slots).toHaveLength(many.length)
  })

  it('wraps by width too when the books are fat', () => {
    expect(layoutShelf(Array.from({ length: 14 }, (_, i) => book(i, 10))).rows).toBeGreaterThan(1)
  })

  it('is deterministic', () => {
    const books = Array.from({ length: 10 }, (_, i) => book(i, (i % 10) + 1))
    expect(layoutShelf(books)).toEqual(layoutShelf(books))
  })

  it('marks private books and treats a missing flag as public', () => {
    const { slots } = layoutShelf([book(1, 5, { isPublic: false }), book(2, 5, { isPublic: true }), book(3)])
    expect(slots.map((s) => s.isPublic)).toEqual([false, true, true])
  })

  it('survives hostile data: NaN thickness, bad colours, huge shelves, odd titles', () => {
    const hostile = [
      book(1, NaN), book(2, Infinity), book(3, -50), book(4, 1e9),
      book(5, 5, { spineColor: 'url(javascript:alert(1))' }), book(6, 5, { spineColor: '' }),
      book(7, 5, { title: undefined as unknown as string }), book(8, 5, { title: '<img src=x onerror=alert(1)>' }),
    ]
    const { slots } = layoutShelf(hostile)
    expect(slots).toHaveLength(hostile.length)
    for (const s of slots) {
      expect(Number.isFinite(s.x) && Number.isFinite(s.w) && Number.isFinite(s.h)).toBe(true)
      expect(s.w).toBeGreaterThan(0.3)
      expect(s.w).toBeLessThan(1.1)
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(typeof s.title).toBe('string')
    }
    expect(layoutShelf(Array.from({ length: 2000 }, (_, i) => book(i, 5))).slots).toHaveLength(2000)
  })
})

describe('pdf helpers', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)

  it('recognises PDFs by their header only', () => {
    expect(looksLikePdf(bytes('%PDF-1.7\n1 0 obj'))).toBe(true)
    expect(looksLikePdf(bytes('%PDF-1.4\n%%EOF').buffer as ArrayBuffer)).toBe(true)
    for (const bad of ['MZ\x90\x00 executable', '<html></html>   ', ' %PDF-1.4 leading space', '%PDF', '']) expect(looksLikePdf(bytes(bad))).toBe(false)
    expect(looksLikePdf(new Uint8Array(100))).toBe(false)
  })

  it('keeps the page inside the document', () => {
    expect(clampPage(5, 10)).toBe(5)
    expect(clampPage(0, 10)).toBe(1)
    expect(clampPage(-3, 10)).toBe(1)
    expect(clampPage(99, 10)).toBe(10)
    expect(clampPage(NaN, 10)).toBe(1)
    expect(clampPage(Infinity, 10)).toBe(1)
    expect(clampPage(2.9, 10)).toBe(2)
    expect(clampPage(3, 0)).toBe(1)
  })
})
