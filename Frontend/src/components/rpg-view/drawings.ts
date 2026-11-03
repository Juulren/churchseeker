import * as THREE from 'three'
import { kitMaterials } from '../map3d/kit/facadeKit.ts'

// Planta and alzado: the two drawings of a treatise plate, made from the same model that is shown in 3D, so they can
// never disagree with it. Each part of the model contributes the outline of its bounding box; the big masses give the
// plan, and everything that faces the front gives the elevation. Metres, as the model is.

export interface Rect { x1: number; y1: number; x2: number; y2: number; round?: boolean; opening?: boolean }
export interface Drawings { plan: Rect[]; elevation: Rect[]; width: number; depth: number; height: number }

const kindOf = (m: THREE.Mesh): 'opening' | 'round' | 'mass' => {
  if (m.material === kitMaterials().dark) return 'opening'
  const t = m.geometry.type
  return t === 'CylinderGeometry' && (m.geometry as THREE.CylinderGeometry).parameters.radialSegments > 8 || t === 'SphereGeometry' ? 'round' : 'mass'
}

export function buildDrawings(root: THREE.Object3D): Drawings {
  root.updateMatrixWorld(true)
  const whole = new THREE.Box3().setFromObject(root)
  const plan: Rect[] = []
  const elevation: Rect[] = []
  const frontZ = whole.max.z
  const big = Math.max(whole.max.x - whole.min.x, whole.max.z - whole.min.z)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const b = new THREE.Box3().setFromObject(m)
    const size = b.getSize(new THREE.Vector3())
    const kind = kindOf(m)
    // Plan: the walls and towers, not the thin trim and openings. Thresholds are relative, so any size of church works.
    if (kind !== 'opening' && size.y >= whole.max.y * 0.2 && size.x >= big * 0.03 && size.z >= big * 0.03) plan.push({ x1: b.min.x, y1: b.min.z, x2: b.max.x, y2: b.max.z, round: kind === 'round' })
    // Elevation: what is near the front plane, openings included (drawn lighter).
    if (b.max.z > frontZ - (whole.max.z - whole.min.z) * 0.2 && size.x >= big * 0.008 && size.y >= big * 0.008) elevation.push({ x1: b.min.x, y1: b.min.y, x2: b.max.x, y2: b.max.y, round: kind === 'round', opening: kind === 'opening' })
  })
  const s = whole.getSize(new THREE.Vector3())
  return { plan, elevation, width: s.x, depth: s.z, height: s.y }
}

const f = (n: number) => Number(n.toFixed(2))

/** SVG path data for a set of rectangles on a drawing sheet: x runs right, y runs down, in metres from the sheet's corner. */
export function rectPaths(rects: Rect[], toX: (x: number) => number, toY: (y: number) => number): { solid: string; light: string } {
  let solid = '', light = ''
  for (const r of rects) {
    const x1 = toX(Math.min(r.x1, r.x2)), x2 = toX(Math.max(r.x1, r.x2))
    const ya = toY(r.y1), yb = toY(r.y2)
    const y1 = Math.min(ya, yb), y2 = Math.max(ya, yb)
    let d: string
    if (r.round) { const rx = (x2 - x1) / 2, ry = (y2 - y1) / 2; d = `M${f(x1)} ${f(y1 + ry)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0` }
    else if (r.opening) { const w = x2 - x1; d = `M${f(x1)} ${f(y2)}V${f(y1 + w / 2)}a${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(w)} 0V${f(y2)}Z` }
    else d = `M${f(x1)} ${f(y1)}H${f(x2)}V${f(y2)}H${f(x1)}Z`
    if (r.opening) light += d; else solid += d
  }
  return { solid, light }
}
