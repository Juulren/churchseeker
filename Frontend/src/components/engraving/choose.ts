import { TYPOLOGIES, type Authored, type Typology, type Variation } from './plates.ts'

/** What to draw for a church: one of the plates drawn by hand for the pilot churches, or a typology varied by its id. */
export interface Choice { kind: Authored | Typology; variation: Variation }

const AUTHORED: Record<string, Authored> = {
  '11111111-1111-1111-1111-111111111111': 'cathedral',
  '22222222-2222-2222-2222-222222222222': 'santalucia',
  '33333333-3333-3333-3333-333333333333': 'jesus',
}

// FNV-1a: a stable number from any string, so a church always gets the same engraving.
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

export function chooseFor(church: { id: string }): Choice {
  const h = hash(church.id)
  const variation: Variation = { towers: ((h >>> 9) % 3) as 0 | 1 | 2, dome: ((h >>> 12) & 1) === 1, columns: 4 + ((h >>> 15) % 5) }
  return { kind: AUTHORED[church.id] ?? TYPOLOGIES[(h >>> 4) % TYPOLOGIES.length], variation }
}
