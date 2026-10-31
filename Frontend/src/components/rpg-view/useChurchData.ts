import { useEffect, useState } from 'react'
import { fetchChurchData, type ChurchData } from './churchData.ts'

interface State { id: string | null; data: ChurchData | null }

/**
 * Data for one church. Switching churches quickly can never show the previous church's data:
 * a response is only accepted while its id is still the current one.
 */
export function useChurchData(churchId: string | null): { data: ChurchData | null; loading: boolean } {
  const [state, setState] = useState<State>({ id: null, data: null })

  useEffect(() => {
    if (!churchId) return
    let current = true
    fetchChurchData(churchId).then((data) => { if (current) setState({ id: churchId, data }) })
    return () => { current = false }
  }, [churchId])

  const fresh = state.id === churchId
  return { data: fresh ? state.data : null, loading: churchId !== null && !fresh }
}
