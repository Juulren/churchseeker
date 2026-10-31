import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { PublicChurch } from '../../services/types.ts'
import ChurchStage from './ChurchStage.tsx'
import { EventsPanel, InfoPanel, NewsPanel } from './Panels.tsx'
import { useChurchData } from './useChurchData.ts'

interface Props {
  church: PublicChurch
  onBack: () => void
  /** Slot for the codex shelf (task 4.4). */
  shelf?: ReactNode
}

/** RPG split screen: the 3D church and its institutional data on the left (40%), events, notices and the shelf on the right (60%). */
export default function RpgView({ church, onBack, shelf }: Props) {
  const { data, loading } = useChurchData(church.id)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => { heading.current?.focus() }, [church.id])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  return (
    <motion.div
      className="absolute inset-0 grid gap-4 p-4 pt-20 md:grid-cols-[2fr_3fr] md:pt-16"
      style={{ gridTemplateRows: 'minmax(0, 1fr)' }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <div className="rpg-panel min-h-[200px] flex-1 overflow-hidden">
          <ChurchStage id={church.id} name={church.name} patronSaint={church.patronSaint} />
        </div>
        <div className="max-h-[45%] overflow-y-auto">
          <InfoPanel section={data?.profile} loading={loading} />
        </div>
      </div>

      <div className="rpg-panel flex min-h-0 min-w-0 flex-col gap-6 overflow-y-auto p-4">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 ref={heading} tabIndex={-1} className="text-3xl outline-none" style={{ color: 'var(--accent)' }}>{church.name}</h2>
            <p style={{ color: 'var(--ink-dim)' }}>{church.denomination} · {church.patronSaint}</p>
          </div>
          <button className="rpg-button" onClick={onBack}>← Volver al mapa (Esc)</button>
        </header>
        <EventsPanel section={data?.events} loading={loading} />
        <NewsPanel section={data?.announcements} loading={loading} />
        {shelf}
      </div>
    </motion.div>
  )
}
