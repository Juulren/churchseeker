import { useState, type FormEvent } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import { EVENT_KINDS, type EventItem } from '../../../services/adminTypes.ts'
import { emptyToNull, MONTHS, monthGrid, monthRange, todayIso } from '../format.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import { Check, Modal, Notice, SelectInput, TextArea, TextInput } from '../ui.tsx'

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function EventForm({ event, date, canEdit, onDone, onClose }: { event: EventItem | null; date: string; canEdit: boolean; onDone: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [d, setD] = useState(event?.date ?? date)
  const [time, setTime] = useState(event?.time.slice(0, 5) ?? '10:00')
  const [location, setLocation] = useState(event?.location ?? '')
  const [kind, setKind] = useState(String(event?.kind ?? 1))
  const [isPublic, setPublic] = useState(event?.isPublic ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await work(); onDone() } catch (x) { setError(messageOf(x)) } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !location.trim()) { setError('Título y lugar son obligatorios.'); return }
    const input = { title: title.trim(), description: emptyToNull(description), date: d, time: `${time}:00`, location: location.trim(), kind: Number(kind), isPublic, responsibleMemberId: event?.responsibleMemberId ?? null, ministryId: event?.ministryId ?? null }
    void run(() => (event ? adminApi.events.update(event.id, input) : adminApi.events.create(input)))
  }

  return (
    <Modal title={event ? (canEdit ? 'Editar evento' : 'Evento') : 'Nuevo evento'} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <fieldset disabled={!canEdit || busy} className="grid gap-3 border-0 p-0">
          <div className="form-grid">
            <TextInput label="Título" value={title} onChange={setTitle} maxLength={200} />
            <TextInput label="Lugar" value={location} onChange={setLocation} maxLength={200} />
            <TextInput label="Fecha" type="date" value={d} onChange={setD} />
            <TextInput label="Hora" type="time" value={time} onChange={setTime} />
            <SelectInput label="Tipo" value={kind} onChange={setKind} options={[1, 2].map((k) => ({ value: String(k), label: EVENT_KINDS[k] }))} />
          </div>
          <TextArea label="Descripción" value={description} onChange={setDescription} />
          <Check label="Visible en el calendario público" checked={isPublic} onChange={setPublic} />
        </fieldset>
        {event?.isCancelled && <Notice>Este evento está cancelado.</Notice>}
        {error && <Notice>{error}</Notice>}
        <div className="modal-actions">
          {event && canEdit && (event.isCancelled
            ? <button type="button" className="rpg-button" disabled={busy} onClick={() => run(() => adminApi.events.restore(event.id))}>Restaurar</button>
            : <button type="button" className="rpg-button" disabled={busy} onClick={() => run(() => adminApi.events.cancel(event.id))}>Cancelar evento</button>)}
          <button type="button" className="rpg-button" onClick={onClose}>Cerrar</button>
          {canEdit && <button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>}
        </div>
      </form>
    </Modal>
  )
}

export default function EventsPage({ canEdit }: { canEdit: boolean }) {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [editing, setEditing] = useState<{ event: EventItem | null; date: string } | null>(null)
  const range = monthRange(year, month)
  const list = useAsync(() => adminApi.events.list({ ...range, pageSize: 200 }), [year, month])
  const grid = monthGrid(year, month)
  const today = todayIso()
  const shift = (delta: number) => { const d = new Date(year, month + delta, 1); setYear(d.getFullYear()); setMonth(d.getMonth()) }
  const byDay = new Map<string, EventItem[]>()
  for (const e of list.data?.items ?? []) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])

  return (
    <div>
      <div className="toolbar">
        <button className="rpg-button" onClick={() => shift(-1)} aria-label="Mes anterior">‹</button>
        <strong className="text-xl" style={{ minWidth: 190, textAlign: 'center' }} aria-live="polite">{MONTHS[month]} {year}</strong>
        <button className="rpg-button" onClick={() => shift(1)} aria-label="Mes siguiente">›</button>
        {canEdit && <button className="rpg-button btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setEditing({ event: null, date: today })}>Nuevo evento</button>}
      </div>
      {list.error && <Notice>{list.error}</Notice>}
      <div className="cal" role="grid" aria-label={`Calendario de ${MONTHS[month]} ${year}`}>
        {DAYS.map((d) => <div key={d} className="cal-head" role="columnheader">{d}</div>)}
        {grid.flat().map((c) => (
          <div key={c.iso} className="cal-cell" role="gridcell" data-out={!c.inMonth} data-today={c.iso === today}>
            <span className="muted">{c.day}</span>
            {(byDay.get(c.iso) ?? []).map((e) => (
              <button key={e.id} className="cal-event" data-cancelled={e.isCancelled} onClick={() => setEditing({ event: e, date: e.date })}
                title={`${e.time.slice(0, 5)} ${e.title}`}>{e.time.slice(0, 5)} {e.title}</button>
            ))}
          </div>
        ))}
      </div>
      {editing && <EventForm event={editing.event} date={editing.date} canEdit={canEdit} onClose={() => setEditing(null)} onDone={() => { setEditing(null); list.reload() }} />}
    </div>
  )
}
