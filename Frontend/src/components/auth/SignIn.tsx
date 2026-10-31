import { useEffect, useRef, useState, type FormEvent } from 'react'
import { authApi, loginMessage } from '../../services/auth.ts'
import { navigate } from '../../state/route.ts'
import AsciiSpinner from './AsciiSpinner.tsx'
import Field, { LockIcon, MailIcon } from './Field.tsx'
import { startLiveChurch, type LiveChurch } from './churchPortrait.ts'
import { emailError, passwordError } from './validators.ts'

const CATHEDRAL = '11111111-1111-1111-1111-111111111111'
type Mode = 'signin' | 'forgot' | 'sent'
// The live art is a video in characters: it has no pulse or shimmer, so those calls are optional.
interface ArtHandle { pulse?: (from?: HTMLElement, strength?: number) => void; shimmer?: (on: boolean) => void; destroy: () => void }

/** Split sign-in: the church in characters that trail under the cursor, and the form on the right. */
export default function SignIn() {
  const artSide = useRef<HTMLDivElement>(null)
  const brand = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const art = useRef<ArtHandle | null>(null)
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email: string | null; password: string | null }>({ email: null, password: null })
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const el = artSide.current
    if (!el) return
    let alive = true
    let live: LiveChurch | null = null
    ;(async () => {
      const [{ asciiVideo }, church] = await Promise.all([import('asciify-engine/kit'), startLiveChurch(CATHEDRAL)])
      if (!church) return
      if (!alive) { church.stop(); return }
      live = church
      el.appendChild(church.video)
      church.video.style.display = 'none'
      art.current = asciiVideo(el, { src: church.video, autoplay: true, label: 'Catedral de San Ildefonso girando, en caracteres' }) as unknown as ArtHandle
    })().catch(() => { /* the form works without the art */ })
    return () => {
      alive = false
      art.current?.destroy()
      art.current = null
      live?.stop()
      live?.video.remove()
    }
  }, [])
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    art.current?.pulse?.(button.current ?? undefined, 1.8)
    art.current?.shimmer?.(true)
    try { await work() } finally {
      art.current?.shimmer?.(false)
      art.current?.pulse?.(undefined, 0.6)
      setBusy(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (mode === 'forgot') {
      const err = emailError(email)
      setErrors({ email: err, password: null })
      if (err) return
      await run(async () => {
        // Same outcome whether the email exists or not; a network failure is reported.
        try { await authApi.forgot(email.trim()); setMode('sent') } catch (x) { setErrors({ email: loginMessage(x), password: null }) }
      })
      return
    }
    const next = { email: emailError(email), password: passwordError(password) }
    setErrors(next)
    if (next.email || next.password) return
    await run(async () => {
      try {
        await authApi.login(email.trim(), password)
        navigate('#/admin')
      } catch (x) {
        setPassword('')
        setErrors({ email: null, password: loginMessage(x) })
      }
    })
  }

  const title = mode === 'signin' ? 'Acceso del personal' : mode === 'forgot' ? 'Recuperar contraseña' : 'Revisa tu correo'
  const lead = mode === 'signin' ? 'Entra para administrar tu iglesia.' : mode === 'forgot' ? 'Te enviaremos un enlace para crear una nueva contraseña.' : 'Si el correo está registrado, recibirás un enlace que vence en 30 minutos.'

  return (
    <main className="sign-in">
      <div ref={artSide} className="sign-in-art">
        <div ref={brand} className="sign-in-brand">
          <h1>ChurchSeeker</h1>
          <p className="rpg-label">Mérida · Yucatán</p>
        </div>
      </div>

      <section className="sign-in-form" aria-labelledby="signin-title">
        <form onSubmit={submit} noValidate>
          <h2 id="signin-title">{title}</h2>
          <p className="lead">{lead}</p>

          {mode !== 'sent' && (
            <>
              <Field id="email" label="Correo" type="email" inputMode="email" autoComplete="username" value={email} onChange={setEmail}
                error={errors.email} icon={MailIcon} disabled={busy} />
              {mode === 'signin' && (
                <Field id="password" label="Contraseña" type={show ? 'text' : 'password'} autoComplete="current-password" value={password}
                  onChange={setPassword} error={errors.password} icon={LockIcon} disabled={busy}
                  trailing={<button type="button" className="pill-toggle" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Ocultar' : 'Ver'}</button>} />
              )}
              <button ref={button} type="submit" className="cta" disabled={busy} aria-busy={busy}>
                {busy ? <><AsciiSpinner /> {mode === 'forgot' ? 'Enviando' : 'Entrando'}</> : mode === 'forgot' ? 'Enviar enlace' : 'Continuar'}
              </button>
            </>
          )}

          <div className="sign-in-links">
            {mode === 'signin' && <button type="button" className="link" onClick={() => { setMode('forgot'); setErrors({ email: null, password: null }) }}>¿Olvidaste tu contraseña?</button>}
            {mode !== 'signin' && <button type="button" className="link" onClick={() => { setMode('signin'); setErrors({ email: null, password: null }) }}>Volver a iniciar sesión</button>}
            <a href="#/">← Ver las iglesias</a>
          </div>
        </form>
      </section>
    </main>
  )
}
