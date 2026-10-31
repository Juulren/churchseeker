import * as THREE from 'three'
import { leather, paper, plaster, tiles, wood, type TexturePair } from './proceduralTextures.ts'

const cache = new Map<string, THREE.Material>()
function memo<T extends THREE.Material>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key) as T
}

function withPair(m: THREE.MeshStandardMaterial, p: TexturePair | null, repeat: [number, number], bump: number) {
  if (!p) return m
  for (const t of [p.map, p.bump]) t.repeat.set(...repeat)
  m.map = p.map
  m.bumpMap = p.bump
  m.bumpScale = bump
  return m
}

export const goldMaterial = () => memo('gold', () => new THREE.MeshStandardMaterial({ color: '#d9b24a', metalness: 1, roughness: 0.28 }))
export const brassMaterial = () => memo('brass', () => new THREE.MeshStandardMaterial({ color: '#b08d3a', metalness: 1, roughness: 0.38 }))
export const darkMaterial = () => memo('dark', () => new THREE.MeshStandardMaterial({ color: '#1b1511', roughness: 0.9 }))
export const glassMaterial = () => memo('glass', () => new THREE.MeshPhysicalMaterial({ color: '#0f1a24', roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }))

export const leatherMaterial = (color: string) =>
  memo(`leather:${color}`, () => withPair(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.02 }), leather(color), [1, 1], 0.9))
export const paperMaterial = () => memo('paper', () => withPair(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), paper(), [1, 1], 0.6))
export const woodMaterial = (color: string, repeat: [number, number] = [2, 1]) =>
  memo(`wood:${color}:${repeat}`, () => withPair(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62 }), wood(color), repeat, 0.5))
export const plasterMaterial = (color: string, blocks = false) =>
  memo(`plaster:${color}:${blocks}`, () => withPair(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), plaster(color, blocks), [2, 2], 1.2))
export const tileMaterial = (color: string) =>
  memo(`tiles:${color}`, () => withPair(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide }), tiles(color), [3, 3], 1.5))
export const plainMaterial = (color: string, roughness = 0.8, metalness = 0) =>
  memo(`plain:${color}:${roughness}:${metalness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }))

/** Soft studio reflections for every PBR material, generated locally (no network, no HDR file). */
export async function makeEnvironment(renderer: THREE.WebGLRenderer): Promise<THREE.Texture> {
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js')
  const pmrem = new THREE.PMREMGenerator(renderer)
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return texture
}
