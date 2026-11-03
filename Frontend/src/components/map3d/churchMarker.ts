import { sigilPath } from '../sigil/sigil.ts'

// The marker every church has on the map: its sigil on a round plate and, once the map is close enough, its name in
// Cinzel. It is HTML over the map canvas and never takes the pointer (picking stays in RealMap, which aims at the badge when no model is
// drawn); the accessible way to a church is still the list.

/** Below this zoom the churches are shown as markers only; from here the low-detail models appear as well. */
export const MODEL_MIN_ZOOM = 15.5
/** From this zoom the name is written beside the badge. */
export const NAME_MIN_ZOOM = 15

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

/** The inner markup of a church marker. The name is escaped: it comes from the API. */
export function markerHtml(name: string): string {
  return `<svg class="church-marker-plate" viewBox="0 0 100 100" width="34" height="34" aria-hidden="true" focusable="false" fill="none" stroke-linecap="round" stroke-linejoin="round">`
    + `<circle cx="50" cy="50" r="48" class="plate"/><circle cx="50" cy="50" r="44" class="rim"/><path d="${sigilPath(name)}" class="mark"/></svg>`
    + `<span class="church-marker-name">${escape(name)}</span>`
}

/** The marker element for a church. */
export function markerElement(name: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'church-marker'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = markerHtml(name)
  return el
}
