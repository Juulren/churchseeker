import { useCallback, useEffect, useState } from 'react'

export interface Async<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

export const messageOf = (e: unknown): string => (e instanceof Error ? e.message : 'Ocurrió un error.')

/** Loads data when `deps` change. A slow, stale response can never overwrite a newer one. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let current = true
    setState((s) => ({ ...s, loading: true, error: null }))
    load().then(
      (data) => { if (current) setState({ data, error: null, loading: false }) },
      (e: unknown) => { if (current) setState({ data: null, error: messageOf(e), loading: false }) },
    )
    return () => { current = false }
    // The caller lists the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { ...state, reload }
}
