/// <reference lib="webworker" />
// Renders the ASCII background off the main thread so heavy animation never blocks the UI.
import { AsciiRenderer, type Palette, type Pointer } from './asciiEngine.ts'

type Message =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; dpr: number; palette: Palette; reducedMotion: boolean }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'pointer'; pointer: Pointer | null }
  | { type: 'palette'; palette: Palette }
  | { type: 'running'; running: boolean }

let canvas: OffscreenCanvas | null = null
let renderer: AsciiRenderer | null = null
let running = true
let handle = 0

const schedule = (cb: FrameRequestCallback): number =>
  typeof self.requestAnimationFrame === 'function' ? self.requestAnimationFrame(cb) : (self.setTimeout(() => cb(performance.now()), 16) as unknown as number)

function loop(now: number) {
  if (!running || !renderer) return
  renderer.draw(now)
  handle = schedule(loop)
}

function resize(width: number, height: number, dpr: number) {
  if (!canvas || !renderer) return
  const scale = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 2) : 1
  canvas.width = Math.max(1, Math.floor(width * scale))
  canvas.height = Math.max(1, Math.floor(height * scale))
  renderer.resize(width, height, scale)
}

self.onmessage = (e: MessageEvent<Message>) => {
  const m = e.data
  switch (m.type) {
    case 'init': {
      canvas = m.canvas
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      renderer = new AsciiRenderer(ctx, m.reducedMotion)
      renderer.setPalette(m.palette)
      resize(m.width, m.height, m.dpr)
      handle = schedule(loop)
      break
    }
    case 'resize': resize(m.width, m.height, m.dpr); break
    case 'pointer': renderer?.setPointer(m.pointer); break
    case 'palette': renderer?.setPalette(m.palette); break
    case 'running':
      running = m.running
      if (running) { cancelAnimationFrame?.(handle); handle = schedule(loop) }
      break
  }
}
