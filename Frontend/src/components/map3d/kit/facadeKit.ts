import * as THREE from 'three'
import { toGrey } from '../../quality/grey.ts'

// The facade kit: the parts a Renaissance or colonial church is made of, built from a few cheap primitives so a whole
// church stays under the triangle budget. All sizes are in metres; a model is scaled to the scene once it is complete.
// Nothing here draws a figure or a cross: a church that has one gets it from its own builder, where it is real.

export type Detail = 'high' | 'low'

export interface KitMaterials { stone: THREE.Material; trim: THREE.Material; dark: THREE.Material; roof: THREE.Material }

let shared: KitMaterials | null = null

/** Grey materials that read the vertex colours baked by bakeAO. One set is shared by every model built from the kit. */
export function kitMaterials(): KitMaterials {
  if (shared) return shared
  const m = (color: string, roughness = 0.95) => new THREE.MeshStandardMaterial({ color: toGrey(color), roughness, vertexColors: true })
  shared = { stone: m('#8e8e8e'), trim: m('#b4b4b4', 0.9), dark: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 1, vertexColors: true }), roof: m('#6a6a6a') }
  return shared
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

/** Places a geometry in a group: centre position, optional rotation about y. */
export function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.y = ry
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

/** A round-headed arch outline from y = 0 up to h and from -w/2 to w/2. */
export function archShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape()
  const r = w / 2
  s.moveTo(-r, 0)
  s.lineTo(-r, Math.max(h - r, 0))
  s.absarc(0, Math.max(h - r, 0), r, Math.PI, 0, true)
  s.lineTo(r, 0)
  s.closePath()
  return s
}

/** A dark arched opening, flat, to lay on a wall. Faces +z; the caller rotates it for other walls. */
export function archPanel(w: number, h: number): THREE.BufferGeometry {
  return new THREE.ShapeGeometry(archShape(w, h), 8)
}

/** An arch moulding: the band between an outer and an inner arch, with depth. */
export function archRing(w: number, h: number, band: number, depth: number): THREE.BufferGeometry {
  const outer = archShape(w, h)
  const inner = archShape(w - band * 2, h - band * 2)
  // The hole starts a band above the base, so it never touches the outline (a touching hole breaks the triangulation).
  const hole = new THREE.Path(inner.getPoints(10).map((p) => new THREE.Vector2(p.x, p.y + band)))
  outer.holes.push(hole)
  return new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 10 })
}

/** A triangular pediment of the given width and rise, with depth. */
export function pediment(w: number, rise: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(0, rise)
  s.closePath()
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
}

/** A square tower stage that narrows toward the top (a battered shaft), pyramid-frustum shaped. Base on y = 0. */
export function frustum(baseW: number, topW: number, h: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry((topW * Math.SQRT2) / 2, (baseW * Math.SQRT2) / 2, h, 4, 1)
  g.rotateY(Math.PI / 4)
  g.translate(0, h / 2, 0)
  return g
}

/** A small finial: a short post with a ball, to stand along a cornice. */
export function finial(h: number): THREE.BufferGeometry {
  const post = new THREE.CylinderGeometry(h * 0.1, h * 0.14, h * 0.7, 6)
  post.translate(0, h * 0.35, 0)
  const ball = new THREE.SphereGeometry(h * 0.2, 8, 6)
  ball.translate(0, h * 0.8, 0)
  return mergeGeometries([post, ball])
}

/** Joins plain geometries into one (position, normal, uv only). */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  let base = 0
  for (const g0 of list) {
    const g = g0.index ? g0 : g0.clone()
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), t = g.getAttribute('uv')
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0)
      uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0)
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base)
    else for (let i = 0; i < p.count; i++) idx.push(i + base)
    base += p.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  out.setIndex(idx)
  return out
}

/** A row of one geometry repeated along x at a spacing: used for finials, windows, buttresses. */
export function row(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, count: number, spacing: number, x0: number, y: number, z: number, ry = 0) {
  for (let i = 0; i < count; i++) put(parent, geo, mat, x0 + i * spacing, y, z, ry)
}

/**
 * Bakes a cheap ambient occlusion into vertex colours: surfaces get darker toward the ground and when they face down,
 * so a church reads as heavy and grounded without any texture or extra light pass.
 */
export function bakeAO(root: THREE.Object3D, height: number): void {
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry
    const pos = geo.getAttribute('position')
    const nor = geo.getAttribute('normal')
    const colors = new Float32Array(pos.count * 3)
    const v = new THREE.Vector3()
    const n = new THREE.Vector3()
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      const up = THREE.MathUtils.smoothstep(v.y, 0, height * 0.55)
      let b = 0.62 + 0.38 * up
      if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize(); if (n.y < -0.5) b *= 0.55 }
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  })
}

/** Counts the triangles of everything under an object. */
export function triangles(root: THREE.Object3D): number {
  let n = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3
  })
  return n
}
