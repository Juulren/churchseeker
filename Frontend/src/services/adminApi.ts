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

  // The platform account only: the general dashboard and who works in which church.
  platform: {
    overview: () => get<T.PlatformOverview>('/api/platform/overview'),
    staff: () => get<T.PlatformStaff[]>('/api/platform/staff'),
    setChurches: (u: string, churchIds: string[]) => call<T.PlatformStaff>(`/api/platform/staff/${id(u)}/churches`, 'PUT', { churchIds }),
    setRole: (u: string, role: number) => call<T.PlatformStaff>(`/api/platform/staff/${id(u)}/role`, 'PUT', { role }),
    setActive: (u: string, active: boolean) => call<T.PlatformStaff>(`/api/platform/staff/${id(u)}/${active ? 'activate' : 'deactivate'}`, 'POST'),
    create: (d: { email: string; fullName: string; password: string; role: number; churchIds: string[] }) => call<T.PlatformStaff>('/api/platform/staff', 'POST', d),
  },

  members: {
    list: (q: { search?: string; active?: boolean; page?: number; pageSize?: number }) => get<Paged<T.Member>>(`/api/members${qs(q)}`),
    get: (m: string) => get<T.Member>(`/api/members/${id(m)}`),
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
    memberHistory: (member: string, page: number) => get<Paged<T.MemberAttendanceRow>>(`/api/members/${id(member)}/attendance${qs({ page, pageSize: 10 })}`),
    summary: (q: { from: string; to: string; period: 'Week' | 'Month' }) => get<T.SummaryRow[]>(`/api/attendance/summary${qs(q)}`),
  },

  ministries: {
    list: () => get<T.Ministry[]>('/api/ministries'),
    create: (d: { name: string; description: string | null; coordinatorUserId: string | null }) => call<T.Ministry>('/api/ministries', 'POST', d),
    update: (m: string, d: { name: string; description: string | null; coordinatorUserId: string | null }) => call<T.Ministry>(`/api/ministries/${id(m)}`, 'PUT', d),
    setActive: (m: string, active: boolean) => call<T.Ministry>(`/api/ministries/${id(m)}/${active ? 'activate' : 'deactivate'}`, 'POST'),
    members: (m: string) => get<T.MinistryMember[]>(`/api/ministries/${id(m)}/members`),
    events: (m: string, q: { from?: string; to?: string }) => get<T.EventItem[]>(`/api/ministries/${id(m)}/events${qs(q)}`),
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
    upload: async (kind: 'logo', file: File) => {
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
    list: (role?: number) => get<T.StaffUser[]>(`/api/auth/users${qs({ role })}`),
    create: (d: { email: string; fullName: string; password: string; role: number }) => call<{ id: string }>('/api/auth/users', 'POST', d),
  },

  staff: {
    list: (includeInactive = true) => get<T.ManagedUser[]>('/api/staff' + qs({ includeInactive })),
    setRole: (u: string, role: number) => call<T.ManagedUser>('/api/staff/' + id(u) + '/role', 'PUT', { role }),
    setActive: (u: string, active: boolean) => call<T.ManagedUser>('/api/staff/' + id(u) + (active ? '/activate' : '/deactivate'), 'POST'),
    sendReset: async (u: string) => { await request('/api/staff/' + id(u) + '/send-reset', send('POST')) },
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
