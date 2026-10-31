export interface ChurchStyle {
  wall: string
  roof: string
  trim: string
  towers: 0 | 1 | 2
  dome: boolean
  arches: number
  length: number
  width: number
  height: number
}

// Hand-tuned looks for the pilot churches (database ids), inspired by their real architecture.
const KNOWN: Record<string, ChurchStyle> = {
  // Cathedral of San Ildefonso: sober stone façade with two bell towers.
  '11111111-1111-1111-1111-111111111111': { wall: '#d8c9a3', roof: '#8c5a3c', trim: '#a89670', towers: 2, dome: true, arches: 0, length: 7, width: 5, height: 3.2 },
  // Santa Lucía: porticoed church with a single bell tower.
  '22222222-2222-2222-2222-222222222222': { wall: '#f0e0bd', roof: '#b4533c', trim: '#7ba7a0', towers: 1, dome: false, arches: 5, length: 6.5, width: 3.6, height: 2.6 },
  // Jesús (Tercera Orden): baroque, ochre walls, dome.
  '33333333-3333-3333-3333-333333333333': { wall: '#e3b66d', roof: '#7a3f5e', trim: '#f6e4b4', towers: 1, dome: true, arches: 0, length: 6, width: 4, height: 3 },
}

const WALLS = ['#e8d9b5', '#d9b99b', '#e6cf8a', '#cfd8c0', '#f1e3c6']
const ROOFS = ['#9b4a37', '#6f4b8a', '#4d6b8c', '#8a6a3b']
const TRIMS = ['#b9a577', '#8fb0a8', '#e9d9a6']

// FNV-1a: a stable number from any string, so an unknown church always gets the same look.
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

export function styleFor(church: { id: string }): ChurchStyle {
  const known = KNOWN[church.id]
  if (known) return known
  const h = hash(church.id)
  return {
    wall: WALLS[h % WALLS.length],
    roof: ROOFS[(h >>> 3) % ROOFS.length],
    trim: TRIMS[(h >>> 6) % TRIMS.length],
    towers: ((h >>> 9) % 3) as 0 | 1 | 2,
    dome: ((h >>> 12) & 1) === 1,
    arches: ((h >>> 13) & 1) === 1 ? 4 : 0,
    length: 5.5 + ((h >>> 14) % 3),
    width: 3.4 + ((h >>> 17) % 3) * 0.5,
    height: 2.6 + ((h >>> 20) % 3) * 0.3,
  }
}
