import type { Role } from '../../services/auth.ts'

export interface NavItem { path: string; label: string; roles: Role[] }

const ALL: Role[] = ['Administrador', 'Pastor', 'Secretario', 'Tesorero', 'Coordinador']

// Who may open which module (matches the API policies; the API enforces it again on every call).
export const NAV: NavItem[] = [
  { path: 'dashboard', label: 'Panel', roles: ALL },
  { path: 'members', label: 'Miembros', roles: ['Administrador', 'Pastor', 'Secretario'] },
  { path: 'events', label: 'Eventos', roles: ALL },
  { path: 'attendance', label: 'Asistencia', roles: ['Administrador', 'Pastor', 'Secretario'] },
  { path: 'ministries', label: 'Ministerios', roles: ['Administrador', 'Pastor', 'Secretario', 'Coordinador'] },
  { path: 'donations', label: 'Donaciones', roles: ['Administrador', 'Tesorero'] },
  { path: 'announcements', label: 'Comunicados', roles: ALL },
  { path: 'reports', label: 'Reportes', roles: ['Administrador', 'Pastor', 'Secretario', 'Tesorero'] },
  { path: 'settings', label: 'Configuración', roles: ['Administrador'] },
]

export const allowedNav = (role: Role) => NAV.filter((n) => n.roles.includes(role))
