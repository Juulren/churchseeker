import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Ornaments are decorative: they never sit behind text and never take the pointer. The stylesheet is where that is decided.
const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))
const ornamentRules = rules.filter((r) => /\.ornament/.test(r.selector))

describe('ornament placement', () => {
  it('has rules for ornaments', () => expect(ornamentRules.length).toBeGreaterThan(2))
  it('no ornament rule puts anything under the text (no negative z-index)', () => {
    for (const r of ornamentRules) expect(r.body, r.selector).not.toMatch(/z-index:\s*-/)
  })
  it('an ornament never takes the pointer', () => {
    const base = ornamentRules.find((r) => r.selector === '.ornament')
    expect(base?.body).toMatch(/pointer-events:\s*none/)
  })
  it('no ornament is absolutely positioned over content', () => {
    for (const r of ornamentRules) expect(r.body, r.selector).not.toMatch(/position:\s*absolute/)
  })
})
