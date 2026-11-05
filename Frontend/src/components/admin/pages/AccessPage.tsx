import { useEffect, useState, type FormEvent } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import { ROLE_VALUES, type PlatformStaff } from '../../../services/adminTypes.ts'
import { newPasswordError } from '../../auth/validators.ts'
import { Empty } from '../../ornament/Illustrations.tsx'
import { messageOf, useAsync } from '../useAsync.ts'
import { Check, Loading, Modal, Notice, SelectInput, StatusPill, TextInput } from '../ui.tsx'

// The platform account only: who works in which church. An administrator can take several churches; every other role works in
// exactly one. The server checks every rule again (including that a church keeps an active administrator).

const ROLE_NAMES: Record<string, string> = { '1': 'Administrador', '2': 'Pastor', '3': 'Secretario', '4': 'Tesorero', '5': 'Coordinador', '6': 'Super administrador', '7': 'Usuario' }
const roleKey = (r: number | string) => (typeof r === 'number' ? String(r) : (Object.entries(ROLE_VALUES).find(([n]) => n === r)?.[1]?.toString() ?? (r === 'SuperAdministrador' ? '6' : r)))
const roleLabel = (r: number | string) => ROLE_NAMES[roleKey(r)] ?? String(r)
const isRole = (r: number | string, name: keyof typeof ROLE_VALUES | 'SuperAdministrador') => roleKey(r) === (name === 'SuperAdministrador' ? '6' : String(ROLE_VALUES[name]))

type Church = { id: string; name: string }

function Churches({ staff, churches, onClose, onDone }: { staff: PlatformStaff; churches: Church[]; onClose: () => void; onDone: (m: string) => void }) {
  const multi = isRole(staff.role, 'Administrador')
  // Several only for an administrator. Anything else starts with its first church, so saving untouched never sends more.
  const [chosen, setChosen] = useState<string[]>(multi ? staff.churches.map((c) => c.id) : staff.churches.slice(0, 1).map((c) => c.id))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A church the account already works in is offered even if it was switched off since, so it can be unchecked.
  const shown = [...churches, ...staff.churches.filter((h) => !churches.some((c) => c.id === h.id))]
  const toggle = (id: string, on: boolean) => setChosen((cur) => (multi ? (on ? [...cur, id] : cur.filter((c) => c !== id)) : [id]))
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (chosen.length === 0) { setError('Elige al menos una iglesia.'); return }
    setBusy(true); setError(null)
    try { await adminApi.platform.setChurches(staff.id, chosen); onDone(`Accesos de ${staff.fullName} actualizados.`) } catch (x) { setError(messageOf(x)) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Iglesias de ${staff.fullName}`} onClose={onClose}>
      <form onSubmit={save} className="grid gap-3" noValidate>
        <p className="muted">{multi ? 'Un administrador puede trabajar en varias iglesias. Marca en cuáles.' : 'Esta cuenta trabaja en una sola iglesia. Elige cuál.'}</p>
        <fieldset className="grid gap-2 border-0 p-0">
          <legend className="rpg-label mb-1">Iglesias</legend>
          {shown.map((c) => (multi
            ? <Check key={c.id} label={c.name} checked={chosen.includes(c.id)} onChange={(on) => toggle(c.id, on)} />
            : <label key={c.id} className="check"><input type="radio" name="church" checked={chosen[0] === c.id} onChange={() => toggle(c.id, true)} /> {c.name}</label>))}
        </fieldset>
        {error && <Notice>{error}</Notice>}
        <div className="modal-actions">
          <button type="button" className="rpg-button" onClick={onClose}>Cerrar</button>
          <button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function NewAccount({ churches, onClose, onDone }: { churches: Church[]; onClose: () => void; onDone: (m: string) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  // A low role by default: the account that can administer a church is chosen on purpose.
  const [role, setRole] = useState('3')
  const [chosen, setChosen] = useState<string[]>([])
  // The churches may arrive after the form opens: the first one is chosen as soon as there is one.
  useEffect(() => { if (chosen.length === 0 && churches[0]) setChosen([churches[0].id]) }, [churches, chosen.length])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const multi = role === '1'
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const bad = newPasswordError(password)
    if (!email.trim() || !name.trim()) { setError('Correo y nombre son obligatorios.'); return }
    if (bad) { setError(bad); return }
    if (chosen.length === 0) { setError('Elige al menos una iglesia.'); return }
    setBusy(true); setError(null)
    try { await adminApi.platform.create({ email: email.trim(), fullName: name.trim(), password, role: Number(role), churchIds: multi ? chosen : [chosen[0]] }); onDone(`Cuenta creada para ${name.trim()}.`) } catch (x) { setError(messageOf(x)) } finally { setBusy(false) }
  }
  return (
    <Modal title="Nueva cuenta" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <TextInput label="Nombre" value={name} onChange={setName} maxLength={200} />
        <TextInput label="Correo" type="email" value={email} onChange={setEmail} />
        <TextInput label="Contraseña inicial" type="password" value={password} onChange={setPassword} hint="Mínimo 10 caracteres, con mayúscula, minúscula, número y símbolo." />
        <SelectInput label="Rol" value={role} onChange={(v) => { setRole(v); if (v !== '1') setChosen((c) => c.slice(0, 1)) }}
          options={Object.entries(ROLE_VALUES).map(([n, v]) => ({ value: String(v), label: n }))} />
        <fieldset className="grid gap-2 border-0 p-0">
          <legend className="rpg-label mb-1">{multi ? 'Iglesias (una o varias)' : 'Iglesia'}</legend>
          {churches.map((c) => (multi
            ? <Check key={c.id} label={c.name} checked={chosen.includes(c.id)} onChange={(on) => setChosen((cur) => (on ? [...cur, c.id] : cur.filter((x) => x !== c.id)))} />
            : <label key={c.id} className="check"><input type="radio" name="new-church" checked={chosen[0] === c.id} onChange={() => setChosen([c.id])} /> {c.name}</label>))}
        </fieldset>
        {error && <Notice>{error}</Notice>}
        <div className="modal-actions">
          <button type="button" className="rpg-button" onClick={onClose}>Cerrar</button>
          <button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function AccessPage() {
  const staff = useAsync(() => adminApi.platform.staff(), [])
  const overview = useAsync(() => adminApi.platform.overview(), [])
  const [editing, setEditing] = useState<PlatformStaff | null>(null)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const churches: Church[] = (overview.data?.churches ?? []).filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }))
  const done = (text: string) => { setEditing(null); setCreating(false); setMsg({ kind: 'ok', text }); staff.reload() }
  const act = async (u: PlatformStaff, work: () => Promise<unknown>, ok: string) => {
    setPending(u.id); setMsg(null)
    try { await work(); setMsg({ kind: 'ok', text: ok }); staff.reload() } catch (x) { setMsg({ kind: 'error', text: messageOf(x) }) } finally { setPending(null) }
  }

  if (staff.loading && !staff.data) return <Loading />
  return (
    <div className="grid gap-4">
      <p className="muted">Quién trabaja en qué iglesia. Un administrador solo ve y administra las iglesias que le asignes aquí; ninguno entra a todas por defecto.</p>
      <div className="toolbar"><button className="rpg-button btn-primary" onClick={() => setCreating(true)}>Nueva cuenta</button></div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {staff.error && <Notice>{staff.error}</Notice>}
      {overview.error && <Notice>{overview.error}</Notice>}
      {staff.data && staff.data.length === 0 && <Empty>Todavía no hay cuentas.</Empty>}
      {staff.data && staff.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Cuentas y las iglesias en las que trabajan</caption>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Iglesias</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {staff.data.map((u) => {
                const platform = isRole(u.role, 'SuperAdministrador')
                return (
                  <tr key={u.id}>
                    <td>{u.fullName}</td>
                    <td>{u.email}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td>{platform ? 'Todas' : u.churches.length === 0 ? '—' : u.churches.map((c) => c.name).join(', ')}</td>
                    <td><StatusPill active={u.isActive} on="Activo" off="Desactivado" /></td>
                    <td>
                      <div className="row-actions">
                        {!platform && !isRole(u.role, 'Usuario') && <button className="rpg-button" disabled={pending === u.id} aria-label={`Iglesias de ${u.fullName}`} onClick={() => setEditing(u)}>Iglesias</button>}
                        {!platform && (u.isActive
                          ? <button className="rpg-button" disabled={pending === u.id} aria-label={`Desactivar a ${u.fullName}`} onClick={() => act(u, () => adminApi.platform.setActive(u.id, false), `${u.fullName} desactivado: ya no puede entrar.`)}>Desactivar</button>
                          : <button className="rpg-button" disabled={pending === u.id} aria-label={`Activar a ${u.fullName}`} onClick={() => act(u, () => adminApi.platform.setActive(u.id, true), `${u.fullName} reactivado.`)}>Activar</button>)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <Churches staff={editing} churches={churches} onClose={() => setEditing(null)} onDone={done} />}
      {creating && <NewAccount churches={churches} onClose={() => setCreating(false)} onDone={done} />}
    </div>
  )
}
