import { useEffect, useRef, useState, type FormEvent } from 'react'
import { authApi, loginMessage } from '../../services/auth.ts'
import { navigate } from '../../state/route.ts'
import { useKit } from '../ascii/useKit.ts'
import Field, { LockIcon, MailIcon } from './Field.tsx'
import { treeOfLifeUrl } from './treeOfLife.ts'
import { emailError, passwordError } from './validators.ts'

type Mode = 'signin' | 'forgot' | 'sent'
interface ArtHandle { pulse?: (from?: Element | { x: number; y: number }, strength?: number) => void; shimmer?: (on: boolean) => void; destroy: () => void }

/** Split sign-in: a tree of life in characters that trail under the cursor, and the form on the right. */
export default function SignIn() {
  const artSide = useRef<HTMLDivElement>(null)
  const brand = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const kitRef = useRef<typeof import('asciify-engine/kit') | null>(null)
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
    const poster = new Image()
    poster.alt = ''
    poster.src = treeOfLifeUrl()
    poster.className = 'sign-in-poster'
    el.prepend(poster)
    ;(async () => {
      const { artPanel } = await import('asciify-engine/kit')
      await poster.decode().catch(() => { /* a broken image just shows no art */ })
      if (!alive) return
      // The characters take over from the poster; without WebGL the poster stays and the form works the same.
      art.current = artPanel(el, { image: poster, clear: brand.current ?? false, focus: { x: 0.5, y: 0.5 }, look: { cellSize: 8 }, charset: ' .:-=+*#' }) as unknown as ArtHandle
      // The tree wakes once: a ring of light rises from its base.
      art.current.pulse?.({ x: el.getBoundingClientRect().left + el.clientWidth / 2, y: el.getBoundingClientRect().bottom - 40 }, 2.2)
    })().catch(() => { /* the form works without the art */ })
    return () => {
      alive = false
      art.current?.destroy()
      art.current = null
      poster.remove()
    }
  }, [])
  // One cursor trail for the page, kept off the form.
  useKit(artSide, (kit) => kit.cursorTrail({ charset: ' .:-=+*#', life: 700, skip: '.sign-in-form' }))
  // The button: a quiet beam of light on its border. Its loading state is mounted only while work runs (see run), so the label at rest is plain text.
  useKit(button, (kit, el) => {
    kitRef.current = kit
    const b = kit.beam(el, { palette: 'mono', mode: 'pulse', hover: true })
    return { destroy: () => { kitRef.current = null; b.destroy() } }
  }, [mode])
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    art.current?.pulse?.(button.current ?? undefined, 1.8)
    art.current?.shimmer?.(true)
    const loading = button.current && kitRef.current ? kitRef.current.buttonLoading(button.current) : null
    loading?.start(mode === 'forgot' ? 'Enviando' : 'Entrando')
    try { await work() } finally {
      loading?.reset()
      loading?.destroy()
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
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
        <defs><clipPath id="arch-clip" clipPathUnits="objectBoundingBox"><path d="M0 1V0.42C0 0.17 0.36 0.04 0.5 0C0.64 0.04 1 0.17 1 0.42V1Z" /></clipPath></defs>
      </svg>
      <div ref={artSide} className="sign-in-art">
        <svg className="art-frame" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true" focusable="false" fill="none" stroke="currentColor">
          <path d="M1 139V58.8C1 23.4 36 5.6 50 1C64 5.6 99 23.4 99 58.8V139" vectorEffect="non-scaling-stroke" strokeWidth="2" />
        </svg>
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
              <button key={mode} ref={button} type="submit" className="cta" disabled={busy} aria-busy={busy}>
                {mode === 'forgot' ? 'Enviar enlace' : 'Continuar'}
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
