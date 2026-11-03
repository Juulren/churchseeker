import { describe, expect, it } from 'vitest'
import { MAP_STYLE, visibilityFor } from './mapStyle.ts'

describe('map style', () => {
  it('uses only the tile host the CSP allows', () => {
    for (const s of Object.values(MAP_STYLE.sources)) {
      for (const t of (s as { tiles: string[] }).tiles) expect(new URL(t.replace('{z}', '1').replace('{y}', '1').replace('{x}', '1')).host).toBe('server.arcgisonline.com')
    }
  })

  it('starts on satellite imagery with roads and place names on top', () => {
    const ids = MAP_STYLE.layers.map((l) => l.id)
    expect(ids.indexOf('imagery')).toBeLessThan(ids.indexOf('roads'))
    expect(ids.indexOf('roads')).toBeLessThan(ids.indexOf('places'))
    expect(visibilityFor('satellite')).toEqual({ imagery: 'visible', roads: 'visible', places: 'visible', street: 'none' })
  })

  it('shows only the street map in street mode', () => {
    expect(visibilityFor('street')).toEqual({ imagery: 'none', roads: 'none', places: 'none', street: 'visible' })
  })

  it('does not mute any layer: the map keeps its own colour', () => {
    for (const l of MAP_STYLE.layers) expect((l as { paint?: unknown }).paint).toBeUndefined()
  })

  it('gives every layer a source that exists', () => {
    for (const l of MAP_STYLE.layers) expect(Object.keys(MAP_STYLE.sources)).toContain((l as { source: string }).source)
  })
})
