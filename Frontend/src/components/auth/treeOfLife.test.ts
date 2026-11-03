import { describe, expect, it } from 'vitest'
import { TREE_HEIGHT, TREE_WIDTH, treeSegments } from './treeOfLife.ts'

describe('treeOfLife', () => {
  it('grows the same tree from the same seed and a different one from another', () => {
    expect(treeSegments(5)).toEqual(treeSegments(5))
    expect(treeSegments(5)).not.toEqual(treeSegments(6))
  })

  it('has branches above and roots below, and stays inside the picture', () => {
    const s = treeSegments(5)
    expect(s.some((x) => !x.root)).toBe(true)
    expect(s.some((x) => x.root)).toBe(true)
    for (const x of s) {
      expect(x.x2).toBeGreaterThan(0)
      expect(x.x2).toBeLessThan(TREE_WIDTH)
      expect(x.y2).toBeGreaterThan(0)
      expect(x.y2).toBeLessThan(TREE_HEIGHT)
    }
  })

  it('is organic: the two halves of the canopy are never mirror images', () => {
    const tips = treeSegments(5).filter((x) => x.tip && !x.root)
    const mid = TREE_WIDTH / 2
    const left = tips.filter((x) => x.x2 < mid).map((x) => Math.round(mid - x.x2)).sort((a, b) => a - b)
    const right = tips.filter((x) => x.x2 >= mid).map((x) => Math.round(x.x2 - mid)).sort((a, b) => a - b)
    expect(JSON.stringify(left)).not.toBe(JSON.stringify(right))
  })

  it('is not a ten-node diagram: it has many more branches than that', () => {
    expect(treeSegments(5).length).toBeGreaterThan(60)
  })
})
