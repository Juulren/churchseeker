import { adminApi } from '../../../services/adminApi.ts'
import { addDays, formatMoney, MONTHS, todayIso } from '../format.ts'
import { useAsync } from '../useAsync.ts'
import { BarChart, Loading, Notice, Odometer } from '../ui.tsx'
import { Empty, OrnamentStrip } from '../../ornament/Illustrations.tsx'

export default function DashboardPage() {
  const { data, error, loading } = useAsync(() => adminApi.dashboard(), [])
  // Cancelled events still come back from the API, so ask for more than the six shown: otherwise a few cancelled ones could fill the page and hide every real event.
  const upcoming = useAsync(() => adminApi.events.list({ from: todayIso(), to: addDays(todayIso(), 30), pageSize: 30 }), [])
  const notices = useAsync(() => adminApi.announcements.list({ pageSize: 30 }), [])
  // One list for the section and for its empty message, so an expired or not yet published notice never leaves a blank section.
  const today = todayIso()
  const shownNotices = (notices.data?.items ?? []).filter((a) => a.isImportant && a.publishDate <= today && (!a.expiresOn || a.expiresOn >= today)).slice(0, 5)
  if (loading && !data) return <Loading />
  if (error || !data) return <Notice>{error ?? 'Sin datos.'}</Notice>
  const { kpis, attendanceByWeek, income } = data
  const cards: [string, number][] = [
    ['Miembros activos', kpis.activeMembers], ['Eventos próximos (30 días)', kpis.upcomingEvents],
    ['Asistencias del mes', kpis.attendancesThisMonth], ['Ministerios activos', kpis.activeMinistries],
  ]
  return (
    <div className="grid gap-6">
      <OrnamentStrip />
      <div className="kpis">{cards.map(([label, value]) => <div key={label} className="kpi"><span className="rpg-label">{label}</span><Odometer value={value} /></div>)}</div>
      <section>
        <h3 className="rpg-title text-xl">Asistencia por semana</h3>
        {attendanceByWeek.length === 0
          ? <Empty>Aún no hay asistencia registrada en las últimas 8 semanas.</Empty>
          : <BarChart title="Presentes por semana (inicio de semana)" labels={attendanceByWeek.map((r) => r.periodStart.slice(5))} values={attendanceByWeek.map((r) => r.present)} />}
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-label="Próximos eventos">
          <h3 className="rpg-title text-xl">Próximos eventos</h3>
          <ul className="grid gap-1">
            {upcoming.data?.items.filter((e) => !e.isCancelled).slice(0, 6).map((e) => <li key={e.id}><span className="muted">{e.date} · {e.time.slice(0, 5)}</span> {e.title}</li>)}
            {upcoming.data && upcoming.data.items.filter((e) => !e.isCancelled).length === 0 && <li className="muted">No hay eventos en los próximos 30 días.</li>}
          </ul>
        </section>
        <section aria-label="Avisos importantes">
          <h3 className="rpg-title text-xl">Avisos importantes</h3>
          <ul className="grid gap-1">
            {shownNotices.map((a) => <li key={a.id}>◈ {a.title}</li>)}
            {notices.data && shownNotices.length === 0 && <li className="muted">No hay avisos importantes.</li>}
          </ul>
        </section>
      </div>
      {/* The server only sends `income` to Tesorero and Administrador: for everybody else this section does not exist. */}
      {income && (
        <section aria-label="Ingresos">
          <h3 className="rpg-title text-xl">Ingresos {income.year}</h3>
          <div className="kpis">
            <div className="kpi"><span className="rpg-label">Este mes</span><Odometer value={income.monthToDate} format={formatMoney} /></div>
            <div className="kpi"><span className="rpg-label">En el año</span><Odometer value={income.yearToDate} format={formatMoney} /></div>
          </div>
          <BarChart title="Ingresos por mes" labels={income.monthly.map((m) => MONTHS[m.month - 1].slice(0, 3))} values={income.monthly.map((m) => m.total)} format={formatMoney} />
        </section>
      )}
    </div>
  )
}
