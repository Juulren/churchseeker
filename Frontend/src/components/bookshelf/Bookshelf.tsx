import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Section } from '../rpg-view/churchData.ts'
import { PanelTitle } from '../rpg-view/Panels.tsx'
import Bookshelf3D from './Bookshelf3D.tsx'
import type { ShelfBook } from './shelfLayout.ts'

// pdf.js and its worker are only fetched when somebody opens a book.
const PdfReader = lazy(() => import('./PdfReader.tsx'))

interface Props {
  section: Section<ShelfBook[]> | undefined
  loading: boolean
  /** Fetches the PDF bytes of one book (public or, with a session, private). */
  fetchFile: (bookId: string) => Promise<ArrayBuffer>
  /** Lets the parent pause its own Esc handling while the reader is open. */
  onReaderChange?: (open: boolean) => void
}

/** Codex shelf: thick-spined books in 3D, plus an accessible list with the same books. */
export default function Bookshelf({ section, loading, fetchFile, onReaderChange }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const books = section?.data ?? []
  const book = books.find((b) => b.id === openId) ?? null

  const open = useCallback((id: string) => {
    opener.current = document.activeElement as HTMLElement | null
    setOpenId(id)
  }, [])
  const close = useCallback(() => {
    setOpenId(null)
    opener.current?.focus?.()
  }, [])

  useEffect(() => { onReaderChange?.(book !== null) }, [book, onReaderChange])

  // A new function per book would restart the download on every render, so it is memoised on the id.
  const load = useCallback(() => fetchFile(openId ?? ''), [fetchFile, openId])

  return (
    <section aria-labelledby="shelf-title">
      <PanelTitle><span id="shelf-title">Estante de códices</span></PanelTitle>
      {(loading || !section) && <p style={{ color: 'var(--ink-dim)' }}>Cargando…</p>}
      {section?.error && <p role="alert">{section.error}</p>}
      {section && !section.error && books.length === 0 && <p style={{ color: 'var(--ink-dim)' }}>Aún no hay códices públicos.</p>}
      {books.length > 0 && (
        <>
          <Bookshelf3D books={books} hoveredId={hoveredId} onHover={setHoveredId} onOpen={open} />
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {books.map((b) => (
              <li key={b.id}>
                <button className="rpg-button w-full text-left" onClick={(e) => { opener.current = e.currentTarget; setOpenId(b.id) }}
                  onMouseEnter={() => setHoveredId(b.id)} onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(b.id)} onBlur={() => setHoveredId(null)}>
                  {b.isPublic === false && <span title="Privado: solo personal de la iglesia">🔒 </span>}
                  {b.title}
                  {b.author && <span style={{ color: 'var(--ink-dim)' }}> · {b.author}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {book && (
        <Suspense fallback={createPortal(<p role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">Abriendo el libro…</p>, document.body)}>
          <PdfReader key={book.id} title={book.title} spineColor={book.spineColor} load={load} onClose={close} />
        </Suspense>
      )}
    </section>
  )
}
