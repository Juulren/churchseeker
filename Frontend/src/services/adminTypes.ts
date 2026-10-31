export interface Member { id: string; fullName: string; phone: string | null; email: string | null; joinDate: string; isActive: boolean }
export interface MemberInput { fullName: string; phone: string | null; email: string | null; joinDate: string }

export interface EventItem {
  id: string; title: string; description: string | null; date: string; time: string; location: string
  kind: number; isPublic: boolean; responsibleMemberId: string | null; isCancelled: boolean; ministryId: string | null
}
export interface EventInput {
  title: string; description: string | null; date: string; time: string; location: string
  kind: number; isPublic: boolean; responsibleMemberId: string | null; ministryId: string | null
}

export interface AttendanceRow { memberId: string; memberName: string; present: boolean }
export interface EventAttendance { eventId: string; title: string; date: string; present: number; absent: number; rows: AttendanceRow[] }
export interface SummaryRow { periodStart: string; events: number; present: number; absent: number; distinctMembersPresent: number }

export interface Ministry { id: string; name: string; description: string | null; coordinatorUserId: string | null; isActive: boolean; memberCount: number }
export interface MinistryMember { memberId: string; fullName: string }

export interface Donation { id: string; date: string; amount: number; concept: string; method: number; memberId: string | null; isAnonymous: boolean; isVoided: boolean }
export interface DonationInput { date: string; amount: number; concept: string; method: number; memberId: string | null }
export interface DonationPage { items: Donation[]; page: number; pageSize: number; total: number; totalAmount: number }
export interface MonthlyIncome { month: number; count: number; total: number; anonymousCount: number; anonymousTotal: number }

export interface Announcement { id: string; title: string; body: string; publishDate: string; expiresOn: string | null; isImportant: boolean; isPublic: boolean; isActive: boolean }
export interface AnnouncementInput { title: string; body: string; publishDate: string; expiresOn: string | null; isImportant: boolean; isPublic: boolean }

export interface Dashboard {
  kpis: { activeMembers: number; upcomingEvents: number; attendancesThisMonth: number; activeMinistries: number }
  attendanceByWeek: SummaryRow[]
  income?: { year: number; monthToDate: number; yearToDate: number; monthly: MonthlyIncome[] }
}

export interface ProfileInput {
  name: string; denomination: string; patronSaint: string; address: string
  contactPhone: string | null; contactEmail: string | null; latitude: number; longitude: number
  schedules: { day: number; time: string; description: string }[]
}

export interface BookMeta { title: string; description: string | null; author: string | null; isPublic: boolean; spineColor: string; spineThickness: number }

export const DONATION_METHODS = ['', 'Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Otro']
export const EVENT_KINDS = ['', 'Religioso', 'Administrativo']
export const ROLE_VALUES = { Administrador: 1, Pastor: 2, Secretario: 3, Tesorero: 4, Coordinador: 5 } as const
