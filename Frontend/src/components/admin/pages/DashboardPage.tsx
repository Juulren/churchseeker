import { adminApi } from '../../../services/adminApi.ts'
import { formatMoney, MONTHS } from '../format.ts'
import { useAsync } from '../useAsync.ts'
import { BarChart, Notice } from '../ui.tsx'

export default function DashboardPage() {
  const { data, error, loading } = useAsync(() => adminApi.dashboard(), [])
  if (loading && !data) return <p role="status" className="muted">Cargando…</p>
  if (error || !data) return <Notice>{error ?? 'Sin datos.'}</Notice>
  const { kpis, attendanceByWeek, income } = data
  const cards: [string, number][] = [
    ['Miembros activos', kpis.activeMembers], ['Eventos próximos (30 días)', kpis.upcomingEvents],
    ['Asistencias del mes', kpis.attendancesThisMonth], ['Ministerios activos', kpis.activeMinistries],
  ]
  return (
    <div className="grid gap-6">
      <div className="kpis">{cards.map(([label, value]) => <div key={label} className="kpi"><span className="rpg-label">{label}</span><strong>{value}</strong></div>)}</div>
      <section>
        <h3 className="rpg-title text-xl">Asistencia por semana</h3>
        {attendanceByWeek.length === 0
          ? <p className="muted">Aún no hay asistencia registrada en las últimas 8 semanas.</p>
          : <BarChart title="Presentes por semana (inicio de semana)" labels={attendanceByWeek.map((r) => r.periodStart.slice(5))} values={attendanceByWeek.map((r) => r.present)} />}
      </section>
      {/* The server only sends `income` to Tesorero and Administrador: for everybody else this section does not exist. */}
      {income && (
        <section aria-label="Ingresos">
          <h3 className="rpg-title text-xl">Ingresos {income.year}</h3>
          <div className="kpis">
            <div className="kpi"><span className="rpg-label">Este mes</span><strong>{formatMoney(income.monthToDate)}</strong></div>
            <div className="kpi"><span className="rpg-label">En el año</span><strong>{formatMoney(income.yearToDate)}</strong></div>
          </div>
          <BarChart title="Ingresos por mes" labels={income.monthly.map((m) => MONTHS[m.month - 1].slice(0, 3))} values={income.monthly.map((m) => m.total)} format={formatMoney} />
        </section>
      )}
    </div>
  )
}
