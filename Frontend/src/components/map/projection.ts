// Geographic helpers for the church map: the centre of a set of churches and the check that coordinates are valid.

export interface LatLng { lat: number; lng: number }

// Reference centre of Mérida given in the project plan. The map itself is centred on the churches.
export const MERIDA_CENTER: LatLng = { lat: 20.9674, lng: -89.5926 }

export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) return MERIDA_CENTER
  const sum = points.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 })
  return { lat: sum.lat / points.length, lng: sum.lng / points.length }
}

const finite = (n: number) => Number.isFinite(n)

/** Drops entries whose coordinates are missing or outside the valid range (bad data must not break the map). */
export function validCoordinates<T extends LatLng>(items: T[]): T[] {
  return items.filter((i) => finite(i.lat) && finite(i.lng) && Math.abs(i.lat) <= 90 && Math.abs(i.lng) <= 180)
}
