import { describe, expect, it } from 'vitest'
import { markerHtml, MODEL_MIN_ZOOM, NAME_MIN_ZOOM } from './churchMarker.ts'

describe('markerHtml', () => {
  it('carries the sigil and the name', () => {
    const h = markerHtml('Catedral de San Ildefonso')
    expect(h).toContain('class="mark"')
    expect(h).toContain('Catedral de San Ildefonso')
  })
  it('is different for different churches and the same for the same one', () => {
    expect(markerHtml('Jesús')).toBe(markerHtml('Jesús'))
    expect(markerHtml('Jesús')).not.toBe(markerHtml('Santa Lucía'))
  })
  it('never lets a name become markup', () => {
    const h = markerHtml('<img src=x onerror=alert(1)>"\'&')
    expect(h).not.toContain('<img')
    expect(h).toContain('&lt;img')
    expect(h).toContain('&quot;')
  })
  it('draws no cross: only the ring and the sigil path', () => {
    expect((markerHtml('X').match(/<circle/g) ?? []).length).toBe(2)
  })
  it('shows names before the models', () => expect(NAME_MIN_ZOOM).toBeLessThan(MODEL_MIN_ZOOM))
})
