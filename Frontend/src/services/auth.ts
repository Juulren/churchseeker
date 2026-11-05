import { ApiError, exclusive, onSessionChange, request, requestOnce, setAccessToken } from './api.ts'

export type Role = 'Administrador' | 'Pastor' | 'Secretario' | 'Tesorero' | 'Coordinador' | 'SuperAdministrador' | 'Usuario'

/** A church the account may work in. */
export interface ChurchRef { id: string; name: string }

export interface SessionUser {
  id: string
  email: string
  fullName: string
  role: Role
  /** The ACTIVE church: the one the session works in now. */
  churchId: string
  /** Every church the account may switch to (all of them for the platform account). */
  churches: ChurchRef[]
}

/** The role to authorise with: the platform account acts as an Administrador inside the church it works in. */
export const effectiveRole = (role: Role): Role => (role === 'SuperAdministrador' ? 'Administrador' : role)

/** Staff may open the administration panel; a plain Usuario may not. */
export const isStaff = (role: Role) => role !== 'Usuario'

interface AuthResponse { accessToken: string; expiresAt: string; user: SessionUser }

const ROLES: Role[] = ['Administrador', 'Pastor', 'Secretario', 'Tesorero', 'Coordinador', 'SuperAdministrador', 'Usuario']
// The API serialises the enum as a number (1..7) or a name depending on configuration: accept both.
const roleOf = (value: unknown): Role | null =>
  typeof value === 'number' ? ROLES[value - 1] ?? null : ROLES.includes(value as Role) ? (value as Role) : null

function userOf(body: AuthResponse): SessionUser {
  const role = roleOf(body.user?.role)
  if (!body.accessToken || !role) throw new ApiError(502, 'Respuesta inesperada del servidor.')
  return { ...body.user, role, churches: Array.isArray(body.user.churches) ? body.user.churches : [] }
}

type Listener = () => void
let current: SessionUser | null = null
const listeners = new Set<Listener>()
const set = (u: SessionUser | null) => { current = u; listeners.forEach((l) => l()) }

export const session = {
  get: () => current,
  subscribe: (l: Listener) => { listeners.add(l); return () => { listeners.delete(l) } },
}

// A background refresh may change who and where the session is (the church falls back to the home church when the account
// lost its access to the active one), and may end it: the screen follows either.
onSessionChange({
  refreshed: (body) => { try { set(userOf(body as AuthResponse)) } catch { /* keep what is shown */ } },
  lost: () => set(null),
})

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Spanish, user-facing messages. The API deliberately gives the same answer for every login failure. */
export function loginMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Correo o contraseña incorrectos.'
    if (e.status === 429) return 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.'
    if (e.status === 0) return e.message
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.'
}

export const authApi = {
  async login(email: string, password: string): Promise<SessionUser> {
    const res = await request('/api/auth/login', json({ email, password }), false)
    const body = (await res.json()) as AuthResponse
    const user = userOf(body)
    setAccessToken(body.accessToken)
    set(user)
    return user
  },

  /** Moves the session to another church the account may use. The server checks it and rotates the refresh cookie. */
  async switchChurch(churchId: string): Promise<SessionUser> {
    // Never overlaps a refresh or another switch: they all rotate the same cookie.
    return exclusive(async () => {
      const res = await requestOnce('/api/auth/church', json({ churchId }))
      const body = (await res.json()) as AuthResponse
      const user = userOf(body)
      setAccessToken(body.accessToken)
      set(user)
      return user
    })
  },

  /** Restores the session from the HttpOnly refresh cookie (page reload). Returns null when there is none. */
  async restore(): Promise<SessionUser | null> {
    try {
      const res = await request('/api/auth/refresh', { method: 'POST' }, false)
      const body = (await res.json()) as AuthResponse
      const user = userOf(body)
      setAccessToken(body.accessToken)
      set(user)
      return user
    } catch {
      setAccessToken(null)
      set(null)
      return null
    }
  },

  async logout(): Promise<void> {
    try { await request('/api/auth/logout', { method: 'POST' }, false) } finally {
      setAccessToken(null)
      set(null)
    }
  },

  // Always succeeds from the caller's point of view: the API never reveals whether the email exists.
  async forgot(email: string): Promise<void> {
    await request('/api/auth/forgot-password', json({ email }), false)
  },

  async reset(email: string, token: string, newPassword: string): Promise<void> {
    await request('/api/auth/reset-password', json({ email, token, newPassword }), false)
  },
}
