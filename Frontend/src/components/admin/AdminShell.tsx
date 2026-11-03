import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { authApi, session } from '../../services/auth.ts'
import { allowedNav } from './nav.ts'
import { Loading } from './ui.tsx'
import { decodeOnce, useKit } from '../ascii/useKit.ts'
import { ToastHost } from '../ascii/toast.tsx'
import CommandPalette from './CommandPalette.tsx'

const Dashboard = lazy(() => import('./pages/DashboardPage.tsx'))
const Members = lazy(() => import('./pages/MembersPage.tsx'))
const Events = lazy(() => import('./pages/EventsPage.tsx'))
const Attendance = lazy(() => import('./pages/AttendancePage.tsx'))
const Ministries = lazy(() => import('./pages/MinistriesPage.tsx'))
const Donations = lazy(() => import('./pages/DonationsPage.tsx'))
const Announcements = lazy(() => import('./pages/AnnouncementsPage.tsx'))
const Reports = lazy(() => import('./pages/ReportsPage.tsx'))
const Users = lazy(() => import('./pages/UsersPage.tsx'))
const Settings = lazy(() => import('./pages/SettingsPage.tsx'))
import { navigate, parseRoute, useHash } from '../../state/route.ts'

/** Protected layout: only for signed-in staff, with a menu limited to what the role may use. */
export default function AdminShell() {
  const user = useSyncExternalStore(session.subscribe, session.get, () => null)
  const route = parseRoute(useHash())
  const title = useRef<HTMLHeadingElement>(null)
  const menu = useRef<HTMLElement>(null)
  const main = useRef<HTMLElement>(null)
  const dissolve = useRef<{ swap: (render: () => void, origin?: HTMLElement | null) => Promise<void> } | null>(null)
  const clicked = useRef<HTMLElement | null>(null)
  const current = route.path[1] ?? 'dashboard'
  // The module on screen. It trails the route while the old one breaks up and the new one condenses in.
  const [shown, setShown] = useState(current)
  const swapping = useRef(false)
  const latest = useRef(current)
  latest.current = current
  // The module name condenses out of characters when you open it; the real text stays in the DOM.
  useKit(title, (kit, el) => decodeOnce(kit, el, 700), [shown])
  // A wave of characters from the clicked link carries the old module out and the next one in. Without the kit,
  // WebGL or with reduced motion the module simply changes.
  useKit(main, (kit, el) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null
    const handle = kit.pageDissolve(el, { dissolve: 260, condense: 260 })
    dissolve.current = handle
    return { destroy: () => { dissolve.current = null; handle.destroy() } }
  }, [])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (shown === current) { clicked.current = null; return }
    // A swap in flight renders the latest route itself; when it ends, the effect runs again for any later click.
    if (swapping.current) return
    const plain = () => setShown(latest.current)
    const dissolving = dissolve.current
    if (!dissolving) { clicked.current = null; plain(); return }
    swapping.current = true
    const origin = clicked.current?.isConnected ? clicked.current : null
    clicked.current = null
    const change = () => { flushSync(() => setShown(latest.current)); main.current?.scrollTo?.(0, 0) }
    dissolving.swap(change, origin)
      .catch(() => { try { plain() } catch { /* the module changes on the next render */ } })
      .finally(() => { swapping.current = false; setTick((n) => n + 1) })
  }, [current, shown, tick])
  // The menu links are real links with real text; on hover a scramble of letters plays over them and settles back.
  useKit(menu, (kit, nav) => {
    const links = [...nav.querySelectorAll<HTMLElement>('a')]
    const handles = links.map((a) => ({ a, h: kit.decode(a, { scramble: true, trigger: 'manual', replayOnHover: false, settle: 'text', duration: 600, look: { cellSize: 3 } }) }))
    const play = (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse') handles.find((x) => x.a === e.currentTarget)?.h.replay() }
    // Pointer only: replaying on keyboard focus would rewrite the link text just as a screen reader reads its name.
    for (const { a } of handles) a.addEventListener('pointerenter', play)
    return { destroy: () => { for (const { a, h } of handles) { a.removeEventListener('pointerenter', play); h.destroy() } } }
  }, [user?.role])
  if (!user) return null
  const items = allowedNav(user.role)
  const active = items.find((i) => i.path === shown)
  const management = user.role === 'Administrador' || user.role === 'Pastor' || user.role === 'Secretario'

  return (
    <div className="flex h-full flex-col gap-3 p-3 md:flex-row">
      <aside className="rpg-panel flex shrink-0 flex-col gap-3 p-4 md:w-60">
        <div>
          <h1 className="text-xl">ChurchSeeker</h1>
          <p className="rpg-label mt-1">{user.role}</p>
          <p className="mt-2 truncate text-sm" title={user.email}>{user.fullName}</p>
        </div>
        <nav ref={menu} aria-label="Módulos" className="flex gap-2 overflow-x-auto md:flex-col">
          {items.map((i) => (
            <a key={i.path} href={`#/admin/${i.path}`} onClick={(e) => { if (i.path !== current) clicked.current = e.currentTarget }} className="rpg-button whitespace-nowrap text-center"
              aria-current={i.path === current ? 'page' : undefined}>{i.label}</a>
          ))}
        </nav>
        <div className="mt-auto flex gap-2 md:flex-col">
          <CommandPalette items={items} />
          <a href="#/" className="rpg-button text-center">Ver sitio público</a>
          <button className="rpg-button" onClick={async () => { await authApi.logout(); navigate('#/login') }}>Cerrar sesión</button>
        </div>
      </aside>
      <main ref={main} className="rpg-panel min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
        {active ? <h2 ref={title} className="rpg-title mb-4">{active.label}</h2> : <p role="alert">No tienes acceso a este módulo.</p>}
        {active && (
          <Suspense fallback={<Loading />}>
            {active.path === 'dashboard' && <Dashboard />}
            {active.path === 'members' && <Members />}
            {active.path === 'events' && <Events canEdit={management} />}
            {active.path === 'attendance' && <Attendance />}
            {active.path === 'ministries' && <Ministries isManagement={management} />}
            {active.path === 'donations' && <Donations />}
            {active.path === 'announcements' && <Announcements canEdit={management} />}
            {active.path === 'reports' && <Reports role={user.role} />}
            {active.path === 'users' && <Users />}
            {active.path === 'settings' && <Settings />}
          </Suspense>
        )}
      </main>
      <ToastHost />
    </div>
  )
}
