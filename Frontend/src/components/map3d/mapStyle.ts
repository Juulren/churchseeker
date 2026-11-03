import type * as maplibregl from 'maplibre-gl'

// The map is the one place in the project with colour. Satellite imagery is the default, with a layer of place names
// and another of roads on top so labels stay readable; the street map is the alternative (and the fallback when the
// imagery cannot be loaded). Every source comes from Esri's public tile servers, which the CSP already allows.
export type BaseMode = 'satellite' | 'street'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const tiles = (service: string) => [`${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`]

export const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    imagery: { type: 'raster', tiles: tiles('World_Imagery'), tileSize: 256, maxzoom: 19, attribution: 'Powered by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
    places: { type: 'raster', tiles: tiles('Reference/World_Boundaries_and_Places'), tileSize: 256, maxzoom: 19, attribution: 'Places © Esri' },
    roads: { type: 'raster', tiles: tiles('Reference/World_Transportation'), tileSize: 256, maxzoom: 19, attribution: 'Roads © Esri' },
    street: { type: 'raster', tiles: tiles('World_Street_Map'), tileSize: 256, maxzoom: 19, attribution: 'Mapa © Esri, HERE, Garmin, © OpenStreetMap contributors' },
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery' },
    { id: 'street', type: 'raster', source: 'street', layout: { visibility: 'none' } },
    { id: 'roads', type: 'raster', source: 'roads' },
    { id: 'places', type: 'raster', source: 'places' },
  ],
}

/** Which layers show in each mode. The street map already has its own names and roads, so the overlays go. */
export function visibilityFor(mode: BaseMode): Record<string, 'visible' | 'none'> {
  const sat = mode === 'satellite'
  return { imagery: sat ? 'visible' : 'none', roads: sat ? 'visible' : 'none', places: sat ? 'visible' : 'none', street: sat ? 'none' : 'visible' }
}
