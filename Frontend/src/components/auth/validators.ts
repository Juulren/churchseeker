// Client-side checks are a convenience only: the API validates everything again.
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/

export const emailError = (value: string): string | null => {
  const v = value.trim()
  if (!v) return 'Escribe tu correo.'
  if (v.length > 256 || !EMAIL.test(v)) return 'Correo no válido.'
  return null
}

export const passwordError = (value: string): string | null => (value ? null : 'Escribe tu contraseña.')

/** Mirrors the server policy so people see what is missing before they submit. */
export function newPasswordError(value: string): string | null {
  if (value.length < 10) return 'Mínimo 10 caracteres.'
  if (!/[a-z]/.test(value)) return 'Falta una minúscula.'
  if (!/[A-Z]/.test(value)) return 'Falta una mayúscula.'
  if (!/\d/.test(value)) return 'Falta un número.'
  if (!/[^A-Za-z0-9]/.test(value)) return 'Falta un símbolo.'
  if (new Set(value).size < 4) return 'Usa más caracteres distintos.'
  return null
}
