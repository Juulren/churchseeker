import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { darkMaterial, glassMaterial, goldMaterial, plainMaterial, plasterMaterial, tileMaterial, woodMaterial } from '../quality/materials.ts'
import type { ChurchStyle } from './churchStyles.ts'

function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

const rbox = (w: number, h: number, d: number, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.5, h / 2.5, d / 2.5))

/** Flat arched outline (rectangle topped by a half circle) extruded into a solid: used for doors, windows, openings. */
function arch(width: number, height: number, depth: number): THREE.ExtrudeGeometry {
  const r = width / 2
  const s = new THREE.Shape()
  s.moveTo(-r, 0)
  s.lineTo(r, 0)
  s.lineTo(r, height - r)
  s.absarc(0, height - r, r, 0, Math.PI, false)
  s.lineTo(-r, 0)
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 16 })
  g.translate(0, 0, -depth / 2)
  return g
}

/** An arched opening: stone frame, glass or dark recess inside. Faces +z, base at y = 0. */
function opening(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, frame: THREE.Material, fill: THREE.Material) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  add(g, arch(w + 0.16, h + 0.08, 0.05), frame, 0, -0.02, 0)
  add(g, arch(w, h, 0.07), fill, 0, 0, 0.012)
  parent.add(g)
  return g
}

function belfry(parent: THREE.Object3D, x: number, z: number, size: number, height: number, wall: THREE.Material, stone: THREE.Material, roof: THREE.Material) {
  const t = new THREE.Group()
  t.position.set(x, 0, z)
  add(t, rbox(size, height, size, 0.05), wall, 0, height / 2, 0)
  // Corner quoins, alternating in and out like cut stone.
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    for (let i = 0; i < Math.floor(height / 0.55); i++)
      add(t, rbox(0.14, 0.26, 0.14, 0.02), stone, sx * (size / 2 - 0.02), 0.4 + i * 0.55, sz * (size / 2 - 0.02))
  add(t, rbox(size + 0.18, 0.12, size + 0.18, 0.03), stone, 0, height * 0.62, 0)
  add(t, rbox(size + 0.2, 0.14, size + 0.2, 0.03), stone, 0, height, 0)
  // Belfry level with an arched opening on each face.
  const bell = darkMaterial()
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group()
    f.rotation.y = (i * Math.PI) / 2
    opening(f, 0, height * 0.7, size / 2 + 0.01, size * 0.34, height * 0.26, stone, bell)
    t.add(f)
  }
  // Spire with finial and cross.
  const spire = add(t, new THREE.ConeGeometry(size * 0.74, size * 1.5, 4), roof, 0, height + size * 0.75 + 0.07, 0)
  spire.rotation.y = Math.PI / 4
  add(t, new THREE.SphereGeometry(0.08, 12, 8), goldMaterial(), 0, height + size * 1.5 + 0.1, 0)
  add(t, rbox(0.06, 0.4, 0.06, 0.01), goldMaterial(), 0, height + size * 1.5 + 0.35, 0)
  add(t, rbox(0.22, 0.06, 0.06, 0.01), goldMaterial(), 0, height + size * 1.5 + 0.42, 0)
  parent.add(t)
}

/** Height of the tallest point of a church built from this style (used to place labels). */
export function churchTop(s: ChurchStyle): number {
  const tw = Math.max(1.1, s.width * 0.3)
  return Math.max(s.height + s.width * 0.45, s.height * 1.9 + tw * 1.9)
}

/**
 * Detailed church with PBR materials: dressed-stone base, plastered walls, clay-tile roof, arched windows and
 * portal, buttresses, belfries with spires and a ribbed dome. Facade faces +z, base on y = 0, centred on the origin.
 */
export function buildChurch(s: ChurchStyle): THREE.Group {
  const g = new THREE.Group()
  const { width: w, length: l, height: h } = s
  const tw = Math.max(1.1, w * 0.3)
  const towerH = h * 1.9
  const wall = plasterMaterial(s.wall)
  const stone = plasterMaterial(s.trim, true)
  const roof = tileMaterial(s.roof)
  const door = woodMaterial('#4a2f1c', [1, 1])
  const glass = glassMaterial()
  const gold = goldMaterial()

  // Stepped plinth and forecourt.
  add(g, new THREE.CylinderGeometry(Math.max(w, l) * 0.8, Math.max(w, l) * 0.84, 0.1, 40), plainMaterial('#cbbf9f', 0.95), 0, 0.05, 0.7)
  add(g, rbox(w + 1.1, 0.14, l + 1.1, 0.03), stone, 0, 0.17, 0)
  add(g, rbox(w + 0.7, 0.12, l + 0.7, 0.03), stone, 0, 0.3, 0)
  const base = 0.36

  // Nave with a stone socle.
  add(g, rbox(w, h, l, 0.05), wall, 0, base + h / 2, 0)
  add(g, rbox(w + 0.06, 0.45, l + 0.06, 0.03), stone, 0, base + 0.225, 0)
  add(g, rbox(w + 0.14, 0.12, l + 0.14, 0.03), stone, 0, base + h, 0)

  // Gabled roof, tile-textured, with a ridge line.
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2 - 0.22, 0)
  shape.lineTo(w / 2 + 0.22, 0)
  shape.lineTo(0, w * 0.34)
  shape.closePath()
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: l + 0.4, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 })
  roofGeo.translate(0, 0, -(l + 0.4) / 2)
  const roofMesh = add(g, roofGeo, roof, 0, base + h + 0.06, 0)
  roofMesh.receiveShadow = true
  add(g, rbox(0.1, 0.09, l + 0.5, 0.02), stone, 0, base + h + w * 0.34 + 0.08, 0)

  // Facade: pedimented portal, rose window, door.
  const fz = l / 2
  opening(g, 0, base + 0.05, fz + 0.02, w * 0.3, h * 0.62, stone, door)
  add(g, rbox(w * 0.46, 0.14, 0.14, 0.03), stone, 0, base + h * 0.62 + 0.3, fz + 0.04)
  const pediment = new THREE.Shape()
  pediment.moveTo(-w * 0.24, 0)
  pediment.lineTo(w * 0.24, 0)
  pediment.lineTo(0, w * 0.1)
  pediment.closePath()
  const pedGeo = new THREE.ExtrudeGeometry(pediment, { depth: 0.1, bevelEnabled: false })
  add(g, pedGeo, stone, 0, base + h * 0.62 + 0.36, fz)
  const rose = new THREE.Group()
  rose.position.set(0, base + h * 0.84, fz + 0.03)
  add(rose, new THREE.TorusGeometry(w * 0.075, 0.035, 10, 28), stone)
  add(rose, new THREE.CircleGeometry(w * 0.075, 28), glass, 0, 0, 0.01)
  g.add(rose)

  // Side windows and buttresses along the nave.
  const bays = Math.max(2, Math.floor(l / 1.5))
  for (let i = 0; i < bays; i++) {
    const z = -l / 2 + ((i + 0.5) / bays) * l * 0.8 - l * 0.02
    for (const side of [-1, 1]) {
      const f = new THREE.Group()
      f.position.set(side * (w / 2), 0, z)
      f.rotation.y = (side * Math.PI) / 2
      opening(f, 0, base + h * 0.28, 0.01, 0.34, h * 0.5, stone, glass)
      g.add(f)
      add(g, rbox(0.2, h * 0.9, 0.34, 0.03), stone, side * (w / 2 + 0.08), base + (h * 0.9) / 2, z + 0.5 * (l / bays) * 0.8)
    }
  }

  // Towers.
  if (s.towers === 2) {
    belfry(g, -(w / 2 - tw / 2), l / 2 - tw / 2, tw, towerH, wall, stone, roof)
    belfry(g, w / 2 - tw / 2, l / 2 - tw / 2, tw, towerH, wall, stone, roof)
  } else if (s.towers === 1) {
    belfry(g, -(w / 2 - tw / 2), l / 2 - tw / 2, tw, towerH, wall, stone, roof)
  }

  // Ribbed dome on a windowed drum, with a lantern.
  if (s.dome) {
    const dome = new THREE.Group()
    dome.position.set(0, base + h + 0.1, -l * 0.12)
    const dr = w * 0.3
    add(dome, new THREE.CylinderGeometry(dr, dr * 1.04, 0.9, 24), wall, 0, 0.45, 0)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const wnd = new THREE.Group()
      wnd.position.set(Math.sin(a) * (dr + 0.005), 0.45, Math.cos(a) * (dr + 0.005))
      wnd.rotation.y = a
      opening(wnd, 0, -0.25, 0, 0.18, 0.5, stone, glass)
      dome.add(wnd)
    }
    add(dome, new THREE.CylinderGeometry(dr * 1.08, dr * 1.08, 0.1, 24), stone, 0, 0.92, 0)
    add(dome, new THREE.SphereGeometry(dr, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), roof, 0, 0.95, 0)
    for (let i = 0; i < 8; i++) {
      const rib = add(dome, new THREE.TorusGeometry(dr, 0.025, 8, 24, Math.PI), stone, 0, 0.95, 0)
      rib.rotation.y = (i / 8) * Math.PI
    }
    add(dome, new THREE.CylinderGeometry(0.16, 0.18, 0.4, 12), stone, 0, 0.95 + dr + 0.15, 0)
    add(dome, new THREE.ConeGeometry(0.2, 0.3, 12), roof, 0, 0.95 + dr + 0.5, 0)
    add(dome, rbox(0.05, 0.3, 0.05, 0.01), gold, 0, 0.95 + dr + 0.85, 0)
    add(dome, rbox(0.18, 0.05, 0.05, 0.01), gold, 0, 0.95 + dr + 0.92, 0)
    g.add(dome)
  }

  // Open portico: columns and round arches in front of the facade.
  if (s.arches > 0) {
    const span = (w + 0.8) / s.arches
    for (let i = 0; i <= s.arches; i++) {
      const x = (i / s.arches - 0.5) * (w + 0.8)
      add(g, new THREE.CylinderGeometry(0.09, 0.11, h * 0.62, 14), stone, x, base + (h * 0.62) / 2, l / 2 + 0.75)
      add(g, rbox(0.26, 0.1, 0.26, 0.02), stone, x, base + h * 0.62 + 0.05, l / 2 + 0.75)
    }
    for (let i = 0; i < s.arches; i++) {
      const x = ((i + 0.5) / s.arches - 0.5) * (w + 0.8)
      const a = add(g, new THREE.TorusGeometry(span / 2 - 0.1, 0.07, 8, 20, Math.PI), stone, x, base + h * 0.62 + 0.1, l / 2 + 0.75)
      a.scale.y = 0.8
    }
    add(g, rbox(w + 1.1, 0.12, 0.34, 0.03), stone, 0, base + h * 0.62 + (span / 2) * 0.8 + 0.2, l / 2 + 0.75)
    const cover = add(g, new THREE.BoxGeometry(w + 1.2, 0.07, 1.0), roof, 0, base + h * 0.62 + (span / 2) * 0.8 + 0.3, l / 2 + 0.55)
    cover.rotation.x = 0.12
  }

  // Cross on the gable.
  add(g, rbox(0.07, 0.55, 0.07, 0.01), gold, 0, base + h + w * 0.34 + 0.55, l / 2 - 0.15)
  add(g, rbox(0.28, 0.07, 0.07, 0.01), gold, 0, base + h + w * 0.34 + 0.7, l / 2 - 0.15)
  return g
}

/** Frees the GPU memory of every mesh in an object. Shared (cached) materials and textures are kept. */
export function disposeObject(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh
    if (m.isMesh) m.geometry.dispose()
  })
}
