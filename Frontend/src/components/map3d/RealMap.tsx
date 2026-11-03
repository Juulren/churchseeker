import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { PublicChurch } from '../../services/types.ts'
import { centroid, validCoordinates } from './projection.ts'
import { hasWebGL } from './webgl.ts'
import { CARD_MIN_ZOOM, markerElement, NAME_MIN_ZOOM } from './churchMarker.ts'
import { MAP_STYLE, visibilityFor, type BaseMode } from './mapStyle.ts'

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

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
function Unavailable() {
  return (
    <div className="rpg-panel absolute left-1/2 top-1/2 max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 text-center" role="status">
      El mapa no está disponible en este dispositivo. Usa la lista de iglesias para continuar.
    </div>
  )
}

/** Satellite view of Mérida (or its street map) with the engraving of every church standing on its coordinates. */
export default function RealMap({ churches, selectedId, hoveredId, onSelect, onHover, onArrive }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, HTMLElement>>(new Map())
  const latest = useRef({ churches, selectedId, onSelect, onHover, onArrive })
  latest.current = { churches, selectedId, onSelect, onHover, onArrive }
  const [ready, setReady] = useState(false)
  const [base, setBase] = useState<BaseMode>('satellite')
  const arrow = useRef<HTMLDivElement>(null)
  const imageryFailures = useRef(0)
  const supported = hasWebGL()

  const valid = validCoordinates(churches.map((c) => ({ ...c, lat: c.latitude, lng: c.longitude })))
  const key = valid.map((c) => `${c.id}:${c.name}:${c.patronSaint}:${c.lat}:${c.lng}`).join('|')
  const centre = centroid(valid)

  useEffect(() => {
    const el = container.current
    if (!el || !supported) return
    const map = new maplibregl.Map({
      container: el, style: MAP_STYLE, center: [centre.lng, centre.lat], zoom: 15.6, pitch: 55, bearing: -15,
      maxPitch: 75, minZoom: 12, maxZoom: 19, attributionControl: { compact: true }, canvasContextAttributes: { antialias: true },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    mapRef.current = map
    // As soon as the style (not every tile) is in: imagery needs many tiles and the churches should not wait for them.
    map.once('style.load', () => setReady(true))

    // Camera arrival: only counts if the camera really is on the selected church (an interrupted flight does not).
    map.on('moveend', () => {
      const { churches: list, selectedId: id, onArrive: arrive } = latest.current
      const c = list.find((x) => x.id === id)
      if (!c || !arrive) return
      const d = map.getCenter().distanceTo(new maplibregl.LngLat(c.longitude, c.latitude))
      if (d < 25 && map.getZoom() > 17.5) arrive(c.id)
    })

    return () => {
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
      setReady(false)
    }
    // The map is created once; churches and selection are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  // A sigil badge on every church; the name joins it when the map is close enough and the engraving a little closer. The
  // markers take the mouse (hover and click); the list of churches is the way in for the keyboard and screen readers.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const made: maplibregl.Marker[] = []
    markersRef.current.clear()
    for (const c of valid) {
      const el = markerElement(c, { onSelect: (id) => latest.current.onSelect(id), onHover: (id) => latest.current.onHover(id) })
      markersRef.current.set(c.id, el)
      made.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([c.lng, c.lat]).addTo(map))
    }
    const names = () => {
      const z = map.getZoom()
      for (const el of markersRef.current.values()) { el.classList.toggle('named', z >= NAME_MIN_ZOOM); el.classList.toggle('carded', z >= CARD_MIN_ZOOM) }
    }
    names()
    map.on('zoom', names)
    // A marker removed under the pointer never fires its leave, so the hover is cleared here.
    return () => { map.off('zoom', names); made.forEach((m) => m.remove()); markersRef.current.clear(); latest.current.onHover(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key])

  useEffect(() => { for (const [id, el] of markersRef.current) el.classList.toggle('is-active', id === (hoveredId ?? selectedId)) }, [ready, key, hoveredId, selectedId])

  // Satellite or street map. Switching only toggles layers.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const [id, v] of Object.entries(visibilityFor(base))) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v)
  }, [ready, base])

  // The north arrow follows the camera; if the imagery keeps failing, fall back to the street map.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    // Written straight to the element: a state update on every frame of a turn would re-render the whole map component.
    const turn = () => { if (arrow.current) arrow.current.style.transform = 'rotate(' + -map.getBearing() + 'deg)' }
    turn()
    const failed = (e: maplibregl.ErrorEvent & { sourceId?: string }) => { if (e.sourceId === 'imagery' && ++imageryFailures.current >= 8) setBase('street') }
    map.on('rotate', turn)
    map.on('error', failed)
    return () => { map.off('rotate', turn); map.off('error', failed) }
  }, [ready])

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
      <div className="atlas-frame" aria-hidden="true" />
      <div className="map-switch" role="group" aria-label="Tipo de mapa">
        <button type="button" className="rpg-button" aria-pressed={base === 'satellite'} onClick={() => { imageryFailures.current = 0; setBase('satellite') }}>Satélite</button>
        <button type="button" className="rpg-button" aria-pressed={base === 'street'} onClick={() => setBase('street')}>Calles</button>
      </div>
      <div ref={arrow} className="north-arrow" aria-hidden="true"><span>N</span><i /></div>
    </div>
  )
}
