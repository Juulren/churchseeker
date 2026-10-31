import { request } from './api.ts'
import type * as T from './adminTypes.ts'
import type { ChurchProfile, Paged, StaffBook } from './types.ts'

type Query = Record<string, string | number | boolean | null | undefined>

/** Builds `?a=1&b=2`, skipping empty values and encoding everything. */
export function qs(q: Query): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

const send = (method: string, data?: unknown): RequestInit =>
  data === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
const get = async <R>(path: string): Promise<R> => (await request(path)).json() as Promise<R>
const call = async <R>(path: string, method: string, data?: unknown): Promise<R> => (await request(path, send(method, data))).json() as Promise<R>
const id = encodeURIComponent

export const adminApi = {
  dashboard: () => get<T.Dashboard>('/api/dashboard'),

  members: {
    list: (q: { search?: string; active?: boolean; page?: number; pageSize?: number }) => get<Paged<T.Member>>(`/api/members${qs(q)}`),
    create: (d: T.MemberInput) => call<T.Member>('/api/members', 'POST', d),
    update: (m: string, d: T.MemberInput) => call<T.Member>(`/api/members/${id(m)}`, 'PUT', d),
    deactivate: async (m: string) => { await request(`/api/members/${id(m)}`, send('DELETE')) },
    activate: (m: string) => call<T.Member>(`/api/members/${id(m)}/activate`, 'POST'),
  },

  events: {
    list: (q: { from?: string; to?: string; page?: number; pageSize?: number }) => get<Paged<T.EventItem>>(`/api/events${qs(q)}`),
    create: (d: T.EventInput) => call<T.EventItem>('/api/events', 'POST', d),
    update: (e: string, d: T.EventInput) => call<T.EventItem>(`/api/events/${id(e)}`, 'PUT', d),
    cancel: (e: string) => call<T.EventItem>(`/api/events/${id(e)}/cancel`, 'POST'),
    restore: (e: string) => call<T.EventItem>(`/api/events/${id(e)}/restore`, 'POST'),
  },

  attendance: {
    get: (e: string) => get<T.EventAttendance>(`/api/events/${id(e)}/attendance`),
    record: (e: string, entries: { memberId: string; present: boolean }[]) => call<T.EventAttendance>(`/api/events/${id(e)}/attendance`, 'PUT', { entries }),
    summary: (q: { from: string; to: string; period: 'Week' | 'Month' }) => get<T.SummaryRow[]>(`/api/attendance/summary${qs(q)}`),
  },

  ministries: {
    list: () => get<T.Ministry[]>('/api/ministries'),
    create: (d: { name: string; description: string | null; coordinatorUserId: string | null }) => call<T.Ministry>('/api/ministries', 'POST', d),
    update: (m: string, d: { name: string; description: string | null; coordinatorUserId: string | null }) => call<T.Ministry>(`/api/ministries/${id(m)}`, 'PUT', d),
    setActive: (m: string, active: boolean) => call<T.Ministry>(`/api/ministries/${id(m)}/${active ? 'activate' : 'deactivate'}`, 'POST'),
    members: (m: string) => get<T.MinistryMember[]>(`/api/ministries/${id(m)}/members`),
    addMember: (m: string, member: string) => call<T.MinistryMember[]>(`/api/ministries/${id(m)}/members/${id(member)}`, 'PUT'),
    removeMember: (m: string, member: string) => call<T.MinistryMember[]>(`/api/ministries/${id(m)}/members/${id(member)}`, 'DELETE'),
  },

  donations: {
    list: (q: { from?: string; to?: string; method?: number; includeVoided?: boolean; page?: number; pageSize?: number }) => get<T.DonationPage>(`/api/donations${qs(q)}`),
    create: (d: T.DonationInput) => call<T.Donation>('/api/donations', 'POST', d),
    void: (d: string) => call<T.Donation>(`/api/donations/${id(d)}/void`, 'POST'),
    monthly: (year: number) => get<T.MonthlyIncome[]>(`/api/donations/summary/monthly${qs({ year })}`),
  },

  announcements: {
    list: (q: { includeInactive?: boolean; page?: number; pageSize?: number }) => get<Paged<T.Announcement>>(`/api/announcements${qs(q)}`),
    create: (d: T.AnnouncementInput) => call<T.Announcement>('/api/announcements', 'POST', d),
    update: (a: string, d: T.AnnouncementInput) => call<T.Announcement>(`/api/announcements/${id(a)}`, 'PUT', d),
    remove: async (a: string) => { await request(`/api/announcements/${id(a)}`, send('DELETE')) },
  },

  church: {
    get: () => get<ChurchProfile>('/api/church'),
    update: (d: T.ProfileInput) => call<ChurchProfile>('/api/church', 'PUT', d),
    upload: async (kind: 'logo' | 'model', file: File) => {
      const f = new FormData()
      f.append('file', file)
      return (await request(`/api/church/${kind}`, { method: 'POST', body: f })).json() as Promise<ChurchProfile>
    },
  },

  books: {
    list: async () => (await get<Paged<StaffBook>>('/api/books?pageSize=100&includeInactive=false')).items,
    upload: async (meta: T.BookMeta, file: File) => {
      const f = new FormData()
      f.append('title', meta.title)
      if (meta.description) f.append('description', meta.description)
      if (meta.author) f.append('author', meta.author)
      f.append('isPublic', String(meta.isPublic))
      f.append('spineColor', meta.spineColor)
      f.append('spineThickness', String(meta.spineThickness))
      f.append('file', file)
      return (await request('/api/books', { method: 'POST', body: f })).json() as Promise<StaffBook>
    },
    update: (b: string, d: T.BookMeta) => call<StaffBook>(`/api/books/${id(b)}`, 'PUT', d),
    remove: async (b: string) => { await request(`/api/books/${id(b)}`, send('DELETE')) },
  },

  users: {
    create: (d: { email: string; fullName: string; password: string; role: number }) => call<{ id: string }>('/api/auth/users', 'POST', d),
  },

  reports: {
    download: async (kind: 'members' | 'attendance' | 'ministries' | 'income', q: Query) => {
      const res = await request(`/api/reports/${kind}${qs(q)}`)
      const name = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `reporte-${kind}`
      return { blob: await res.blob(), name: decodeURIComponent(name) }
    },
  },
}

/** Saves a downloaded blob through a temporary link. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
