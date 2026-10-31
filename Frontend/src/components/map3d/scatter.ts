import type { Vec2 } from './projection.ts'

export interface Exclusion extends Vec2 { r: number }
export interface House { x: number; z: number; w: number; d: number; h: number; color: string }
export interface Tree { x: number; z: number; s: number }

export const BLOCK = 8.4 // a 100 m colonial block at 12 m per unit
export const STREET = 1.1

// Small seeded PRNG so the town looks identical on every visit and in every test.
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PASTELS = ['#e9d8b4', '#d6a79a', '#c7d8c0', '#e4c96f', '#b9c9d8', '#e8b98f', '#d9c3d8']

const blocked = (x: number, z: number, margin: number, ex: Exclusion[]) =>
  ex.some((e) => Math.hypot(x - e.x, z - e.z) < e.r + margin)

/** One low house per lot, keeping streets and the area around every church clear. */
export function scatterHouses(seed: number, half: number, exclusions: Exclusion[]): House[] {
  const rand = mulberry32(seed)
  const houses: House[] = []
  const cells = Math.floor(half / BLOCK)
  for (let i = -cells; i < cells; i++) {
    for (let j = -cells; j < cells; j++) {
      const x0 = i * BLOCK + STREET / 2
      const z0 = j * BLOCK + STREET / 2
      const lot = (BLOCK - STREET) / 2
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          if (rand() < 0.28) continue
          const w = lot * (0.6 + rand() * 0.3)
          const d = lot * (0.6 + rand() * 0.3)
          const x = x0 + a * lot + lot / 2
          const z = z0 + b * lot + lot / 2
          const radius = Math.hypot(w, d) / 2
          if (blocked(x, z, radius, exclusions)) continue
          houses.push({ x, z, w, d, h: 0.7 + rand() * 0.7, color: PASTELS[Math.floor(rand() * PASTELS.length)] })
        }
      }
    }
  }
  return houses
}

/** Trees on lots and verges, never on a street or near a church. */
export function scatterTrees(seed: number, half: number, count: number, exclusions: Exclusion[]): Tree[] {
  const rand = mulberry32(seed ^ 0x9e3779b9)
  const trees: Tree[] = []
  let attempts = 0
  while (trees.length < count && attempts++ < count * 20) {
    const x = (rand() * 2 - 1) * half
    const z = (rand() * 2 - 1) * half
    const fx = Math.abs(((x % BLOCK) + BLOCK) % BLOCK)
    const fz = Math.abs(((z % BLOCK) + BLOCK) % BLOCK)
    const onStreet = Math.min(fx, BLOCK - fx) < STREET + 0.3 || Math.min(fz, BLOCK - fz) < STREET + 0.3
    if (onStreet || blocked(x, z, 0.8, exclusions)) continue
    trees.push({ x, z, s: 0.7 + rand() * 0.7 })
  }
  return trees
}
