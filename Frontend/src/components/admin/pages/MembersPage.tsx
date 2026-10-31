import { useEffect, useState, type FormEvent } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import type { Member } from '../../../services/adminTypes.ts'
import { emptyToNull, todayIso } from '../format.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import { Modal, Notice, Pager, SelectInput, TextInput } from '../ui.tsx'

const PAGE = 15

function MemberForm({ member, onDone, onClose }: { member: Member | null; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState(member?.fullName ?? '')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [join, setJoin] = useState(member?.joinDate ?? todayIso())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio.'); return }
    setBusy(true); setError(null)
    try {
      const input = { fullName: name.trim(), phone: emptyToNull(phone), email: emptyToNull(email), joinDate: join }
      if (member) await adminApi.members.update(member.id, input); else await adminApi.members.create(input)
      onDone()
    } catch (x) { setError(messageOf(x)) } finally { setBusy(false) }
  }
  return (
    <Modal title={member ? 'Editar miembro' : 'Nuevo miembro'} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div className="form-grid">
          <TextInput label="Nombre completo" value={name} onChange={setName} required maxLength={200} />
          <TextInput label="Fecha de ingreso" type="date" value={join} onChange={setJoin} />
          <TextInput label="Teléfono" value={phone} onChange={setPhone} maxLength={30} />
          <TextInput label="Correo" type="email" value={email} onChange={setEmail} />
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="modal-actions">
          <button type="button" className="rpg-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function MembersPage() {
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('true')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Member | 'new' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  useEffect(() => { const t = setTimeout(() => { setTerm(search); setPage(1) }, 300); return () => clearTimeout(t) }, [search])

  const list = useAsync(() => adminApi.members.list({ search: term, active: status === '' ? undefined : status === 'true', page, pageSize: PAGE }), [term, status, page])
  const toggle = async (m: Member) => {
    setActionError(null)
    try { if (m.isActive) await adminApi.members.deactivate(m.id); else await adminApi.members.activate(m.id); list.reload() } catch (x) { setActionError(messageOf(x)) }
  }

  return (
    <div>
      <div className="toolbar">
        <div style={{ flex: '1 1 220px' }}><TextInput label="Buscar por nombre" value={search} onChange={setSearch} maxLength={100} /></div>
        <div style={{ width: 160 }}><SelectInput label="Estado" value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={[{ value: 'true', label: 'Activos' }, { value: 'false', label: 'Inactivos' }, { value: '', label: 'Todos' }]} /></div>
        <button className="rpg-button btn-primary" onClick={() => setEditing('new')}>Nuevo miembro</button>
      </div>
      {actionError && <Notice>{actionError}</Notice>}
      {list.error && <Notice>{list.error}</Notice>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Correo</th><th>Ingreso</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((m) => (
              <tr key={m.id}>
                <td>{m.fullName}</td><td>{m.phone ?? '—'}</td><td>{m.email ?? '—'}</td><td>{m.joinDate}</td>
                <td>{m.isActive ? 'Activo' : <span className="muted">Inactivo</span>}</td>
                <td><div className="row-actions">
                  <button className="rpg-button" onClick={() => setEditing(m)}>Editar</button>
                  <button className="rpg-button" onClick={() => toggle(m)}>{m.isActive ? 'Desactivar' : 'Activar'}</button>
                </div></td>
              </tr>
            ))}
            {list.data && list.data.items.length === 0 && <tr><td colSpan={6} className="muted">No hay miembros con ese filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      {list.loading && !list.data && <p role="status" className="muted">Cargando…</p>}
      {list.data && <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />}
      {editing && <MemberForm member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); list.reload() }} />}
    </div>
  )
}
