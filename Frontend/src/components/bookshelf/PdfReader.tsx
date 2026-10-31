import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { MAX_PDF_BYTES, clampPage, looksLikePdf } from './pdfUtils.ts'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Scripting stays off and eval is disabled: a PDF is shown, never executed.
const OPTIONS = { isEvalSupported: false, enableXfa: false } as const

interface Props {
  title: string
  spineColor: string
  load: () => Promise<ArrayBuffer>
  onClose: () => void
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Hard-cover book that swings open to reveal the PDF. Arrow keys turn pages, Esc closes. */
export default function PdfReader({ title, spineColor, load, onClose }: Props) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [width, setWidth] = useState(600)
  const sheet = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let current = true
    load()
      .then((buf) => {
        if (!current) return
        if (buf.byteLength > MAX_PDF_BYTES || !looksLikePdf(buf)) setError('El archivo no es un PDF válido.')
        else setBytes(new Uint8Array(buf))
      })
      .catch((e: unknown) => { if (current) setError(e instanceof Error ? e.message : 'No se pudo abrir el documento.') })
    return () => { current = false }
  }, [load])

  // pdf.js takes ownership (transfers) of the buffer it is given, so it gets its own copy, created once.
  const file = useMemo(() => (bytes ? { data: bytes.slice() } : null), [bytes])

  useEffect(() => { closeButton.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowRight') setPage((p) => clampPage(p + 1, pages))
      else if (e.key === 'ArrowLeft') setPage((p) => clampPage(p - 1, pages))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pages])

  useEffect(() => {
    const el = sheet.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(Math.max(200, Math.floor(el.clientWidth - 24))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const swing = reduced() ? 0.01 : 1.1
  // Portalled to <body>: an ancestor with a CSS transform would otherwise become the containing block of this fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Lector: ${title}`}>
      <div className="relative flex h-full max-h-[92vh] w-full max-w-3xl flex-col" style={{ perspective: 1800 }}>
        <div ref={sheet} className="rpg-panel flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b-2 p-2" style={{ borderColor: 'var(--panel-edge)' }}>
            <strong className="truncate" style={{ color: 'var(--accent)' }}>{title}</strong>
            <div className="flex items-center gap-2">
              {pages > 0 && (
                <>
                  <button className="rpg-button" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((p) => clampPage(p - 1, pages))}>‹</button>
                  <span aria-live="polite">{page} / {pages}</span>
                  <button className="rpg-button" aria-label="Página siguiente" disabled={page >= pages} onClick={() => setPage((p) => clampPage(p + 1, pages))}>›</button>
                </>
              )}
              <button ref={closeButton} className="rpg-button" onClick={onClose}>Cerrar (Esc)</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#e9e2d0] p-3 text-black">
            {error && <p role="alert" className="p-4">{error}</p>}
            {!error && !file && <p className="p-4">Abriendo el libro…</p>}
            {file && (
              <Document file={file} options={OPTIONS} suspense={false} loading={<p className="p-4">Preparando páginas…</p>}
                error={<p role="alert" className="p-4">No se pudo leer el PDF.</p>}
                onLoadSuccess={({ numPages }) => { setPages(numPages); setPage(1) }}
                onLoadError={() => setError('No se pudo leer el PDF.')}>
                <Page pageNumber={clampPage(page, pages || 1)} width={width} suspense={false} renderAnnotationLayer={false} renderTextLayer />
              </Document>
            )}
          </div>
        </div>

        {/* The cover: swings open on its left edge, then gets out of the way. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ transformOrigin: 'left center', transformStyle: 'preserve-3d' }}
          initial={{ rotateY: 0, opacity: 1 }}
          animate={{ rotateY: -168, opacity: [1, 1, 0] }}
          transition={{ duration: swing, ease: 'easeInOut', opacity: { duration: swing, times: [0, 0.85, 1] } }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center"
            style={{ background: spineColor, border: '6px solid #e0b04a', backfaceVisibility: 'hidden' }}>
            <span className="text-4xl" style={{ color: '#f4e9d0', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>{title}</span>
            <span style={{ color: '#e0b04a' }}>✠</span>
          </div>
          <div className="absolute inset-0" style={{ background: '#d9cba3', transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }} />
        </motion.div>
      </div>
    </div>,
    document.body,
  )
}
