import { useMemo } from 'react'
import { sigilPath } from './sigil.ts'

/** The church's sigil: a ring and seven repeated marks, in the ink colour of the text around it. */
export default function Sigil({ name, size = 28 }: { name: string; size?: number }) {
  const d = useMemo(() => sigilPath(name), [name])
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="50" cy="50" r="47" opacity="0.55" />
      <path d={d} />
    </svg>
  )
}
