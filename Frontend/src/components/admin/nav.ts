import { effectiveRole, type Role } from '../../services/auth.ts'

/** platformOnly: only the platform account (SuperAdministrador), whatever church it is working in. */
export interface NavItem { path: string; label: string; roles: Role[]; platformOnly?: boolean }

const ALL: Role[] = ['Administrador', 'Pastor', 'Secretario', 'Tesorero', 'Coordinador']

// Who may open which module (matches the API policies; the API enforces it again on every call).
// The platform account acts as an Administrador inside a church, so the church modules list roles as before; its own two
// modules come first.
export const NAV: NavItem[] = [
  { path: 'platform', label: 'Panorama general', roles: [], platformOnly: true },
  { path: 'access', label: 'Accesos', roles: [], platformOnly: true },
  { path: 'dashboard', label: 'Panel', roles: ALL },
  { path: 'members', label: 'Miembros', roles: ['Administrador', 'Pastor', 'Secretario'] },
  { path: 'events', label: 'Eventos', roles: ALL },
  { path: 'attendance', label: 'Asistencia', roles: ['Administrador', 'Pastor', 'Secretario'] },
  { path: 'ministries', label: 'Ministerios', roles: ['Administrador', 'Pastor', 'Secretario', 'Coordinador'] },
  { path: 'donations', label: 'Donaciones', roles: ['Administrador', 'Tesorero'] },
  { path: 'announcements', label: 'Comunicados', roles: ALL },
  { path: 'reports', label: 'Reportes', roles: ['Administrador', 'Pastor', 'Secretario', 'Tesorero'] },
  { path: 'users', label: 'Usuarios', roles: ['Administrador'] },
  { path: 'settings', label: 'Configuración', roles: ['Administrador'] },
]

export const allowedNav = (role: Role) =>
  NAV.filter((n) => (n.platformOnly ? role === 'SuperAdministrador' : n.roles.includes(effectiveRole(role))))
