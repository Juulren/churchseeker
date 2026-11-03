import { useRef } from 'react'
import { useKit } from './useKit.ts'

/** Slide to confirm: for actions that are hard to take back. Keyboard users move the slider with the arrow keys and End. */
export default function SlideConfirm({ label, doneLabel, onConfirm }: { label: string; doneLabel: string; onConfirm: () => void }) {
  const track = useRef<HTMLDivElement>(null)
  const confirm = useRef(onConfirm)
  confirm.current = onConfirm
  useKit(track, (kit, el) => kit.slideToConfirm(el, { onConfirm: () => confirm.current() }))
  return (
    <div ref={track} className="slide">
      <span data-label>{label}</span>
      <span data-confirmed hidden>{doneLabel}</span>
      <span role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} className="slide-thumb">›</span>
    </div>
  )
}
