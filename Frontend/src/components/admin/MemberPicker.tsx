import { useEffect, useId, useRef, useState } from 'react'
import { adminApi } from '../../services/adminApi.ts'
import type { Member } from '../../services/adminTypes.ts'
import { Labeled } from './ui.tsx'

interface Props {
  label: string
  /** The chosen member's id, or '' for none. */
  value: string
  onChange: (id: string) => void
  /** Text of the empty choice, e.g. "Sin responsable". Without it the field has no "none" option. */
  noneLabel?: string
  /** Members that cannot be picked (already in a list). */
  exclude?: ReadonlySet<string>
  /** Also offer members who are no longer active (a history may belong to one). */
  includeInactive?: boolean
  disabled?: boolean
}

const SHOWN = 12
const SERVER_PAGE = 100
const MAX_PAGES = 5

/**
 * A member field that searches as you type instead of listing everyone: it asks the server for the first matches, so it
 * works the same with ten members or ten thousand. A combobox with a list of options, driven by the arrow keys, Enter and
 * Escape (Escape closes the list first and only then the dialog around it).
 */
export default function MemberPicker({ label, value, onChange, noneLabel, exclude, includeInactive, disabled }: Props) {
  const [chosen, setChosen] = useState<Member | null>(null)
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(0)
  const listId = 'mp-' + useId().replace(/:/g, '')
  const seq = useRef(0)

  // The name of the member already chosen (an event being edited carries only the id).
  useEffect(() => {
    if (!value) { setChosen(null); return }
    if (chosen?.id === value) return
    setChosen(null) // never show the previous member's name while the new one loads (or if it fails to)
    let alive = true
    adminApi.members.get(value).then((m) => { if (alive) setChosen(m) }).catch(() => { /* the field shows empty */ })
    return () => { alive = false }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search as the person types (and the first matches when the list opens), waiting for a pause so it asks once. The
  // server returns at most 100 a page, so members already excluded are skipped by asking for more pages, not a bigger one.
  const query = text.replace(/\p{Cc}/gu, '').trim()
  useEffect(() => {
    if (!open) return
    const mine = ++seq.current
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const found: Member[] = []
        for (let page = 1; page <= MAX_PAGES && found.length < SHOWN; page++) {
          const r = await adminApi.members.list({ search: typing && query ? query : undefined, active: includeInactive ? undefined : true, page, pageSize: SERVER_PAGE })
          if (mine !== seq.current) return
          found.push(...r.items.filter((m) => !exclude?.has(m.id)))
          if (r.items.length < SERVER_PAGE) break
        }
        setResults(found.slice(0, SHOWN)); setFailed(false)
      } catch {
        if (mine === seq.current) { setResults([]); setFailed(true) }
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    }, typing ? 250 : 0)
    return () => clearTimeout(timer)
  }, [open, query, typing]) // eslint-disable-line react-hooks/exhaustive-deps

  const options: Array<{ id: string; name: string }> = [
    ...(noneLabel ? [{ id: '', name: noneLabel }] : []),
    ...results.map((m) => ({ id: m.id, name: m.fullName })),
  ]
  const top = Math.min(active, Math.max(options.length - 1, 0))

  const pick = (opt: { id: string; name: string }) => {
    setChosen(opt.id ? results.find((m) => m.id === opt.id) ?? null : null)
    onChange(opt.id)
    setTyping(false); setText(''); setOpen(false)
  }

  const shown = typing ? text : (chosen?.fullName ?? '')
  const status = loading ? 'Buscando…' : failed ? 'No se pudo buscar. Inténtalo de nuevo.'
    : results.length === 0 ? (typing && query ? 'Nadie coincide con esa búsqueda.' : 'No hay miembros.')
    : `${results.length} ${results.length === 1 ? 'coincidencia' : 'coincidencias'}`

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive(Math.min(top + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(top - 1, 0)) }
    else if (e.key === 'Home' && open) { e.preventDefault(); setActive(0) }
    else if (e.key === 'End' && open) { e.preventDefault(); setActive(Math.max(options.length - 1, 0)) }
    // While the list is still being fetched it belongs to the previous search: it is never picked from.
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (!loading && options[top]) pick(options[top]) }
    // The first Escape only closes the list: the dialog around the field stays open.
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setTyping(false); setText('') }
  }

  return (
    <Labeled label={label}>
      {(id) => (
        <div style={{ position: 'relative' }}>
          <input id={id} className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
            aria-activedescendant={open && !loading && options[top] ? `${listId}-${top}` : undefined} disabled={disabled}
            placeholder={noneLabel ?? 'Escribe para buscar…'} maxLength={100} value={shown}
            onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
            onBlur={() => { setOpen(false); setTyping(false); setText('') }}
            onChange={(e) => { setTyping(true); setText(e.target.value); setActive(0); setOpen(true) }}
            onKeyDown={onKey} />
          {open && (
            <div className="rpg-panel member-picker-list">
              <ul id={listId} role="listbox" aria-label="Coincidencias" className="member-picker-options">
                {options.map((o, i) => (
                  <li key={o.id || 'none'} id={`${listId}-${i}`} role="option" aria-selected={i === top} data-active={i === top || undefined} data-chosen={(o.id !== '' && o.id === value) || undefined}
                    // mousedown, not click: the input would lose focus and close the list before the click lands.
                    onMouseDown={(e) => { e.preventDefault(); pick(o) }} onMouseEnter={() => setActive(i)}>{o.name}</li>
                ))}
              </ul>
              {/* Spoken as it changes, and shown: how many came back, or why there are none. */}
              <div role="status" aria-live="polite" className="member-picker-status muted">{status}</div>
            </div>
          )}
        </div>
      )}
    </Labeled>
  )
}
