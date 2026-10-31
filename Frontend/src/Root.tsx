import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { PublicApp } from './App.tsx'
import AsciiBackground from './components/ascii/AsciiBackground.tsx'
import { authApi, session } from './services/auth.ts'
import { navigate, parseRoute, useHash } from './state/route.ts'

// The staff area loads on demand: visitors of the public map never download it.
const SignIn = lazy(() => import('./components/auth/SignIn.tsx'))
const ResetPassword = lazy(() => import('./components/auth/ResetPassword.tsx'))
const AdminShell = lazy(() => import('./components/admin/AdminShell.tsx'))

export default function Root() {
  const route = parseRoute(useHash())
  const user = useSyncExternalStore(session.subscribe, session.get, () => null)
  const [restored, setRestored] = useState(false)

  // One attempt to resume the session from the refresh cookie when the page loads.
  useEffect(() => { authApi.restore().finally(() => setRestored(true)) }, [])

  // Guard: staff pages need a session, the sign-in page skips ahead when there already is one.
  useEffect(() => {
    if (!restored) return
    if (route.name === 'admin' && !user) navigate('#/login')
    if (route.name === 'login' && user) navigate('#/admin')
  }, [restored, route.name, user])

  if (route.name === 'home') return <PublicApp />
  if ((route.name === 'admin' || route.name === 'login') && !restored) return <p role="status" className="p-6">Cargando…</p>

  return (
    <Suspense fallback={<p role="status" className="p-6">Cargando…</p>}>
      {route.name === 'login' && !user && <SignIn />}
      {route.name === 'reset' && <ResetPassword email={route.params.get('email') ?? ''} token={route.params.get('token') ?? ''} />}
      {route.name === 'admin' && user && (
        <>
          <AsciiBackground />
          <AdminShell />
        </>
      )}
    </Suspense>
  )
}
