import * as THREE from 'three'
import type { ChurchStyle } from './churchStyles.ts'

const DARK = '#2b1d14'

function mat(color: string) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true })
}

function box(g: THREE.Group, pos: [number, number, number], size: [number, number, number], color: string) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color))
  m.position.set(...pos)
  g.add(m)
  return m
}

function pyramid(g: THREE.Group, pos: [number, number, number], radius: number, height: number, color: string) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), mat(color))
  m.position.set(...pos)
  m.rotation.y = Math.PI / 4
  g.add(m)
}

function tower(g: THREE.Group, x: number, z: number, size: number, height: number, s: ChurchStyle) {
  const t = new THREE.Group()
  t.position.set(x, 0, z)
  box(t, [0, height / 2, 0], [size, height, size], s.wall)
  box(t, [0, height * 0.72, 0], [size + 0.12, 0.12, size + 0.12], s.trim)
  for (let i = 0; i < 4; i++) {
    const e = size / 2 + 0.01
    box(t, [Math.sin((i * Math.PI) / 2) * e, height * 0.86, Math.cos((i * Math.PI) / 2) * e],
      [i % 2 ? 0.05 : size * 0.38, height * 0.2, i % 2 ? size * 0.38 : 0.05], DARK)
  }
  pyramid(t, [0, height + size * 0.55, 0], size * 0.78, size * 1.1, s.roof)
  box(t, [0, height + size * 1.18, 0], [0.07, 0.42, 0.07], s.trim)
  box(t, [0, height + size * 1.28, 0], [0.24, 0.07, 0.07], s.trim)
  g.add(t)
}

/** Height of the tallest point of a church built from this style (used to place markers and labels). */
export function churchTop(s: ChurchStyle): number {
  const tw = Math.max(1.1, s.width * 0.3)
  return Math.max(s.height + s.width * 0.35, s.height * 1.9 + tw * 1.4)
}

/**
 * Procedural low-poly church. Facade faces +z, base on y = 0, footprint centred on the origin.
 * One builder serves the 3D map and the close-up stage, so both always show the same church.
 */
export function buildChurch(s: ChurchStyle): THREE.Group {
  const g = new THREE.Group()
  const { width: w, length: l, height: h } = s
  const tw = Math.max(1.1, w * 0.3)
  const towerH = h * 1.9

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(w, l) * 0.78, Math.max(w, l) * 0.82, 0.12, 12), mat('#cdbf9d'))
  plaza.position.set(0, 0.06, 0.6)
  g.add(plaza)
  box(g, [0, 0.2, 0], [w + 0.9, 0.16, l + 0.9], '#b7a888')
  box(g, [0, h / 2 + 0.25, 0], [w, h, l], s.wall)

  const shape = new THREE.Shape()
  shape.moveTo(-w / 2 - 0.15, 0)
  shape.lineTo(w / 2 + 0.15, 0)
  shape.lineTo(0, w * 0.32)
  shape.closePath()
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: l + 0.3, bevelEnabled: false })
  roofGeo.translate(0, 0, -(l + 0.3) / 2)
  const roof = new THREE.Mesh(roofGeo, mat(s.roof))
  roof.position.set(0, h + 0.25, 0)
  g.add(roof)

  box(g, [0, 0.25 + h * 0.3, l / 2 + 0.02], [w * 0.26, h * 0.6, 0.06], DARK)
  box(g, [0, 0.25 + h * 0.78, l / 2 + 0.02], [w * 0.12, h * 0.2, 0.06], s.trim)

  if (s.towers === 2) {
    tower(g, -(w / 2 - tw / 2), l / 2 - tw / 2, tw, towerH, s)
    tower(g, w / 2 - tw / 2, l / 2 - tw / 2, tw, towerH, s)
  } else if (s.towers === 1) {
    tower(g, -(w / 2 - tw / 2), l / 2 - tw / 2, tw, towerH, s)
  }

  if (s.dome) {
    const d = new THREE.Group()
    d.position.set(0, h + 0.25, -l * 0.12)
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.28, w * 0.3, 0.7, 8), mat(s.trim))
    drum.position.y = 0.35
    const cap = new THREE.Mesh(new THREE.SphereGeometry(w * 0.28, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(s.roof))
    cap.position.y = 0.7
    d.add(drum, cap)
    g.add(d)
  }

  for (let i = 0; i < s.arches; i++) {
    const x = ((i + 0.5) / s.arches - 0.5) * (w + 0.6)
    const a = new THREE.Group()
    a.position.set(x, 0, l / 2 + 0.7)
    box(a, [0, 0.25 + h * 0.3, 0], [0.16, h * 0.6, 0.16], s.trim)
    box(a, [0, 0.25 + h * 0.62, 0], [(w + 0.6) / s.arches, 0.14, 0.3], s.trim)
    g.add(a)
  }

  box(g, [0, h + w * 0.32 + 0.5, l / 2 - 0.2], [0.07, 0.5, 0.07], s.trim)
  box(g, [0, h + w * 0.32 + 0.62, l / 2 - 0.2], [0.26, 0.07, 0.07], s.trim)
  return g
}

/** Frees the GPU memory of every mesh in an object. */
export function disposeObject(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    ;(Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose())
  })
}
