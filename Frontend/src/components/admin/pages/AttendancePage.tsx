import { useEffect, useState } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import { addDays, todayIso } from '../format.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import MemberPicker from '../MemberPicker.tsx'
import { Notice, Pager, SelectInput } from '../ui.tsx'
import { Empty } from '../../ornament/Illustrations.tsx'

function MemberHistory() {
  const [member, setMember] = useState('')
  const [page, setPage] = useState(1)
  const history = useAsync(async () => (member ? adminApi.attendance.memberHistory(member, page) : null), [member, page])
  return (
    <section>
      <h3 className="rpg-title text-xl">Historial por miembro</h3>
      <div className="toolbar">
        <div style={{ flex: '1 1 260px' }}>
          <MemberPicker label="Miembro" value={member} onChange={(v) => { setMember(v); setPage(1) }} includeInactive />
        </div>
      </div>
      {history.error && <Notice>{history.error}</Notice>}
      {history.data && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Evento</th><th>Asistencia</th></tr></thead>
              <tbody>
                {history.data.items.map((r) => <tr key={r.eventId}><td>{r.date}</td><td>{r.title}</td><td>{r.present ? 'Presente' : <span className="muted">Ausente</span>}</td></tr>)}
                {history.data.items.length === 0 && <tr><td colSpan={3}><Empty>Sin asistencia registrada.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={10} total={history.data.total} onPage={setPage} />
        </>
      )}
    </section>
  )
}

export default function AttendancePage() {
  const today = todayIso()
  const events = useAsync(() => adminApi.events.list({ from: addDays(today, -120), to: today, pageSize: 200 }), [today])
  const members = useAsync(() => adminApi.members.list({ active: true, pageSize: 100 }), [])
  const [eventId, setEventId] = useState('')
  const [marks, setMarks] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [period, setPeriod] = useState<'Week' | 'Month'>('Week')
  const summary = useAsync(() => adminApi.attendance.summary({ from: addDays(today, -90), to: today, period }), [period, today])

  const options = (events.data?.items ?? []).filter((e) => !e.isCancelled).sort((a, b) => b.date.localeCompare(a.date))
  const selected = useAsync(async () => (eventId ? adminApi.attendance.get(eventId) : null), [eventId])
  useEffect(() => {
    const rows = selected.data?.rows ?? []
    setMarks(Object.fromEntries(rows.map((r) => [r.memberId, r.present])))
  }, [selected.data])

  const people = members.data?.items ?? []
  const save = async () => {
    setBusy(true); setMessage(null)
    try {
      const entries = people.map((m) => ({ memberId: m.id, present: marks[m.id] === true }))
      const result = await adminApi.attendance.record(eventId, entries)
      setMessage({ kind: 'ok', text: `Asistencia guardada: ${result.present} presentes, ${result.absent} ausentes.` })
      selected.reload(); summary.reload()
    } catch (x) { setMessage({ kind: 'error', text: messageOf(x) }) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6">
      <section>
        <div className="toolbar">
          <div style={{ flex: '1 1 280px' }}>
            <SelectInput label="Evento (últimos 120 días)" value={eventId} onChange={(v) => { setEventId(v); setMessage(null) }}
              options={[{ value: '', label: 'Elige un evento…' }, ...options.map((e) => ({ value: e.id, label: `${e.date} · ${e.title}` }))]} />
          </div>
          <button className="rpg-button" disabled={!eventId} onClick={() => setMarks(Object.fromEntries(people.map((m) => [m.id, true])))}>Marcar todos</button>
          <button className="rpg-button" disabled={!eventId} onClick={() => setMarks({})}>Limpiar</button>
          <button className="rpg-button btn-primary" disabled={!eventId || busy || people.length === 0} onClick={save}>{busy ? 'Guardando…' : 'Guardar asistencia'}</button>
        </div>
        {events.error && <Notice>{events.error}</Notice>}
        {members.data && members.data.total > 100 && <Notice>Se muestran los primeros 100 miembros activos.</Notice>}
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        {eventId && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Miembro</th><th>Presente</th></tr></thead>
              <tbody>
                {people.map((m) => (
                  <tr key={m.id}><td>{m.fullName}</td>
                    <td><label className="check"><input type="checkbox" checked={marks[m.id] === true} onChange={(e) => setMarks((s) => ({ ...s, [m.id]: e.target.checked }))} aria-label={`Presente: ${m.fullName}`} /></label></td></tr>
                ))}
                {people.length === 0 && <tr><td colSpan={2}><Empty>No hay miembros activos.</Empty></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <div className="toolbar">
          <h3 className="rpg-title text-xl" style={{ flex: 1, margin: 0 }}>Resumen (últimos 90 días)</h3>
          <div style={{ width: 150 }}><SelectInput label="Periodo" value={period} onChange={(v) => setPeriod(v as 'Week' | 'Month')} options={[{ value: 'Week', label: 'Semanal' }, { value: 'Month', label: 'Mensual' }]} /></div>
        </div>
        {summary.error && <Notice>{summary.error}</Notice>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Inicio</th><th className="num">Eventos</th><th className="num">Presentes</th><th className="num">Ausentes</th><th className="num">Miembros distintos</th></tr></thead>
            <tbody>
              {summary.data?.map((r) => <tr key={r.periodStart}><td>{r.periodStart}</td><td className="num">{r.events}</td><td className="num">{r.present}</td><td className="num">{r.absent}</td><td className="num">{r.distinctMembersPresent}</td></tr>)}
              {summary.data?.length === 0 && <tr><td colSpan={5}><Empty>Sin datos en el periodo.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <MemberHistory />
    </div>
  )
}
