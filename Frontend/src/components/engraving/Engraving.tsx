import { useId, useMemo } from 'react'
import { engravingMarkup, type EngravingOptions } from './markup.ts'

/** A church's line engraving (see markup.ts), for pages. Pure SVG: no WebGL, no downloads, the same on every device. */
export default function Engraving({ id, ...options }: { id: string } & EngravingOptions) {
  const uid = useId()
  const html = useMemo(() => engravingMarkup(id, 'e' + uid, options), [id, uid, options.label, options.draw, options.className]) // eslint-disable-line react-hooks/exhaustive-deps
  // The markup is built here from constants; the only outside text, the label, is escaped.
  return <span className="engraving-box" dangerouslySetInnerHTML={{ __html: html }} />
}
