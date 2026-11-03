import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useKit } from '../ascii/useKit.ts'
import { navigate } from '../../state/route.ts'
import type { NavItem } from './nav.ts'

/** Ctrl+K: jump to any module the role may open. Rows exist only while it is open, so they never clutter the page. */
export default function CommandPalette({ items }: { items: NavItem[] }) {
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rows = items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()))
  useKit(panel, (kit, el) => kit.commandPalette(el, {
    trigger: trigger.current,
    onOpenChange: (o) => { setOpen(o); if (!o) setQ('') },
    onRun: (_i, row) => { if (row.dataset.path) navigate('#/admin/' + row.dataset.path) },
  }))
  return (
    <>
      <button ref={trigger} type="button" className="rpg-button" aria-label="Buscar módulo (Ctrl+K)">Buscar · Ctrl+K</button>
      {createPortal(
      <div ref={panel} hidden className="rpg-panel palette" role="dialog" aria-label="Ir a un módulo">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar módulo" placeholder="Ir a…" />
        <ul role="listbox" aria-label="Módulos">
          {open && rows.map((i) => <li key={i.path} role="option" id={'pal-' + i.path} data-path={i.path} aria-selected="false">{i.label}</li>)}
        </ul>
      </div>, document.body)}
    </>
  )
}
