import { useEffect, type RefObject } from 'react'

type Kit = typeof import('asciify-engine/kit')

/**
 * Mounts one Asciify kit component on an element and removes it again. The kit loads on demand, so pages that never
 * use it never pay for it, and a failure (no WebGL, blocked chunk) leaves the plain HTML exactly as it was.
 * The component receives the handle's `destroy` back through the cleanup; `deps` decide when it is mounted again.
 */
export function useKit<E extends HTMLElement>(ref: RefObject<E | null>, mount: (kit: Kit, el: E) => { destroy: () => void } | null | void, deps: unknown[] = []) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    let handle: { destroy: () => void } | null | void = null
    import('asciify-engine/kit').then((kit) => {
      if (alive) handle = mount(kit, el)
    }).catch(() => { /* the HTML works without it */ })
    return () => {
      alive = false
      handle?.destroy()
    }
    // The caller lists the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Plays the decode headline once and removes its canvas when it has finished, so nothing is left drawn over the real text. */
export function decodeOnce(kit: Kit, el: HTMLElement, duration = 800): { destroy: () => void } {
  const handle = kit.decode(el, { duration, settle: 'text' })
  let done = false
  const finish = () => { if (!done) { done = true; handle.destroy() } }
  const timer = window.setTimeout(finish, duration + 400)
  return { destroy: () => { window.clearTimeout(timer); finish() } }
}
