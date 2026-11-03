import { useState, type FormEvent } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import { ROLE_VALUES, type ManagedUser } from '../../../services/adminTypes.ts'
import { newPasswordError } from '../../auth/validators.ts'
import { NAV } from '../nav.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import { Check, Modal, Notice, SelectInput, StatusPill, TextInput } from '../ui.tsx'
import { toast } from '../../ascii/toast.tsx'
import type { Role } from '../../../services/auth.ts'

const ROLE_OPTIONS = Object.entries(ROLE_VALUES).map(([label, v]) => ({ value: String(v), label }))
const roleName = (n: number) => ROLE_OPTIONS.find((o) => o.value === String(n))?.label ?? String(n)

// "Title: detail." becomes a short title and a detail line; a message without a colon is only a title.
const splitToast = (text: string): [string, string | undefined] => {
  const i = text.indexOf(': ')
  return i < 0 ? [text.replace(/.$/, ''), undefined] : [text.slice(0, i), text.slice(i + 2)]
}

type Flash = { kind: 'ok' | 'error'; text: string } | null

function NewUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('3')
  const [msg, setMsg] = useState<Flash>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const bad = newPasswordError(password)
    if (!email.trim() || !name.trim()) { setMsg({ kind: 'error', text: 'Correo y nombre son obligatorios.' }); return }
    if (bad) { setMsg({ kind: 'error', text: bad }); return }
    setBusy(true); setMsg(null)
    try {
      await adminApi.users.create({ email: email.trim(), fullName: name.trim(), password, role: Number(role) })
      onDone()
    } catch (x) { setMsg({ kind: 'error', text: messageOf(x) }) } finally { setBusy(false) }
  }
  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div className="form-grid">
          <TextInput label="Correo" type="email" value={email} onChange={setEmail} />
          <TextInput label="Nombre completo" value={name} onChange={setName} maxLength={200} />
          <TextInput label="Contraseña inicial" type="password" value={password} onChange={setPassword} hint="10+ caracteres, mayúscula, minúscula, número y símbolo" />
          <SelectInput label="Rol" value={role} onChange={setRole} options={ROLE_OPTIONS} />
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="row-actions">
          <button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear usuario'}</button>
          <button type="button" className="rpg-button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

function Permissions() {
  const roles = Object.keys(ROLE_VALUES) as Role[]
  return (
    <section aria-labelledby="perm-title">
      <h3 id="perm-title" className="rpg-title text-xl">Roles y permisos</h3>
      <p className="muted mb-2">Qué módulos puede abrir cada rol. El servidor lo verifica de nuevo en cada solicitud.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Módulo</th>{roles.map((r) => <th key={r}>{r}</th>)}</tr></thead>
          <tbody>
            {NAV.map((n) => (
              <tr key={n.path}>
                <th scope="row">{n.label}</th>
                {roles.map((r) => {
                  const ok = n.roles.includes(r)
                  return <td key={r} aria-label={ok ? 'Permitido' : 'Sin acceso'}>{ok ? '✓' : '—'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function UsersPage() {
  const [showInactive, setShowInactive] = useState(true)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState<Flash>(null)
  const [pending, setPending] = useState<string | null>(null)
  const list = useAsync(() => adminApi.staff.list(showInactive), [showInactive])

  const act = async (u: ManagedUser, run: () => Promise<unknown>, ok: string) => {
    setPending(u.id); setMsg(null)
    try { await run(); if (!toast(...splitToast(ok))) setMsg({ kind: 'ok', text: ok }); list.reload() } catch (x) { setMsg({ kind: 'error', text: messageOf(x) }); list.reload() } finally { setPending(null) }
  }

  return (
    <div className="grid gap-8">
      <section aria-labelledby="staff-title">
        <h3 id="staff-title" className="rpg-title text-xl">Personal con acceso</h3>
        <div className="toolbar">
          <Check label="Mostrar usuarios desactivados" checked={showInactive} onChange={setShowInactive} />
          <button className="rpg-button btn-primary" onClick={() => setCreating(true)}>Nuevo usuario</button>
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {list.error && <Notice>{list.error}</Notice>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {list.data?.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}{u.isSelf && <span className="muted"> (tú)</span>}</td>
                  <td>{u.email}</td>
                  <td>
                    <select className="input" aria-label={'Rol de ' + u.fullName} value={String(u.role)} disabled={u.isSelf || !u.isActive || pending === u.id}
                      onChange={(e) => act(u, () => adminApi.staff.setRole(u.id, Number(e.target.value)), 'Rol de ' + u.fullName + ' cambiado a ' + roleName(Number(e.target.value)) + '.')}>
                      {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td><StatusPill active={u.isActive} on="Activo" off="Desactivado" /></td>
                  <td>
                    <div className="row-actions">
                      {u.isActive
                        ? <button className="rpg-button" disabled={u.isSelf || pending === u.id} onClick={() => act(u, () => adminApi.staff.setActive(u.id, false), u.fullName + ' desactivado: ya no puede entrar.')}>Desactivar</button>
                        : <button className="rpg-button" disabled={pending === u.id} onClick={() => act(u, () => adminApi.staff.setActive(u.id, true), u.fullName + ' reactivado.')}>Activar</button>}
                      {u.isActive && <button className="rpg-button" disabled={pending === u.id} onClick={() => act(u, () => adminApi.staff.sendReset(u.id), 'Correo de restablecimiento enviado a ' + u.email + '.')}>Enviar restablecimiento</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {list.data?.length === 0 && <tr><td colSpan={5} className="muted">Aún no hay usuarios.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <Permissions />
      {creating && <NewUser onClose={() => setCreating(false)} onDone={() => { setCreating(false); if (!toast('Usuario creado en tu iglesia.')) setMsg({ kind: 'ok', text: 'Usuario creado en tu iglesia.' }); list.reload() }} />}
    </div>
  )
}
