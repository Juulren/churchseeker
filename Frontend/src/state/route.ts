import { useSyncExternalStore } from 'react'

export interface Route { name: 'home' | 'login' | 'reset' | 'admin'; path: string[]; params: URLSearchParams }

/** Hash routes: #/login, #/reset?email=..&token=.., #/admin/members. No server configuration needed. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [pathPart, query = ''] = raw.split('?')
  const path = pathPart.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s) } catch { return s } })
  const first = path[0]
  const name = first === 'login' || first === 'reset' || first === 'admin' ? first : 'home'
  return { name, path, params: new URLSearchParams(query) }
}

const subscribe = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb) }

export const useHash = () => useSyncExternalStore(subscribe, () => window.location.hash, () => '')
export const navigate = (to: string) => { window.location.hash = to }
