import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { brassMaterial, darkMaterial, goldMaterial, leatherMaterial, paperMaterial, plainMaterial } from '../quality/materials.ts'
import { spine } from '../quality/proceduralTextures.ts'

export interface BookSpec {
  w: number
  h: number
  d: number
  color: string
  title: string
  author?: string | null
  isPublic: boolean
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * A bound codex. The spine faces +z and bulges slightly, like a real hand-bound book: leather boards with
 * rounded corners, a cream page block with visible leaf edges, raised bands across the spine, a gold-foil
 * title, a silk ribbon and, for private books, a brass lock plate.
 * Origin at the centre; thickness along x, height along y, depth along z.
 */
export function buildBook(s: BookSpec): THREE.Group {
  const g = new THREE.Group()
  const { w, h, d } = s
  const board = 0.05
  const radius = Math.min(0.02, w / 6)

  // Page block, slightly shorter than the boards so they overhang as on a real book.
  g.add(mesh(new RoundedBoxGeometry(w - board * 2 + 0.01, h - 0.09, d - 0.07, 2, 0.006), paperMaterial(), 0, 0, -0.02))

  // Front and back boards.
  const leatherM = leatherMaterial(s.color)
  for (const side of [-1, 1])
    g.add(mesh(new RoundedBoxGeometry(board, h, d, 3, radius), leatherM, side * (w / 2 - board / 2), 0, 0))

  // Rounded spine: a half cylinder squashed into a shallow bulge, carrying the tooled texture.
  const bulge = Math.min(0.11, w * 0.28)
  const spineGeo = new THREE.CylinderGeometry(1, 1, h, 28, 1, true, -Math.PI / 2, Math.PI)
  const spineMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.03, side: THREE.DoubleSide })
  const tex = spine({ title: s.title, author: s.author, color: s.color, width: w, height: h })
  if (tex) { spineMat.map = tex; spineMat.bumpMap = tex; spineMat.bumpScale = 0.6 } else spineMat.color.set(s.color)
  const spineMesh = mesh(spineGeo, spineMat, 0, 0, d / 2 - 0.01)
  spineMesh.scale.set(w / 2, 1, bulge)
  g.add(spineMesh)

  // Raised bands.
  for (const f of [0.1, 0.3, 0.7, 0.9]) {
    const band = new THREE.CylinderGeometry(1, 1, 0.045, 24, 1, false, -Math.PI / 2, Math.PI)
    const m = mesh(band, leatherM, 0, (0.5 - f) * h, d / 2 - 0.01)
    m.scale.set(w / 2 + 0.002, 1, bulge + 0.014)
    g.add(m)
  }

  // Silk ribbon peeking out of the tail.
  g.add(mesh(new THREE.BoxGeometry(0.045, 0.42, 0.012), plainMaterial('#8c1d2b', 0.5), w * 0.12, -h / 2 - 0.12, d / 2 - 0.35))

  // Gilt head: a thin gold line along the top edge of the page block.
  g.add(mesh(new THREE.BoxGeometry(w - board * 2, 0.006, d - 0.08), goldMaterial(), 0, h / 2 - 0.045, -0.02))

  if (!s.isPublic) {
    // Brass lock plate with a keyhole, on the spine near the tail.
    const plate = mesh(new RoundedBoxGeometry(Math.max(0.2, w * 0.5), 0.26, 0.04, 2, 0.01), brassMaterial(), 0, -h * 0.36, d / 2 + bulge)
    g.add(plate)
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), darkMaterial(), 0, -h * 0.35, d / 2 + bulge + 0.02).rotateX(Math.PI / 2))
    g.add(mesh(new THREE.BoxGeometry(0.02, 0.07, 0.05), darkMaterial(), 0, -h * 0.385, d / 2 + bulge + 0.02))
  }
  return g
}

/** Frees geometry and per-book textures. Shared (cached) materials and textures are left alone. */
export function disposeBook(g: THREE.Group) {
  g.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    const mat = m.material as THREE.MeshStandardMaterial
    // The spine material is created per book, together with its canvas texture.
    if (mat.map && mat.side === THREE.DoubleSide) { mat.map.dispose(); mat.dispose() }
  })
}
