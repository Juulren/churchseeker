import { useEffect, useState } from 'react'
import AsciiBackground from './components/ascii/AsciiBackground.tsx'
import { publicApi } from './services/api.ts'
import type { PublicChurch } from './services/types.ts'

export default function App() {
  const [churches, setChurches] = useState<PublicChurch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    publicApi.churches()
      .then((list) => { if (!controller.signal.aborted) setChurches(list) })
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Error desconocido') })
    return () => controller.abort()
  }, [])

  return (
    <>
      <AsciiBackground churchId={hovered} />
      <main className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-5xl tracking-widest" style={{ color: 'var(--accent)' }}>ChurchSeeker</h1>
        <p style={{ color: 'var(--ink-dim)' }}>Mérida, Yucatán · elige una iglesia</p>
        <section className="rpg-panel w-full p-4" aria-live="polite">
          {error && <p role="alert">{error}</p>}
          {!error && !churches && <p>Cargando iglesias…</p>}
          <ul className="flex flex-col gap-2">
            {churches?.map((c) => (
              <li key={c.id}>
                <button className="rpg-button w-full text-left" onMouseEnter={() => setHovered(c.id)} onFocus={() => setHovered(c.id)}
                  onMouseLeave={() => setHovered(null)} onBlur={() => setHovered(null)}>
                  {c.name} <span style={{ color: 'var(--ink-dim)' }}>· {c.patronSaint}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}
