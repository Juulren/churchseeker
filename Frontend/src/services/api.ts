import type {
  ChurchProfile, PublicBook, PublicChurch, PublicEvent, PublicAnnouncement,
} from './types.ts'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
const TIMEOUT_MS = 15_000

// The access token lives only in memory (never localStorage): a script injected into the page cannot read
// it from storage, and the refresh token is an HttpOnly cookie the page cannot see at all.
let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null

export const setAccessToken = (token: string | null) => { accessToken = token }

// The refresh cookie is rotated by every refresh and every church switch, and a cookie used twice means theft (the server then
// ends every session). So those two never overlap: each one waits for the one before it.
let tail: Promise<unknown> = Promise.resolve()
export function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work, work)
  tail = run.catch(() => undefined)
  return run
}

// Who owns the session is auth.ts: it is told when a refresh gives a new user (the church may have fallen back to the home
// church) and when the session is lost.
let sessionHooks: { refreshed: (body: unknown) => void; lost: () => void } | null = null
export const onSessionChange = (hooks: { refreshed: (body: unknown) => void; lost: () => void }) => { sessionHooks = hooks }

async function send(path: string, init: RequestInit = {}, withAuth = true): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers = new Headers(init.headers)
    if (withAuth && accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    return await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'same-origin', signal: controller.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError(0, 'La solicitud tardó demasiado.')
    throw new ApiError(0, 'No se pudo conectar con el servidor.')
  } finally {
    clearTimeout(timer)
  }
}

// One refresh at a time, however many requests hit a 401 together.
export function refreshSession(): Promise<boolean> {
  refreshing ??= exclusive(async () => {
    try {
      const res = await send('/api/auth/refresh', { method: 'POST' }, false)
      if (!res.ok) { accessToken = null; sessionHooks?.lost(); return false }
      const body = (await res.json()) as { accessToken?: string }
      accessToken = typeof body.accessToken === 'string' ? body.accessToken : null
      if (accessToken !== null) sessionHooks?.refreshed(body)
      else sessionHooks?.lost()
      return accessToken !== null
    } catch {
      // No answer is not a lost session: keep it, the next request tries again.
      return false
    } finally {
      refreshing = null
    }
  })
  return refreshing
}

async function errorOf(res: Response): Promise<ApiError> {
  let message = res.status === 502 || res.status === 503 || res.status === 504
    ? 'No se pudo conectar con el servidor. Comprueba que esté en marcha e inténtalo de nuevo.'
    : `Error ${res.status}`
  try {
    const body = (await res.json()) as { title?: string; errors?: Record<string, string[]> | string[] }
    const errors = Array.isArray(body.errors) ? body.errors : Object.values(body.errors ?? {}).flat()
    message = errors[0] ?? body.title ?? message
  } catch { /* body was not JSON */ }
  return new ApiError(res.status, message)
}

export async function request(path: string, init: RequestInit = {}, withAuth = true): Promise<Response> {
  const tokenAtStart = accessToken
  let res = await send(path, init, withAuth)
  // Retried only with the same session: a request that began before a church switch must never be replayed as the new church.
  if (res.status === 401 && withAuth && accessToken && accessToken === tokenAtStart && await refreshSession()) res = await send(path, init, withAuth)
  if (!res.ok) throw await errorOf(res)
  return res
}

/** One attempt, no refresh and no retry: for the calls that rotate the refresh cookie themselves. */
export async function requestOnce(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await send(path, init, true)
  if (!res.ok) throw await errorOf(res)
  return res
}

async function json<T>(path: string, init?: RequestInit, withAuth = true): Promise<T> {
  return (await request(path, init, withAuth)).json() as Promise<T>
}

function arrayOf<T>(value: unknown): T[] {
  if (!Array.isArray(value)) throw new ApiError(502, 'Respuesta inesperada del servidor.')
  return value as T[]
}

const enc = encodeURIComponent

export const publicApi = {
  churches: async () => arrayOf<PublicChurch>(await json<unknown>('/api/public/churches', undefined, false)),
  church: (id: string) => json<ChurchProfile>(`/api/public/churches/${enc(id)}`, undefined, false),
  events: async (id: string, from?: string, to?: string) => {
    const q = new URLSearchParams()
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    return arrayOf<PublicEvent>(await json<unknown>(`/api/public/churches/${enc(id)}/events?${q}`, undefined, false))
  },
  announcements: async (id: string) =>
    arrayOf<PublicAnnouncement>(await json<unknown>(`/api/public/churches/${enc(id)}/announcements`, undefined, false)),
  books: async (id: string) => arrayOf<PublicBook>(await json<unknown>(`/api/public/churches/${enc(id)}/books`, undefined, false)),
  bookFile: async (churchId: string, bookId: string) =>
    (await request(`/api/public/churches/${enc(churchId)}/books/${enc(bookId)}/file`, undefined, false)).arrayBuffer(),
}

