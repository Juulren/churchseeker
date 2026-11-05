import { adminApi } from '../../../services/adminApi.ts'
import { authApi, session } from '../../../services/auth.ts'
import { navigate } from '../../../state/route.ts'
import { Empty } from '../../ornament/Illustrations.tsx'
import { formatMoney as money } from '../format.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import { Loading, Notice, StatusPill } from '../ui.tsx'
import { useState } from 'react'

/** The general dashboard (platform account only): every church side by side, and a way into each one's own dashboard. */
export default function PlatformPage() {
  const overview = useAsync(() => adminApi.platform.overview(), [])
  const [error, setError] = useState<string | null>(null)
  const [entering, setEntering] = useState<string | null>(null)

  // Entering a church moves the session there (the server checks it) and opens that church's own dashboard.
  const enter = async (churchId: string) => {
    setError(null); setEntering(churchId)
    try {
      if (session.get()?.churchId !== churchId) await authApi.switchChurch(churchId)
      navigate('#/admin/dashboard')
    } catch (x) { setError(messageOf(x)) } finally { setEntering(null) }
  }

  if (overview.loading && !overview.data) return <Loading />
  if (overview.error) return <Notice>{overview.error}</Notice>
  const data = overview.data
  if (!data || data.churches.length === 0) return <Empty>Todavía no hay iglesias registradas.</Empty>

  return (
    <div className="grid gap-5">
      <p className="muted">Todas las iglesias en un vistazo. Cada una tiene su propio panel: entra en la que quieras administrar.</p>
      {error && <Notice>{error}</Notice>}
      <section aria-label="Totales de todas las iglesias" className="kpis">
        <div className="kpi"><span className="rpg-label">Miembros activos</span><strong>{data.totalMembers}</strong></div>
        <div className="kpi"><span className="rpg-label">Eventos (30 días)</span><strong>{data.totalUpcomingEvents}</strong></div>
        <div className="kpi"><span className="rpg-label">Asistencias del mes</span><strong>{data.totalAttendancesThisMonth}</strong></div>
        <div className="kpi"><span className="rpg-label">Ministerios</span><strong>{data.totalMinistries}</strong></div>
        <div className="kpi"><span className="rpg-label">Ingresos del mes</span><strong>{money(data.totalIncomeThisMonth)}</strong></div>
        <div className="kpi"><span className="rpg-label">Ingresos del año</span><strong>{money(data.totalIncomeThisYear)}</strong></div>
      </section>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Resumen por iglesia</caption>
          <thead>
            <tr><th>Iglesia</th><th>Miembros</th><th>Eventos</th><th>Asistencias</th><th>Ministerios</th><th>Administradores</th><th>Ingresos del mes</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr>
          </thead>
          <tbody>
            {data.churches.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.activeMembers}</td>
                <td>{c.upcomingEvents}</td>
                <td>{c.attendancesThisMonth}</td>
                <td>{c.activeMinistries}</td>
                <td>{c.administrators}</td>
                <td>{money(c.incomeThisMonth)}</td>
                <td><StatusPill active={c.isActive} on="Activa" off="Inactiva" /></td>
                <td>
                  <button className="rpg-button" disabled={!c.isActive || entering !== null} aria-label={`Entrar en ${c.name}`} onClick={() => { void enter(c.id) }}>
                    {entering === c.id ? 'Entrando…' : 'Entrar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
