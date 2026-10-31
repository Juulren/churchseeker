import { useSyncExternalStore } from 'react'
import { authApi, session } from '../../services/auth.ts'
import { allowedNav } from './nav.ts'
import { navigate, parseRoute, useHash } from '../../state/route.ts'

/** Protected layout: only for signed-in staff, with a menu limited to what the role may use. */
export default function AdminShell() {
  const user = useSyncExternalStore(session.subscribe, session.get, () => null)
  const route = parseRoute(useHash())
  if (!user) return null
  const items = allowedNav(user.role)
  const current = route.path[1] ?? 'dashboard'
  const active = items.find((i) => i.path === current)

  return (
    <div className="flex h-full flex-col gap-3 p-3 md:flex-row">
      <aside className="rpg-panel flex shrink-0 flex-col gap-3 p-4 md:w-60">
        <div>
          <h1 className="text-xl">ChurchSeeker</h1>
          <p className="rpg-label mt-1">{user.role}</p>
          <p className="mt-2 truncate text-sm" title={user.email}>{user.fullName}</p>
        </div>
        <nav aria-label="Módulos" className="flex gap-2 overflow-x-auto md:flex-col">
          {items.map((i) => (
            <a key={i.path} href={`#/admin/${i.path}`} className="rpg-button whitespace-nowrap text-center" aria-pressed={i.path === current}
              aria-current={i.path === current ? 'page' : undefined}>{i.label}</a>
          ))}
        </nav>
        <div className="mt-auto flex gap-2 md:flex-col">
          <a href="#/" className="rpg-button text-center">Ver sitio público</a>
          <button className="rpg-button" onClick={async () => { await authApi.logout(); navigate('#/login') }}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="rpg-panel min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
        {active ? <h2 className="rpg-title mb-4">{active.label}</h2> : <p role="alert">No tienes acceso a este módulo.</p>}
      </main>
    </div>
  )
}
