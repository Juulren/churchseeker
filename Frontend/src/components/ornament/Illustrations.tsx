import type { ReactNode } from 'react'
import Ornament from './Ornament.tsx'

/** An empty list or table: a small lamp above a line of text. The text is the message; the lamp only sets the mood. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Ornament name="lamp" size={56} draw />
      <p className="muted">{children}</p>
    </div>
  )
}

/** The loading screen: a rosette that draws itself and turns slowly while the page loads. */
export function LoadingScreen({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loading-screen" role="status">
      <Ornament name="rosette" size={120} draw turn />
      <p className="rpg-label">{label}</p>
    </div>
  )
}

/** The 404: a road running to an open doorway. */
export function LostPath() {
  return (
    <div className="lost-path" aria-hidden="true">
      <Ornament name="doorway" size={150} draw />
      <Ornament name="road" size={230} draw />
    </div>
  )
}

/** A thin band of ornaments for the top of a page. */
export function OrnamentStrip() {
  return (
    <div className="ornament-strip" aria-hidden="true">
      <Ornament name="guilloche" size={260} draw />
      <Ornament name="divider" size={200} draw />
      <Ornament name="guilloche" size={260} draw />
    </div>
  )
}
