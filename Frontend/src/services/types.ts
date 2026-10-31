// Shapes returned by the ChurchSeeker API (camelCase JSON).
export interface PublicChurch {
  id: string
  name: string
  denomination: string
  patronSaint: string
  latitude: number
  longitude: number
  modelUrl: string | null
  logoUrl: string | null
}

export interface ScheduleSlot {
  day: number
  time: string
  description: string
}

export interface ChurchProfile extends PublicChurch {
  address: string
  contactPhone: string | null
  contactEmail: string | null
  schedules: ScheduleSlot[]
}

export interface PublicEvent {
  id: string
  title: string
  description: string | null
  date: string
  time: string
  location: string
  kind: number
  isCancelled: boolean
}

export interface PublicAnnouncement {
  id: string
  title: string
  body: string
  publishDate: string
  expiresOn: string | null
  isImportant: boolean
}

export interface PublicHighlights {
  importantAnnouncements: PublicAnnouncement[]
  upcomingEvents: PublicEvent[]
}

export interface PublicBook {
  id: string
  title: string
  description: string | null
  author: string | null
  spineColor: string
  spineThickness: number
}

// Staff view of a book: also carries visibility and size.
export interface StaffBook extends PublicBook {
  isPublic: boolean
  sizeBytes: number
  isActive: boolean
}

export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}
