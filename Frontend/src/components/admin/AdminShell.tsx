import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { authApi, effectiveRole, isStaff, session } from '../../services/auth.ts'
import { allowedNav } from './nav.ts'
import { Loading, Notice } from './ui.tsx'
import { messageOf } from './useAsync.ts'
import { decodeOnce, useKit } from '../ascii/useKit.ts'
import { ToastHost } from '../ascii/toast.tsx'
import CommandPalette from './CommandPalette.tsx'
import Ornament from '../ornament/Ornament.tsx'

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
const Platform = lazy(() => import('./pages/PlatformPage.tsx'))
const Access = lazy(() => import('./pages/AccessPage.tsx'))
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
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
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
  // The platform account acts as an Administrador inside the church it is working in.
  const acting = effectiveRole(user.role)
  const management = acting === 'Administrador' || acting === 'Pastor' || acting === 'Secretario'
  const activeChurch = user.churches.find((c) => c.id === user.churchId)?.name
  const staff = isStaff(user.role)

  // Moving to another church: the server issues a new token for it, and every module below starts again from that church.
  const changeChurch = async (churchId: string) => {
    setSwitchError(null); setSwitching(true)
    try { await authApi.switchChurch(churchId); navigate('#/admin/dashboard') } catch (x) { setSwitchError(messageOf(x)) } finally { setSwitching(false) }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3 md:flex-row">
      <aside className="rpg-panel flex shrink-0 flex-col gap-3 p-4 md:w-60">
        <div>
          <h1 className="text-xl">ChurchSeeker</h1>
          <p className="rpg-label mt-1">{user.role}</p>
          <p className="mt-2 truncate text-sm" title={user.email}>{user.fullName}</p>
        </div>
        {staff && user.churches.length > 0 && (
          <div className="form-field">
            {user.churches.length > 1
              ? <>
                <label htmlFor="active-church" className="rpg-label">Iglesia activa</label>
                <select id="active-church" className="input" value={user.churchId} disabled={switching} onChange={(e) => { void changeChurch(e.target.value) }}>
                  {user.churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
              : <>
                <span id="active-church-label" className="rpg-label">Iglesia activa</span>
                <p aria-labelledby="active-church-label" className="text-sm">{activeChurch ?? '—'}</p>
              </>}
            {switchError && <Notice>{switchError}</Notice>}
          </div>
        )}
        <nav ref={menu} aria-label="Módulos" className="flex gap-2 overflow-x-auto md:flex-col">
          {items.map((i) => (
            <a key={i.path} href={`#/admin/${i.path}`} onClick={(e) => { if (i.path !== current) clicked.current = e.currentTarget }} className="rpg-button whitespace-nowrap text-center"
              aria-current={i.path === current ? 'page' : undefined}>{i.label}</a>
          ))}
        </nav>
        <div className="mt-auto flex gap-2 md:flex-col">
          {staff && <CommandPalette items={items} />}
          <a href="#/" className="rpg-button text-center">Ver sitio público</a>
          <button className="rpg-button" onClick={async () => { await authApi.logout(); navigate('#/login') }}>Cerrar sesión</button>
        </div>
      </aside>
      <main ref={main} className="rpg-panel min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
        {!staff && (
          <section aria-labelledby="account-title">
            <h2 id="account-title" className="rpg-title">Tu cuenta</h2>
            <p className="mt-3">Esta cuenta no tiene permisos de administración. Puedes explorar el sitio público: el mapa, la historia y los eventos de cada iglesia.</p>
            <p className="mt-4"><a href="#/" className="rpg-button" style={{ display: 'inline-block', textDecoration: 'none' }}>Ir al sitio público</a></p>
          </section>
        )}
        {staff && (active ? <><h2 ref={title} className="rpg-title">{active.label}</h2><div className="mb-4 mt-1" aria-hidden="true"><Ornament name="divider" size={150} /></div></> : <p role="alert">No tienes acceso a este módulo.</p>)}
        {staff && active && (
          <Suspense key={user.churchId} fallback={<Loading />}>
            {active.path === 'dashboard' && <Dashboard />}
            {active.path === 'members' && <Members />}
            {active.path === 'events' && <Events canEdit={management} />}
            {active.path === 'attendance' && <Attendance />}
            {active.path === 'ministries' && <Ministries isManagement={management} />}
            {active.path === 'donations' && <Donations />}
            {active.path === 'announcements' && <Announcements canEdit={management} />}
            {active.path === 'reports' && <Reports role={acting} />}
            {active.path === 'users' && <Users />}
            {active.path === 'settings' && <Settings />}
            {active.path === 'platform' && <Platform />}
            {active.path === 'access' && <Access />}
          </Suspense>
        )}
      </main>
      <ToastHost />
    </div>
  )
}
