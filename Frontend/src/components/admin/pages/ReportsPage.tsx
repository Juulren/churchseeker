import { useState } from 'react'
import { adminApi, saveBlob } from '../../../services/adminApi.ts'
import type { Role } from '../../../services/auth.ts'
import { addDays, todayIso } from '../format.ts'
import { messageOf } from '../useAsync.ts'
import { Notice, SelectInput, TextInput } from '../ui.tsx'

type Kind = 'members' | 'attendance' | 'ministries' | 'income'

export default function ReportsPage({ role }: { role: Role }) {
  const [format, setFormat] = useState('Pdf')
  const [from, setFrom] = useState(addDays(todayIso(), -30))
  const [to, setTo] = useState(todayIso())
  const [active, setActive] = useState('')
  const [busy, setBusy] = useState<Kind | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const finance = role === 'Tesorero' || role === 'Administrador'
  const management = role === 'Administrador' || role === 'Pastor' || role === 'Secretario'
  const reports: { kind: Kind; title: string; text: string; allowed: boolean; needsRange?: boolean }[] = [
    { kind: 'members', title: 'Miembros', text: 'Listado con contacto y estado.', allowed: management },
    { kind: 'attendance', title: 'Asistencia por evento', text: 'Presentes y ausentes por evento en un rango.', allowed: management, needsRange: true },
    { kind: 'ministries', title: 'Participación por ministerio', text: 'Integrantes y actividades de los próximos 90 días.', allowed: management },
    { kind: 'income', title: 'Ingresos por periodo', text: 'Totales por mes, sin nombres de donantes.', allowed: finance, needsRange: true },
  ]

  const run = async (kind: Kind, needsRange?: boolean) => {
    setBusy(kind); setMessage(null)
    try {
      const { blob, name } = await adminApi.reports.download(kind, { format, from: needsRange ? from : undefined, to: needsRange ? to : undefined, active: kind === 'members' ? active : undefined })
      saveBlob(blob, name)
      setMessage({ kind: 'ok', text: `Reporte generado: ${name}` })
    } catch (x) { setMessage({ kind: 'error', text: messageOf(x) }) } finally { setBusy(null) }
  }

  return (
    <div className="grid gap-5">
      <div className="toolbar">
        <div style={{ width: 150 }}><SelectInput label="Formato" value={format} onChange={setFormat} options={[{ value: 'Pdf', label: 'PDF' }, { value: 'Xlsx', label: 'Excel (.xlsx)' }]} /></div>
        <div style={{ width: 170 }}><TextInput label="Desde" type="date" value={from} onChange={setFrom} /></div>
        <div style={{ width: 170 }}><TextInput label="Hasta" type="date" value={to} onChange={setTo} /></div>
        <div style={{ width: 170 }}><SelectInput label="Miembros" value={active} onChange={setActive} options={[{ value: '', label: 'Todos' }, { value: 'true', label: 'Solo activos' }, { value: 'false', label: 'Solo inactivos' }]} /></div>
      </div>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <div className="kpis">
        {reports.filter((r) => r.allowed).map((r) => (
          <div key={r.kind} className="kpi grid gap-2">
            <strong style={{ fontSize: '1.4rem' }}>{r.title}</strong>
            <span className="muted">{r.text}</span>
            <button className="rpg-button btn-primary" disabled={busy !== null} onClick={() => run(r.kind, r.needsRange)}>{busy === r.kind ? 'Generando…' : 'Descargar'}</button>
          </div>
        ))}
      </div>
      <p className="muted">Los reportes se limitan a unas pocas descargas por minuto.</p>
    </div>
  )
}
