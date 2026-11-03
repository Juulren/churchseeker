import { ball, columns, dome, domeShade, Draft, GROUND, hline, pediment, plateOf, pointedArch, rect, ribs, roundArch, tower, type Plate } from './draft.ts'

// The plates: three drawn by hand for the pilot churches (from their real arrangement: facade, towers, dome) and four
// typologies, varied by each church's seed, for every other church. Elevations seen from the front, light from the left.

export type Typology = 'nave' | 'rotunda' | 'portico' | 'courtyard'
export const TYPOLOGIES: Typology[] = ['nave', 'rotunda', 'portico', 'courtyard']
export type Authored = 'cathedral' | 'santalucia' | 'jesus'

export interface Variation { towers: 0 | 1 | 2; dome: boolean; columns: number }

/** A round window with seven spokes: an odd fold, so it can never read as a cross. */
function wheel(d: Draft, cx: number, cy: number, r: number) {
  d.line(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`)
  let spokes = ''
  for (let k = 0; k < 7; k++) {
    const a = (k * Math.PI * 2) / 7 - Math.PI / 2
    spokes += `M${(cx + Math.cos(a) * 1.8).toFixed(1)} ${(cy + Math.sin(a) * 1.8).toFixed(1)}L${(cx + Math.cos(a) * (r - 0.8)).toFixed(1)} ${(cy + Math.sin(a) * (r - 0.8)).toFixed(1)}`
  }
  d.line(spokes)
}

/** A dome on a drum with a lantern, as seen behind a facade. `base` is where the drum meets the roof. */
function crown(d: Draft, cx: number, base: number, drumW: number, drumH: number, r: number, rise: number) {
  const top = base - drumH
  d.solid(rect(cx - drumW / 2, top, drumW, drumH))
  for (const dx of [-drumW / 3.2, 0, drumW / 3.2]) d.shade('coarse', roundArch(cx + dx, base - 2, 5, Math.min(11, drumH - 3)))
  d.solid(dome(cx, top, r, rise))
  d.line(ribs(cx, top, r, rise))
  d.shade('medium', domeShade(cx, top, r, rise))
  const lt = top - rise
  d.solid(rect(cx - 3.5, lt - 7, 7, 7))
  d.solid(dome(cx, lt - 7, 4.5, 4))
  d.line(ball(cx, lt - 13.5, 1.8))
}

function steps(d: Draft, cx: number, w: number) {
  d.line(hline(cx - w / 2, cx + w / 2, GROUND + 2.5))
  d.line(hline(cx - w / 2 - 6, cx + w / 2 + 6, GROUND + 5))
}

export function cathedral(): Plate {
  const d = new Draft()
  crown(d, 120, 92, 44, 16, 22, 24)
  // The facade: two orders under a cornice and a low pediment, with pilasters.
  d.solid(rect(62, 92, 116, 66))
  d.solid(rect(58, 89, 124, 4))
  d.solid(pediment(80, 89, 80, 10))
  d.solid(rect(62, 124, 116, 3))
  for (const x of [78, 158]) d.line(rect(x, 94, 4, 64))
  d.line(roundArch(120, GROUND, 32, 52))
  d.shade('coarse', roundArch(120, GROUND, 22, 42))
  for (const x of [90, 150]) d.shade('coarse', roundArch(x, GROUND, 14, 28))
  d.solid(rect(113, 98, 14, 18))
  d.shade('coarse', rect(115, 100, 10, 14))
  d.solid(pediment(111, 98, 18, 5))
  for (const x of [90, 150]) d.shade('coarse', roundArch(x, 118, 9, 16))
  tower(d, 44, GROUND, 32, 36, 16)
  tower(d, 196, GROUND, 32, 36, 16)
  steps(d, 120, 50)
  d.ground()
  return plateOf(d)
}

export function santaLucia(): Plate {
  const d = new Draft()
  // A bell gable (espadaña) with three bell openings, over a low facade with an arcade of five arches.
  d.solid(rect(98, 70, 44, 38))
  for (const x of [108, 120, 132]) d.shade('coarse', roundArch(x, 98, 9, 16))
  d.solid(pediment(98, 70, 44, 12))
  d.line(ball(120, 54.5, 2))
  for (const x of [98, 142]) d.line(ball(x, 68, 1.6))
  d.shade('medium', rect(131, 72, 11, 34))
  d.solid(rect(70, 106, 100, 52))
  d.solid(rect(66, 103, 108, 4))
  for (const x of [90, 150]) d.shade('coarse', roundArch(x, 122, 8, 10))
  for (const x of [80, 100, 140, 160]) d.shade('coarse', roundArch(x, GROUND, 14, 26))
  d.line(roundArch(120, GROUND, 22, 40))
  d.shade('coarse', roundArch(120, GROUND, 14, 34))
  d.shade('medium', rect(158, 107, 12, 51))
  steps(d, 120, 36)
  d.ground()
  return plateOf(d)
}

export function jesus(): Plate {
  const d = new Draft()
  crown(d, 120, 90, 40, 16, 20, 20)
  d.solid(rect(76, 100, 88, 58))
  d.solid(rect(72, 97, 96, 4))
  d.solid(pediment(80, 97, 80, 12))
  d.solid(rect(76, 126, 88, 3))
  for (const x of [79, 157]) d.line(rect(x, 102, 4, 56))
  d.line(roundArch(120, GROUND, 28, 48))
  d.shade('coarse', roundArch(120, GROUND, 18, 38))
  for (const x of [97, 143]) { d.line(roundArch(x, 142, 12, 24)); d.shade('coarse', roundArch(x, 142, 8, 20)) }
  wheel(d, 120, 114, 8)
  tower(d, 66, GROUND, 20, 46, 20)
  tower(d, 174, GROUND, 20, 46, 20)
  steps(d, 120, 46)
  d.ground()
  return plateOf(d)
}

function nave(v: Variation): Plate {
  const d = new Draft()
  if (v.dome) crown(d, 120, 94, 36, 12, 18, 18)
  d.solid(rect(70, 96, 100, 62))
  d.solid(rect(66, 93, 108, 4))
  d.solid(pediment(78, 93, 84, 13))
  const n = 3 + 2 * (v.columns % 3)
  for (let i = 0; i < n; i++) d.shade('coarse', roundArch(80 + (80 * i) / (n - 1), 126, 7, 14))
  d.line(hline(70, 170, 130))
  d.line(pointedArch(120, GROUND, 28, 46))
  d.shade('coarse', pointedArch(120, GROUND, 18, 36))
  const side = v.towers === 0 ? [] : v.towers === 1 ? [56] : [56, 184]
  for (const cx of side) tower(d, cx, GROUND, 28, 54, 14)
  d.shade('medium', rect(156, 97, 14, 61))
  steps(d, 120, 40)
  d.ground()
  return plateOf(d)
}

function rotunda(v: Variation): Plate {
  const d = new Draft()
  d.solid(rect(72, 104, 96, 54))
  d.solid(rect(68, 101, 104, 4))
  d.solid(dome(120, 101, 48, 38))
  d.line(ribs(120, 101, 48, 38))
  d.shade('medium', domeShade(120, 101, 48, 38))
  d.solid(rect(115, 56, 10, 7))
  d.solid(dome(120, 56, 6, 5))
  d.line(ball(120, 48, 2))
  for (let i = 0; i < 7; i++) d.shade('coarse', roundArch(80 + (80 * i) / 6, 140, 7, 16))
  // The portico in front.
  const n = Math.max(4, Math.min(v.columns, 8))
  d.solid(rect(90, 114, 60, 44))
  d.shade('coarse', rect(90, 116, 60, 42))
  d.line(columns(94, 146, n, GROUND, 116))
  d.solid(rect(88, 110, 64, 5))
  d.solid(pediment(88, 110, 64, 12))
  steps(d, 120, 56)
  d.ground()
  return plateOf(d)
}

function portico(v: Variation): Plate {
  const d = new Draft()
  d.solid(rect(64, 100, 112, 58))
  d.shade('coarse', rect(64, 102, 112, 56))
  d.line(roundArch(120, GROUND, 20, 36))
  const n = Math.max(4, Math.min(v.columns, 8))
  d.line(columns(68, 172, n, GROUND, 100, 3.6))
  d.solid(rect(58, 93, 124, 7))
  d.solid(pediment(58, 93, 124, 19))
  d.shade('medium', 'M120 93V74L182 93Z')
  d.line(hline(52, 188, GROUND + 2.5))
  d.line(hline(46, 194, GROUND + 5))
  d.ground()
  return plateOf(d)
}

function courtyard(v: Variation): Plate {
  const d = new Draft()
  if (v.dome) { d.solid(dome(120, 84, 15, 13)); d.line(ribs(120, 84, 15, 13)); d.line(ball(120, 68.5, 1.8)) }
  d.solid(rect(86, 84, 68, 50))
  d.solid(pediment(82, 84, 76, 12))
  d.shade('coarse', roundArch(120, 126, 12, 22))
  for (const x of [96, 144]) d.shade('coarse', roundArch(x, 126, 8, 14))
  // Two wings with their roof lines.
  for (const x of [34, 154]) {
    d.solid(rect(x, 112, 52, 46))
    d.solid(rect(x - 3, 109, 58, 3))
    for (let i = 0; i < 3; i++) d.shade('coarse', roundArch(x + 10 + i * 16, 128, 7, 12))
  }
  // The front wall with its gate.
  d.solid(rect(34, 134, 172, 24))
  d.solid(rect(30, 131, 180, 3))
  d.solid(rect(100, 120, 40, 14))
  d.solid(pediment(98, 120, 44, 8))
  d.line(roundArch(120, GROUND, 28, 36))
  d.shade('coarse', roundArch(120, GROUND, 20, 30))
  d.shade('medium', rect(190, 134, 16, 24))
  steps(d, 120, 36)
  d.ground()
  return plateOf(d)
}

/** The plate of a church: its authored one, or the typology chosen for it, varied by its seed. */
export function plateFor(kind: Authored | Typology, v: Variation): Plate {
  switch (kind) {
    case 'cathedral': return cathedral()
    case 'santalucia': return santaLucia()
    case 'jesus': return jesus()
    case 'nave': return nave(v)
    case 'rotunda': return rotunda(v)
    case 'portico': return portico(v)
    case 'courtyard': return courtyard(v)
  }
}
