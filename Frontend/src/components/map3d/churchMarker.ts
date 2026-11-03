import { engravingMarkup } from '../engraving/markup.ts'
import { sigilPath } from '../sigil/sigil.ts'

// The marker every church has on the map: its sigil on a round plate and its name in Cinzel once the map is close enough,
// and from a little closer its engraving on a small plate standing above it. It is HTML over the map canvas, so it is
// the same on every device; the accessible way to a church is still the list, so the marker is hidden from assistive
// technology and takes only the mouse (hover and click), never the keyboard.

/** From this zoom the church's engraving stands above its badge. */
export const CARD_MIN_ZOOM = 15.5
/** From this zoom the name is written beside the badge. */
export const NAME_MIN_ZOOM = 15

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

export interface MarkerChurch { id: string; name: string; patronSaint?: string | null }

/** The inner markup of a church marker. Names come from the API, so they are escaped. */
export function markerHtml(church: MarkerChurch): string {
  const saint = church.patronSaint ? `<span class="church-marker-saint">${escape(church.patronSaint)}</span>` : ''
  return `<div class="church-marker-card">${engravingMarkup(church.id, 'm' + church.id)}</div>`
    + `<svg class="church-marker-plate" viewBox="0 0 100 100" width="34" height="34" aria-hidden="true" focusable="false" fill="none" stroke-linecap="round" stroke-linejoin="round">`
    + `<circle cx="50" cy="50" r="48" class="plate"/><circle cx="50" cy="50" r="44" class="rim"/><path d="${sigilPath(church.name)}" class="mark"/></svg>`
    + `<span class="church-marker-name">${escape(church.name)}${saint}</span>`
}

export interface MarkerHandlers { onSelect: (id: string) => void; onHover: (id: string | null) => void }

/** The marker element for a church. The mouse can hover and click it; assistive technology and the keyboard use the list. */
export function markerElement(church: MarkerChurch, handlers: MarkerHandlers): HTMLElement {
  const el = document.createElement('div')
  el.className = 'church-marker'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = markerHtml(church)
  // A drag that starts on a marker pans the map: only a click that stayed put selects the church.
  let down: { x: number; y: number } | null = null
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY } })
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
    handlers.onSelect(church.id)
  })
  // Hover is for a mouse: a tap fires these too, and never the leave, which would leave the church lit.
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') handlers.onHover(church.id) })
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') handlers.onHover(null) })
  return el
}
