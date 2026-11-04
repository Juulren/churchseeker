import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ApiError, publicApi } from './services/api.ts'
import type { PublicChurch } from './services/types.ts'
import Sigil from './components/sigil/Sigil.tsx'
import ServerDown from './components/ornament/ServerDown.tsx'

// three.js is heavy: the map and the detail view load on demand, after the first paint.
const RealMap = lazy(() => import('./components/map/RealMap.tsx'))
const RpgView = lazy(() => import('./components/rpg-view/RpgView.tsx'))

type View = 'map' | 'detail'

export function PublicApp() {
  const [churches, setChurches] = useState<PublicChurch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState('503')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('map')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    publicApi.churches()
      .then((list) => { if (!controller.signal.aborted) setChurches(list) })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        // No answer (0) or a bad gateway reads as 503; any other status is shown as it is.
        setErrorCode(e instanceof ApiError && e.status >= 400 && e.status < 600 && ![502, 504].includes(e.status) ? String(e.status) : '503')
        setError(e instanceof Error ? e.message : 'Error desconocido')
      })
    return () => controller.abort()
  }, [attempt])

  const selected = churches?.find((c) => c.id === selectedId) ?? null
  const enter = useCallback(() => setView('detail'), [])
  const back = useCallback(() => { setView('map'); setSelectedId(null) }, [])
  const detail = view === 'detail' && selected

  // Without the list of churches there is nothing to show: say so plainly and let the person try again.
  if (error && !churches) return <ServerDown code={errorCode} message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1) }} />

  return (
    <>

      {/* One row: the name on the left and, from sm up, the staff link on the right, centred on the same line. The map's own
          controls sit in the corner, so the row stops short of them. */}
      <header className="rpg-panel pointer-events-none absolute left-4 right-14 top-3 z-10 flex items-center justify-between gap-3 px-3 py-1 sm:px-4">
        <div>
          <h1 className="text-2xl sm:text-3xl">ChurchSeeker</h1>
          <p className="rpg-label">Mérida · Yucatán</p>
        </div>
        <a href="#/login" className="rpg-button pointer-events-auto hidden whitespace-nowrap sm:inline-block">Acceso del personal</a>
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
                    className="rpg-button flex w-full items-center gap-2 text-left"
                    aria-pressed={c.id === selectedId}
                    onClick={() => setSelectedId(c.id)}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(c.id)}
                    onBlur={() => setHoveredId(null)}
                  >
                    <Sigil name={c.name} size={22} />
                    <span>{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {selected && (
            <aside className="rpg-panel absolute bottom-4 right-4 z-10 w-80 p-3" aria-live="polite">
              <h2 className="flex items-center gap-2 text-2xl" style={{ color: 'var(--accent)' }}><Sigil name={selected.name} size={34} />{selected.name}</h2>
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
