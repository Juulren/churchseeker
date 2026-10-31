import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setAccessToken } from '../../services/api.ts'
import { authApi, loginMessage, session } from '../../services/auth.ts'
import { parseRoute } from '../../state/route.ts'
import { emailError, newPasswordError, passwordError } from './validators.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const ok = (role: unknown = 'Administrador') => ({ accessToken: 'tok', expiresAt: 'x', user: { id: '1', email: 'a@b.mx', fullName: 'Ana', role, churchId: 'c' } })

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null) })

describe('validators', () => {
  it('accepts normal emails and rejects broken or hostile ones', () => {
    expect(emailError('ana@iglesia.mx')).toBeNull()
    expect(emailError('  ana@iglesia.mx  ')).toBeNull()
    for (const bad of ['', '   ', 'ana', 'ana@', '@x.mx', 'a b@x.mx', 'a@b', '<script>@x.mx', 'a@b.c', 'x'.repeat(300) + '@x.mx']) expect(emailError(bad)).not.toBeNull()
  })

  it('requires a password and mirrors the server policy for new ones', () => {
    expect(passwordError('')).not.toBeNull()
    expect(passwordError('x')).toBeNull()
    expect(newPasswordError('Corta1!')).toMatch(/10/)
    expect(newPasswordError('sinmayuscula1!!')).toMatch(/mayúscula/)
    expect(newPasswordError('SINMINUSCULA1!!')).toMatch(/minúscula/)
    expect(newPasswordError('SinNumeros!!!!')).toMatch(/número/)
    expect(newPasswordError('SinSimbolo1234')).toMatch(/símbolo/)
    expect(newPasswordError('Aaaaaaaaa1!')).toBeNull() // four classes already mean four distinct characters
    expect(newPasswordError('Adm1n!Passw0rd#')).toBeNull()
  })
})

describe('parseRoute', () => {
  it('reads names, paths and params, and falls back to home', () => {
    expect(parseRoute('').name).toBe('home')
    expect(parseRoute('#/').name).toBe('home')
    expect(parseRoute('#/login').name).toBe('login')
    expect(parseRoute('#/admin/members').path).toEqual(['admin', 'members'])
    const r = parseRoute('#/reset?email=a%40b.mx&token=t%2Fk')
    expect(r.name).toBe('reset')
    expect(r.params.get('email')).toBe('a@b.mx')
    expect(r.params.get('token')).toBe('t/k')
    for (const hostile of ['#/../../etc', '#/%E0%A4%A', '#/javascript:alert(1)', '#/admin/%00']) expect(() => parseRoute(hostile)).not.toThrow()
    expect(parseRoute('#/unknown').name).toBe('home')
  })
})

describe('authApi', () => {
  it('stores the session and the in-memory token on login, accepting a numeric or named role', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(ok(1))))
    const u = await authApi.login('a@b.mx', 'x')
    expect(u.role).toBe('Administrador')
    expect(session.get()?.email).toBe('a@b.mx')
    vi.stubGlobal('fetch', vi.fn(async () => json(ok('Tesorero'))))
    expect((await authApi.login('a@b.mx', 'x')).role).toBe('Tesorero')
  })

  it('rejects responses with an unknown role or no token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(ok('SuperAdmin'))))
    await expect(authApi.login('a@b.mx', 'x')).rejects.toMatchObject({ status: 502 })
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...ok(), accessToken: '' })))
    await expect(authApi.login('a@b.mx', 'x')).rejects.toBeInstanceOf(ApiError)
  })

  it('restore returns null without a session and clears any user', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)))
    expect(await authApi.restore()).toBeNull()
    expect(session.get()).toBeNull()
  })

  it('logout clears the session even when the server call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(ok())))
    await authApi.login('a@b.mx', 'x')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await authApi.logout().catch(() => {})
    expect(session.get()).toBeNull()
  })

  it('never sends the access token to the login endpoints', async () => {
    setAccessToken('secret')
    const f = vi.fn(async (_u: string, _i?: RequestInit) => json(ok()))
    vi.stubGlobal('fetch', f)
    await authApi.login('a@b.mx', 'x')
    expect(new Headers(f.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
  })
})

describe('loginMessage', () => {
  it('gives one generic message for bad credentials and a specific one for rate limits', () => {
    expect(loginMessage(new ApiError(401, 'x'))).toBe('Correo o contraseña incorrectos.')
    expect(loginMessage(new ApiError(429, 'x'))).toMatch(/Demasiados/)
    expect(loginMessage(new ApiError(0, 'Sin conexión'))).toBe('Sin conexión')
    expect(loginMessage(new Error('boom'))).toMatch(/No se pudo/)
    expect(loginMessage(null)).toMatch(/No se pudo/)
  })
})
