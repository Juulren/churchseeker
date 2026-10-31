import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import AsciiBackground from './components/ascii/AsciiBackground.tsx'
import { publicApi } from './services/api.ts'
import type { PublicChurch } from './services/types.ts'

// three.js is heavy: the map and the detail view load on demand, after the first paint.
const RealMap = lazy(() => import('./components/map3d/RealMap.tsx'))
const RpgView = lazy(() => import('./components/rpg-view/RpgView.tsx'))

type View = 'map' | 'detail'

export default function App() {
  const [churches, setChurches] = useState<PublicChurch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('map')

  useEffect(() => {
    const controller = new AbortController()
    publicApi.churches()
      .then((list) => { if (!controller.signal.aborted) setChurches(list) })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Error desconocido') })
    return () => controller.abort()
  }, [])

  const selected = churches?.find((c) => c.id === selectedId) ?? null
  const enter = useCallback(() => setView('detail'), [])
  const back = useCallback(() => { setView('map'); setSelectedId(null) }, [])
  const detail = view === 'detail' && selected

  return (
    <>
      <AsciiBackground churchId={hoveredId ?? selectedId} />

      <header className="rpg-panel pointer-events-none absolute left-4 top-3 z-10 px-4 py-1">
        <h1 className="text-4xl tracking-widest" style={{ color: 'var(--accent)' }}>ChurchSeeker</h1>
        <p style={{ color: 'var(--ink-dim)' }}>Mérida, Yucatán</p>
      </header>

      <Suspense fallback={<p className="absolute left-1/2 top-1/2 -translate-x-1/2" role="status">Cargando…</p>}>
        {detail ? (
          <RpgView church={selected} onBack={back} />
        ) : (
          churches && (
            <RealMap churches={churches} selectedId={selectedId} hoveredId={hoveredId} onSelect={setSelectedId}
              onHover={setHoveredId} onArrive={enter} />
          )
        )}
      </Suspense>

      {!detail && (
        <>
          {/* Always available, also for keyboards, screen readers and devices without WebGL. */}
          <nav className="rpg-panel absolute bottom-4 left-4 z-10 w-72 p-3" aria-label="Iglesias de Mérida">
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
            <aside className="rpg-panel absolute bottom-4 right-4 z-10 w-80 p-3" aria-live="polite">
              <h2 className="text-2xl" style={{ color: 'var(--accent)' }}>{selected.name}</h2>
              <p style={{ color: 'var(--ink-dim)' }}>{selected.denomination} · {selected.patronSaint}</p>
              <div className="mt-3 flex gap-2">
                <button className="rpg-button" onClick={enter}>Entrar</button>
                <button className="rpg-button" onClick={() => setSelectedId(null)}>Volver al mapa</button>
              </div>
            </aside>
          )}
        </>
      )}
    </>
  )
}
