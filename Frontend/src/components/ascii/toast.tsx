import { useRef } from 'react'
import { useKit } from './useKit.ts'

interface ToastInput { title: string; body?: string }
const listeners = new Set<(t: ToastInput) => void>()

/** Shows a short confirmation as a toast of characters. It starts with a check and the word "Listo:" so the outcome never rides on colour alone. Returns false when no toast host is ready, so the caller can show its own message. */
export function toast(title: string, body?: string): boolean {
  if (listeners.size === 0) return false
  listeners.forEach((l) => l({ title: `✓ Listo: ${title}`, body }))
  return true
}

/** One host per page, in the bottom-right corner. Without WebGL it stays out of the way and toast() returns false. */
export function ToastHost() {
  const box = useRef<HTMLDivElement>(null)
  useKit(box, (kit, el) => {
    const stack = kit.toastStack(el, { max: 3, duration: 5000, label: 'Avisos' })
    if (!stack.supported) { stack.destroy(); return null }
    const on = (t: ToastInput) => { stack.push(t) }
    listeners.add(on)
    return { destroy: () => { listeners.delete(on); stack.destroy() } }
  })
  return <div ref={box} className="toast-corner" />
}
