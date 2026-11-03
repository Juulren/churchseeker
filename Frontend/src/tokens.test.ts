/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The design tokens in index.css must stay monochrome and readable. The test composites every translucent colour over
// the surface it sits on before measuring, because a white at 14% alpha is not the white it looks like in the source.
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const root = /:root\s*{([^}]*)}/.exec(css)![1]
const tokens = new Map<string, string>()
for (const m of root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens.set(m[1], m[2].trim())

type Rgba = [number, number, number, number]
function parse(value: string): Rgba {
  const v = value.trim()
  const alias = /^var\(--([\w-]+)\)$/.exec(v)
  if (alias) return parse(tokens.get(alias[1])!)
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    const n = parseInt(h, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(v)
  if (rgba) { const p = rgba[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] ?? 1] }
  throw new Error('cannot read colour: ' + value)
}
const isColour = (v: string) => /^(#[0-9a-f]{3,6}|rgba?\()/i.test(v)
const token = (name: string) => parse(tokens.get(name)!)
const over = (top: Rgba, bottom: Rgba): Rgba => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1) as Rgba
const lum = (c: Rgba) => {
  const [r, g, b] = c.slice(0, 3).map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: Rgba, b: Rgba) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
const grey = (c: Rgba) => c[0] === c[1] && c[1] === c[2]

const TEXT = ['ink', 'ink-dim', 'accent', 'ok', 'warn', 'bad'] as const
// Everything text can sit on: the two flat surfaces, a panel over the page, and the hover fill of inputs.
const SURFACES: [string, Rgba][] = [
  ['stone', token('stone')],
  ['stone-high', token('stone-high')],
  ['panel over ground', over(token('panel'), token('ground'))],
  ['hovered input', parse('#202020')],
]

describe('design tokens', () => {
  it('have no hue: every colour token has equal red, green and blue', () => {
    const colours = [...tokens].filter(([, v]) => isColour(v) || v.startsWith('var('))
    expect(colours.length).toBeGreaterThan(15)
    for (const [name, value] of colours) {
      if (value.startsWith('var(') && !tokens.has(/--([\w-]+)/.exec(value)![1])) continue
      expect([name, grey(parse(value))]).toEqual([name, true])
    }
  })

  it('leave no colour literal with a hue anywhere in the stylesheet', () => {
    for (const m of css.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/gi)) {
      const lit = m[0].startsWith('rgb') ? m[0].replace(/\s+/g, '') + ')' : m[0]
      expect([m[0], grey(parse(lit))]).toEqual([m[0], true])
    }
  })

  it('keep every text colour at 4.5:1 or better on every surface', () => {
    for (const [sName, surface] of SURFACES) for (const t of TEXT) {
      expect([sName, t, ratio(over(token(t), surface), surface) >= 4.5]).toEqual([sName, t, true])
    }
  })

  it('keep control borders and the active border at 3:1 or better on every surface', () => {
    for (const [sName, surface] of SURFACES) for (const b of ['edge', 'rule-strong']) {
      expect([sName, b, ratio(over(token(b), surface), surface) >= 3]).toEqual([sName, b, true])
    }
  })

  it('treat the faint hairline as decoration only: it stays below 3:1', () => {
    const surface = token('stone')
    expect(ratio(over(token('rule'), surface), surface)).toBeLessThan(3)
  })

  it('map the Asciify inks to existing tokens', () => {
    for (const n of ['ascii-ink', 'ascii-ink-strong', 'ascii-success', 'ascii-warning', 'ascii-error']) expect(parse(tokens.get(n)!)).toBeTruthy()
  })
})
