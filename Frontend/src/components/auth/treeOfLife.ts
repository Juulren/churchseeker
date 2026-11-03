// The login art: a tree of life drawn from a seed. Branches above, roots below, a faint ring around the whole.
// It is deliberately organic (uneven angles and lengths): a tidy ten-node diagram would read as one tradition's emblem.
// Asciify turns this picture into characters; the same picture is the still poster when WebGL is not available.

export interface Segment { x1: number; y1: number; x2: number; y2: number; bend: number; width: number; tip: boolean; root: boolean }

export const TREE_WIDTH = 900
export const TREE_HEIGHT = 1100

// Small seeded generator, so the same seed always grows the same tree.
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function grow(out: Segment[], rand: () => number, x: number, y: number, angle: number, length: number, width: number, depth: number, root: boolean) {
  const x2 = x + Math.cos(angle) * length
  const y2 = y + Math.sin(angle) * length
  const tip = depth === 0
  out.push({ x1: x, y1: y, x2, y2, bend: (rand() - 0.5) * length * 0.18, width, tip, root })
  if (tip) return
  const children = rand() < 0.28 ? 3 : 2
  for (let i = 0; i < children; i++) {
    const spread = (i - (children - 1) / 2) * (0.5 + rand() * 0.28) + (rand() - 0.5) * 0.3
    const shorter = 0.68 + rand() * 0.14
    grow(out, rand, x2, y2, angle + spread, length * shorter, Math.max(width * 0.76, 7), depth - 1, root)
  }
}

export function treeSegments(seed: number): Segment[] {
  const rand = rng(seed)
  const out: Segment[] = []
  const baseY = TREE_HEIGHT * 0.56
  const cx = TREE_WIDTH / 2
  grow(out, rand, cx, baseY, -Math.PI / 2 + (rand() - 0.5) * 0.08, 134, 44, 7, false)
  grow(out, rand, cx, baseY, Math.PI / 2 + (rand() - 0.5) * 0.1, 92, 24, 6, true)
  return out
}

export function drawTreeOfLife(canvas: HTMLCanvasElement, seed = 5): void {
  canvas.width = TREE_WIDTH
  canvas.height = TREE_HEIGHT
  const g = canvas.getContext('2d')
  if (!g) return
  const rand = rng(seed * 31 + 5)
  g.fillStyle = '#000'
  g.fillRect(0, 0, TREE_WIDTH, TREE_HEIGHT)

  // The ring: a quiet circle around everything, with no mark of any one tradition.
  g.strokeStyle = 'rgba(255,255,255,0.28)'
  g.lineWidth = 4
  g.beginPath()
  g.arc(TREE_WIDTH / 2, TREE_HEIGHT * 0.5, TREE_WIDTH * 0.45, 0, Math.PI * 2)
  g.stroke()

  g.lineCap = 'round'
  for (const s of treeSegments(seed)) {
    g.strokeStyle = s.root ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.95)'
    g.lineWidth = s.width
    const mx = (s.x1 + s.x2) / 2 - (s.y2 - s.y1) * (s.bend / Math.max(1, Math.hypot(s.x2 - s.x1, s.y2 - s.y1)))
    const my = (s.y1 + s.y2) / 2 + (s.x2 - s.x1) * (s.bend / Math.max(1, Math.hypot(s.x2 - s.x1, s.y2 - s.y1)))
    g.beginPath()
    g.moveTo(s.x1, s.y1)
    g.quadraticCurveTo(mx, my, s.x2, s.y2)
    g.stroke()
    if (s.tip && !s.root && rand() < 0.22) {
      // Leaves and seeds: a small cluster of soft dots at each branch tip.
      const n = 1 + Math.floor(rand() * 2)
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2
        const r = 4 + rand() * 16
        g.fillStyle = `rgba(255,255,255,${0.45 + rand() * 0.5})`
        g.beginPath()
        g.arc(s.x2 + Math.cos(a) * r, s.y2 + Math.sin(a) * r, 2.5 + rand() * 3.5, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
}

export function treeOfLifeUrl(seed = 5): string {
  const canvas = document.createElement('canvas')
  drawTreeOfLife(canvas, seed)
  return canvas.toDataURL('image/png')
}
