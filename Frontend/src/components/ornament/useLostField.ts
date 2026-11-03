import { useRef, type RefObject } from 'react'
import type { FieldBackgroundHandle } from 'asciify-engine/kit'
import { useKit } from '../ascii/useKit.ts'

/**
 * The large numerals of an error screen, drawn in characters (the kit's notFound field) that scatter under the pointer.
 * `play(from, then)` breaks them apart and lets them re-form before `then` runs; reduced motion, no WebGL or a second
 * call while one is running just run `then` (once). The art element is decoration: the text beside it says everything.
 */
export function useLostField(code: string): { art: RefObject<HTMLDivElement | null>; play: (from: HTMLElement, then: () => void) => Promise<void> } {
  const art = useRef<HTMLDivElement>(null)
  const field = useRef<FieldBackgroundHandle | null>(null)
  const running = useRef(false)
  useKit(art, (kit, el) => {
    const handle = kit.fieldBackground(el, { preset: 'notFound', text: code })
    field.current = handle
    return { destroy: () => { field.current = null; handle.destroy() } }
  }, [code])

  const play = async (from: HTMLElement, then: () => void) => {
    const handle = field.current
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!handle || still) { then(); return }
    if (running.current) return
    running.current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([handle.scatter(from), new Promise((r) => { timer = setTimeout(r, 1800) })]) } catch { /* carry on anyway */ }
    clearTimeout(timer)
    running.current = false
    then()
  }
  return { art, play }
}
