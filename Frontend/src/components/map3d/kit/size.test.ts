import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The facade kit, the authored models and the typologies together stay under 250 KB of source (DESIGN.md section 7),
// so the church viewer never becomes the heavy part of the page.
describe('kit size budget', () => {
  it('is at most 250 KB of source', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url))
    // Every source file under the kit folder counts, in subfolders too, so a file moved or renamed cannot drop out of the budget.
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
    const files = walk(dir).filter((f) => /.tsx?$/.test(f) && !/.test.tsx?$/.test(f))
    expect(files.length).toBeGreaterThan(3)
    const total = files.reduce((n, f) => n + statSync(f).size, 0)
    expect(total).toBeLessThanOrEqual(250 * 1024)
  })
})
