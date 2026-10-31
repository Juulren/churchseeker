import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, publicApi, request, setAccessToken } from './api.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => { setAccessToken(null) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('api client', () => {
  it('never sends credentials to public endpoints', async () => {
    setAccessToken('secret-token')
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json([]))
    vi.stubGlobal('fetch', fetchMock)
    await publicApi.churches()
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
  })

  it('sends the bearer token on authenticated requests', async () => {
    setAccessToken('abc')
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}))
    vi.stubGlobal('fetch', fetchMock)
    await request('/api/books')
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('Authorization')).toBe('Bearer abc')
  })

  it('encodes ids so a hostile id cannot change the path', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({}))
    vi.stubGlobal('fetch', fetchMock)
    await publicApi.church('../../admin?x=1#y')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).not.toContain('../')
    expect(url).toContain('%2F')
  })

  it('turns server error bodies into readable ApiErrors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ errors: { errors: ['Monto inválido'] } }, 400)))
    await expect(request('/x', {}, false)).rejects.toMatchObject({ name: 'ApiError', status: 400, message: 'Monto inválido' })
  })

  it('handles non-JSON error bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>boom</html>', { status: 502 })))
    await expect(request('/x', {}, false)).rejects.toMatchObject({ status: 502, message: 'Error 502' })
  })

  it('maps network failures to a friendly error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(request('/x', {}, false)).rejects.toBeInstanceOf(ApiError)
  })

  it('rejects responses that are not the expected array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ surprise: true })))
    await expect(publicApi.churches()).rejects.toMatchObject({ status: 502 })
  })

  it('refreshes once on 401 and retries, even with parallel requests', async () => {
    setAccessToken('old')
    let refreshCalls = 0
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) { refreshCalls++; return json({ accessToken: 'new' }) }
      const auth = new Headers(init?.headers).get('Authorization')
      return auth === 'Bearer new' ? json({ ok: true }) : json({}, 401)
    })
    vi.stubGlobal('fetch', fetchMock)
    const results = await Promise.all([request('/api/a'), request('/api/b'), request('/api/c')])
    expect(results.every((r) => r.ok)).toBe(true)
    expect(refreshCalls).toBe(1)
  })

  it('gives up cleanly when the refresh fails', async () => {
    setAccessToken('old')
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)))
    await expect(request('/api/a')).rejects.toMatchObject({ status: 401 })
  })
})
