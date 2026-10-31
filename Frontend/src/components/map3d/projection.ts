// Geographic helpers: turn latitude/longitude into positions on the map island.

export interface LatLng { lat: number; lng: number }
export interface Vec2 { x: number; z: number }

// Reference centre of Mérida given in the project plan. The map itself is centred on the churches.
export const MERIDA_CENTER: LatLng = { lat: 20.9674, lng: -89.5926 }

// One world unit equals this many metres. Churches are drawn larger than life so they read at a glance.
export const UNIT_METERS = 12
const METERS_PER_DEG_LAT = 110_540

const metersPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)

/** East is +x, north is -z (the camera looks north from the south). */
export function project(p: LatLng, origin: LatLng): Vec2 {
  return {
    x: ((p.lng - origin.lng) * metersPerDegLng(origin.lat)) / UNIT_METERS,
    z: (-(p.lat - origin.lat) * METERS_PER_DEG_LAT) / UNIT_METERS,
  }
}

export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) return MERIDA_CENTER
  const sum = points.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 })
  return { lat: sum.lat / points.length, lng: sum.lng / points.length }
}

const finite = (n: number) => Number.isFinite(n)

/** Drops entries whose coordinates are missing or outside the valid range (bad data must not break the scene). */
export function validCoordinates<T extends LatLng>(items: T[]): T[] {
  return items.filter((i) => finite(i.lat) && finite(i.lng) && Math.abs(i.lat) <= 90 && Math.abs(i.lng) <= 180)
}

export interface Pose { position: [number, number, number]; lookAt: [number, number, number] }

/** Camera pose that frames one church from the south at a pleasant elevation. */
export function focusPose(target: Vec2, distance = 15, elevationDeg = 30): Pose {
  const e = (elevationDeg * Math.PI) / 180
  return {
    position: [target.x, Math.sin(e) * distance + 1.5, target.z + Math.cos(e) * distance],
    lookAt: [target.x, 1.5, target.z],
  }
}

/** Camera pose that shows every church at once. */
export function overviewPose(points: Vec2[]): Pose {
  if (points.length === 0) return { position: [0, 45, 55], lookAt: [0, 0, 0] }
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cz = points.reduce((s, p) => s + p.z, 0) / points.length
  const radius = Math.max(...points.map((p) => Math.hypot(p.x - cx, p.z - cz)))
  const distance = Math.min(Math.max(radius * 3.2 + 30, 55), 130)
  return { position: [cx, distance * 0.7, cz + distance * 0.8], lookAt: [cx, 0, cz] }
}
