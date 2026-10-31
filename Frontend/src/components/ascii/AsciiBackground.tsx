import { useEffect, useRef } from 'react'
import { AsciiRenderer, paletteFor, type Pointer } from './asciiEngine.ts'

interface Props {
  /** Church whose palette to use; omit for the default one. */
  churchId?: string | null
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Full-screen animated ASCII art. Rendering happens in a Web Worker on an OffscreenCanvas when the
 * browser supports it (the page thread stays free), otherwise on the main thread. The cursor makes the
 * characters light up and the palette follows the selected church.
 */
export default function AsciiBackground({ churchId }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const paletteSetter = useRef<(id?: string | null) => void>(() => {})

  useEffect(() => {
    const el = host.current
    if (!el) return

    // The canvas is created here, not in JSX: transferControlToOffscreen works once per element,
    // and React StrictMode mounts effects twice in development.
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    el.appendChild(canvas)

    const reduced = prefersReducedMotion()
    const size = () => ({ w: el.clientWidth, h: el.clientHeight, dpr: Math.min(window.devicePixelRatio || 1, 2) })
    let pointer: Pointer | null = null
    let dirtyPointer = false
    let disposed = false
    let post: (msg: unknown) => void = () => {}
    let stop: () => void = () => {}
    let setRunning: (running: boolean) => void = () => {}
    let setPalette: (id?: string | null) => void = () => {}

    const s = size()
    if (typeof canvas.transferControlToOffscreen === 'function' && typeof Worker !== 'undefined') {
      const worker = new Worker(new URL('./ascii.worker.ts', import.meta.url), { type: 'module' })
      const offscreen = canvas.transferControlToOffscreen()
      worker.postMessage({ type: 'init', canvas: offscreen, width: s.w, height: s.h, dpr: s.dpr, palette: paletteFor(churchId), reducedMotion: reduced }, [offscreen])
      post = (m) => worker.postMessage(m)
      stop = () => worker.terminate()
      setRunning = (running) => worker.postMessage({ type: 'running', running })
      setPalette = (id) => worker.postMessage({ type: 'palette', palette: paletteFor(id) })
    } else {
      // Fallback: same renderer on the main thread.
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const renderer = new AsciiRenderer(ctx, reduced)
        renderer.setPalette(paletteFor(churchId))
        const apply = () => {
          const z = size()
          canvas.width = Math.max(1, Math.floor(z.w * z.dpr))
          canvas.height = Math.max(1, Math.floor(z.h * z.dpr))
          renderer.resize(z.w, z.h, z.dpr)
        }
        apply()
        let raf = 0
        let running = true
        const loop = (now: number) => {
          if (!running || disposed) return
          renderer.draw(now)
          raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
        post = (m) => {
          const msg = m as { type: string; width?: number }
          if (msg.type === 'resize') apply()
          if (msg.type === 'pointer') renderer.setPointer((m as { pointer: Pointer | null }).pointer)
        }
        setPalette = (id) => renderer.setPalette(paletteFor(id))
        setRunning = (r) => { running = r; if (r) raf = requestAnimationFrame(loop) }
        stop = () => cancelAnimationFrame(raf)
      }
    }
    paletteSetter.current = setPalette

    // Pointer moves are batched to one message per animation frame.
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top }
      dirtyPointer = true
    }
    const onLeave = () => { pointer = null; dirtyPointer = true }
    let flushRaf = 0
    const flush = () => {
      if (dirtyPointer) { post({ type: 'pointer', pointer }); dirtyPointer = false }
      flushRaf = requestAnimationFrame(flush)
    }
    flushRaf = requestAnimationFrame(flush)

    const observer = new ResizeObserver(() => {
      const z = size()
      post({ type: 'resize', width: z.w, height: z.h, dpr: z.dpr })
    })
    observer.observe(el)
    const onVisibility = () => setRunning(!document.hidden)

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      cancelAnimationFrame(flushRaf)
      observer.disconnect()
      stop()
      canvas.remove()
    }
    // The palette is updated separately below, so the renderer is not rebuilt on church changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { paletteSetter.current(churchId) }, [churchId])

  return <div ref={host} className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true" />
}
