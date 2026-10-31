import { publicApi } from '../../services/api.ts'
import type { ChurchProfile, PublicAnnouncement, PublicBook, PublicEvent } from '../../services/types.ts'
import { isoDate } from './format.ts'

export interface Section<T> { data: T | null; error: string | null }

export interface ChurchData {
  profile: Section<ChurchProfile>
  events: Section<PublicEvent[]>
  announcements: Section<PublicAnnouncement[]>
  books: Section<PublicBook[]>
}

type Api = Pick<typeof publicApi, 'church' | 'events' | 'announcements' | 'books'>

const settle = <T>(r: PromiseSettledResult<T>): Section<T> =>
  r.status === 'fulfilled'
    ? { data: r.value, error: null }
    : { data: null, error: r.reason instanceof Error ? r.reason.message : 'No se pudo cargar.' }

/** Loads everything the church view needs in parallel; one failing section never hides the others. */
export async function fetchChurchData(id: string, api: Api = publicApi, today = new Date()): Promise<ChurchData> {
  const end = new Date(today)
  end.setDate(end.getDate() + 120)
  const [profile, events, announcements, books] = await Promise.allSettled([
    api.church(id), api.events(id, isoDate(today), isoDate(end)), api.announcements(id), api.books(id),
  ])
  return { profile: settle(profile), events: settle(events), announcements: settle(announcements), books: settle(books) }
}
