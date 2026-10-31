import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { PublicChurch } from '../../services/types.ts'
import { ChurchLayer } from './churchLayer.ts'
import { centroid, validCoordinates } from './projection.ts'
import { hasWebGL } from './webgl.ts'

interface Props {
  churches: PublicChurch[]
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  /** The camera reached the selected church (the app then opens its detail view). */
  onArrive?: (id: string) => void
}

// Vite does not find MapLibre's worker by itself: give it the bundled file (served from our own origin).
maplibregl.setWorkerUrl(workerUrl)

// Esri "World Street Map" raster tiles: a street map in the same style as Google Maps (beige blocks, yellow
// avenues, green parks) that needs no API key. For production, swap this style for Google Maps tiles or a paid
// provider: the church layer does not depend on the base map.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
}
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const hit = (map: maplibregl.Map, c: PublicChurch, p: maplibregl.Point) => {
  const centre = map.project([c.longitude, c.latitude])
  // Radius of the church footprint on screen (about 40 m), with a floor so it stays easy to hit when zoomed out.
  const east = map.project([c.longitude + 40 / (111_320 * Math.cos((c.latitude * Math.PI) / 180)), c.latitude])
  const radius = Math.max(28, Math.hypot(east.x - centre.x, east.y - centre.y))
  return Math.hypot(centre.x - p.x, centre.y - p.y - radius * 0.4) <= radius
}

function label(c: PublicChurch): HTMLElement {
  const el = document.createElement('div')
  el.className = 'rpg-panel whitespace-nowrap px-3 py-1 text-center'
  el.style.cssText = 'pointer-events:none;font-size:16px'
  const name = document.createElement('div')
  name.style.color = 'var(--accent)'
  name.textContent = c.name
  const saint = document.createElement('div')
  saint.style.cssText = 'color:var(--ink-dim);font-size:13px'
  saint.textContent = c.patronSaint
  el.append(name, saint)
  return el
}

function Unavailable() {
  return (
    <div className="rpg-panel absolute left-1/2 top-1/2 max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 text-center" role="status">
      El mapa no está disponible en este dispositivo. Usa la lista de iglesias para continuar.
    </div>
  )
}

/** Real street map of Mérida with a 3D low-poly model standing on every church's coordinates. */
export default function RealMap({ churches, selectedId, hoveredId, onSelect, onHover, onArrive }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const layerRef = useRef<ChurchLayer | null>(null)
  const labelRef = useRef<maplibregl.Marker | null>(null)
  const latest = useRef({ churches, selectedId, onSelect, onHover, onArrive })
  latest.current = { churches, selectedId, onSelect, onHover, onArrive }
  const [ready, setReady] = useState(false)
  const supported = hasWebGL()

  const valid = validCoordinates(churches.map((c) => ({ ...c, lat: c.latitude, lng: c.longitude })))
  const key = valid.map((c) => `${c.id}:${c.modelUrl}`).join('|')
  const centre = centroid(valid)

  useEffect(() => {
    const el = container.current
    if (!el || !supported) return
    const map = new maplibregl.Map({
      container: el, style: STYLE, center: [centre.lng, centre.lat], zoom: 15.6, pitch: 55, bearing: -15,
      maxPitch: 75, minZoom: 12, maxZoom: 19, attributionControl: { compact: true }, canvasContextAttributes: { antialias: true },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    const layer = new ChurchLayer()
    mapRef.current = map
    layerRef.current = layer
    map.on('load', () => { map.addLayer(layer); setReady(true) })

    let hovered: string | null = null
    const pick = (p: maplibregl.Point) =>
      latest.current.churches.find((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && hit(map, c, p))?.id ?? null
    map.on('mousemove', (e) => {
      const id = pick(e.point)
      if (id !== hovered) { hovered = id; latest.current.onHover(id); map.getCanvas().style.cursor = id ? 'pointer' : '' }
    })
    map.on('click', (e) => { const id = pick(e.point); if (id) latest.current.onSelect(id) })
    // Camera arrival: only counts if the camera really is on the selected church (an interrupted flight does not).
    map.on('moveend', () => {
      const { churches: list, selectedId: id, onArrive: arrive } = latest.current
      const c = list.find((x) => x.id === id)
      if (!c || !arrive) return
      const d = map.getCenter().distanceTo(new maplibregl.LngLat(c.longitude, c.latitude))
      if (d < 25 && map.getZoom() > 17.5) arrive(c.id)
    })

    return () => {
      labelRef.current?.remove()
      labelRef.current = null
      map.remove()
      mapRef.current = null
      layerRef.current = null
      setReady(false)
    }
    // The map is created once; churches and selection are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  useEffect(() => { if (ready) layerRef.current?.setChurches(valid) }, [ready, key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) layerRef.current?.setHighlight(hoveredId, selectedId) }, [ready, hoveredId, selectedId])

  // Label over the hovered or selected church.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    labelRef.current?.remove()
    labelRef.current = null
    const c = churches.find((x) => x.id === (hoveredId ?? selectedId))
    if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
      labelRef.current = new maplibregl.Marker({ element: label(c), anchor: 'bottom', offset: [0, -70] }).setLngLat([c.longitude, c.latitude]).addTo(map)
  }, [ready, hoveredId, selectedId, churches])

  // Cinematic camera: fly to the selected church, or back out to see them all.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const c = churches.find((x) => x.id === selectedId)
    const duration = reducedMotion() ? 0 : 2000
    if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
      map.flyTo({ center: [c.longitude, c.latitude], zoom: 18.4, pitch: 62, bearing: -20, duration, essential: false })
    } else if (valid.length > 0) {
      const bounds = new maplibregl.LngLatBounds()
      valid.forEach((v) => bounds.extend([v.lng, v.lat]))
      map.fitBounds(bounds, { padding: { top: 90, bottom: 150, left: 340, right: 120 }, pitch: 55, bearing: -15, maxZoom: 17, duration })
    }
  }, [ready, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!supported) return <Unavailable />
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Mapa de Mérida" />
    </div>
  )
}
