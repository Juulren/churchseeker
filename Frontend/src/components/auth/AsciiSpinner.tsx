import { useEffect, useState } from 'react'

const FRAMES = ['|', '/', '-', '\\']

/** A rotating ASCII glyph for "working". Decorative: the button itself announces the busy state. */
export default function AsciiSpinner() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 90)
    return () => clearInterval(t)
  }, [])
  return <span aria-hidden="true" className="ascii-spinner">{FRAMES[i]}</span>
}
