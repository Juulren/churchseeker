import { describe, expect, it } from 'vitest'
import { CARD_MIN_ZOOM, markerHtml, NAME_MIN_ZOOM } from './churchMarker.ts'

const church = (id: string, name: string, patronSaint: string | null = null) => ({ id, name, patronSaint })

describe('markerHtml', () => {
  it('carries the engraving, the sigil and the name', () => {
    const h = markerHtml(church('11111111-1111-1111-1111-111111111111', 'Catedral de San Ildefonso', 'San Ildefonso'))
    expect(h).toContain('church-marker-card')
    expect(h).toContain('class="engraving')
    expect(h).toContain('class="mark"')
    expect(h).toContain('Catedral de San Ildefonso')
    expect(h).toContain('San Ildefonso</span>')
  })
  it('is different for different churches and the same for the same one', () => {
    const a = church('33333333-3333-3333-3333-333333333333', 'Jesús')
    const b = church('22222222-2222-2222-2222-222222222222', 'Santa Lucía')
    expect(markerHtml(a)).toBe(markerHtml(a))
    expect(markerHtml(a)).not.toBe(markerHtml(b))
  })
  it('never lets a name, a saint or an id become markup', () => {
    const h = markerHtml(church('"><script>x</script>', '<img src=x onerror=alert(1)>"\'&', '<b>santo</b>'))
    expect(h).not.toContain('<img')
    expect(h).not.toContain('<script')
    expect(h).not.toContain('<b>')
    expect(h).toContain('&lt;img')
    expect(h).toContain('&quot;')
  })
  it('shows names before engravings', () => expect(NAME_MIN_ZOOM).toBeLessThan(CARD_MIN_ZOOM))
})
