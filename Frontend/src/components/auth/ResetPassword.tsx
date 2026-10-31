import { useState, type FormEvent } from 'react'
import { ApiError } from '../../services/api.ts'
import { authApi } from '../../services/auth.ts'
import { navigate } from '../../state/route.ts'
import AsciiSpinner from './AsciiSpinner.tsx'
import Field, { LockIcon } from './Field.tsx'
import { newPasswordError } from './validators.ts'

interface Props { email: string; token: string }

/** Final step of password recovery: the link carries the email and a single-use token. */
export default function ResetPassword({ email, token }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password: string | null; confirm: string | null }>({ password: null, confirm: null })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const invalidLink = !email || !token

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || invalidLink) return
    const next = { password: newPasswordError(password), confirm: password === confirm ? null : 'Las contraseñas no coinciden.' }
    setErrors(next)
    if (next.password || next.confirm) return
    setBusy(true)
    setFailure(null)
    try {
      await authApi.reset(email, token, password)
      setDone(true)
    } catch (x) {
      setFailure(x instanceof ApiError && x.status === 401 ? 'El enlace ya no es válido. Solicita uno nuevo.' : x instanceof ApiError && x.status === 400 ? x.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="sign-in sign-in-single">
      <section className="sign-in-form" aria-labelledby="reset-title">
        <form onSubmit={submit} noValidate>
          <h2 id="reset-title">{done ? 'Contraseña actualizada' : 'Nueva contraseña'}</h2>
          {invalidLink && <p role="alert" className="lead">El enlace no es válido.</p>}
          {done ? (
            <>
              <p className="lead">Ya puedes iniciar sesión. Se cerraron las demás sesiones abiertas.</p>
              <button type="button" className="cta" onClick={() => navigate('#/login')}>Ir a iniciar sesión</button>
            </>
          ) : (
            <>
              <p className="lead">Elige una contraseña de al menos 10 caracteres, con mayúscula, minúscula, número y símbolo.</p>
              <Field id="new-password" label="Nueva contraseña" type="password" autoComplete="new-password" value={password} onChange={setPassword}
                error={errors.password} icon={LockIcon} disabled={busy || invalidLink} />
              <Field id="confirm-password" label="Confirmar" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm}
                error={errors.confirm} icon={LockIcon} disabled={busy || invalidLink} />
              <p role="alert" className="form-failure">{failure ?? ''}</p>
              <button type="submit" className="cta" disabled={busy || invalidLink} aria-busy={busy}>
                {busy ? <><AsciiSpinner /> Guardando</> : 'Guardar contraseña'}
              </button>
            </>
          )}
          <div className="sign-in-links"><a href="#/login">← Volver</a></div>
        </form>
      </section>
    </main>
  )
}
