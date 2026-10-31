import { useEffect, useState } from 'react'
import AsciiBackground from './components/ascii/AsciiBackground.tsx'
import MeridaMap from './components/map3d/MeridaMap.tsx'
import { publicApi } from './services/api.ts'
import type { PublicChurch } from './services/types.ts'

export default function App() {
  const [churches, setChurches] = useState<PublicChurch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    publicApi.churches()
      .then((list) => { if (!controller.signal.aborted) setChurches(list) })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Error desconocido') })
    return () => controller.abort()
  }, [])

  const focus = hoveredId ?? selectedId
  const selected = churches?.find((c) => c.id === selectedId) ?? null

  return (
    <>
      <AsciiBackground churchId={focus} />
      {churches && (
        <MeridaMap churches={churches} selectedId={selectedId} hoveredId={hoveredId} onSelect={setSelectedId} onHover={setHoveredId} />
      )}

      <header className="pointer-events-none absolute left-4 top-3">
        <h1 className="text-4xl tracking-widest" style={{ color: 'var(--accent)' }}>ChurchSeeker</h1>
        <p style={{ color: 'var(--ink-dim)' }}>Mérida, Yucatán</p>
      </header>

      {/* Always available, also for keyboards, screen readers and devices without WebGL. */}
      <nav className="rpg-panel absolute bottom-4 left-4 w-72 p-3" aria-label="Iglesias de Mérida">
        {error && <p role="alert">{error}</p>}
        {!error && !churches && <p>Cargando iglesias…</p>}
        <ul className="flex flex-col gap-2">
          {churches?.map((c) => (
            <li key={c.id}>
              <button
                className="rpg-button w-full text-left"
                aria-pressed={c.id === selectedId}
                onClick={() => setSelectedId(c.id)}
                onMouseEnter={() => setHoveredId(c.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(c.id)}
                onBlur={() => setHoveredId(null)}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {selected && (
        <aside className="rpg-panel absolute bottom-4 right-4 w-80 p-3" aria-live="polite">
          <h2 className="text-2xl" style={{ color: 'var(--accent)' }}>{selected.name}</h2>
          <p style={{ color: 'var(--ink-dim)' }}>{selected.denomination} · {selected.patronSaint}</p>
          <button className="rpg-button mt-3" onClick={() => setSelectedId(null)}>Volver al mapa</button>
        </aside>
      )}
    </>
  )
}
