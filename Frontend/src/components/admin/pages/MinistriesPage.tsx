import { useState, type FormEvent } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import type { Ministry } from '../../../services/adminTypes.ts'
import { emptyToNull } from '../format.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import { Modal, Notice, SelectInput, TextArea, TextInput } from '../ui.tsx'

function MinistryForm({ ministry, onDone, onClose }: { ministry: Ministry | null; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState(ministry?.name ?? '')
  const [description, setDescription] = useState(ministry?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('El nombre es obligatorio.'); return }
    setBusy(true); setError(null)
    try {
      const input = { name: name.trim(), description: emptyToNull(description), coordinatorUserId: ministry?.coordinatorUserId ?? null }
      if (ministry) await adminApi.ministries.update(ministry.id, input); else await adminApi.ministries.create(input)
      onDone()
    } catch (x) { setError(messageOf(x)) } finally { setBusy(false) }
  }
  return (
    <Modal title={ministry ? 'Editar ministerio' : 'Nuevo ministerio'} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <TextInput label="Nombre" value={name} onChange={setName} maxLength={150} />
        <TextArea label="Descripción" value={description} onChange={setDescription} maxLength={1000} />
        {error && <Notice>{error}</Notice>}
        <div className="modal-actions">
          <button type="button" className="rpg-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Roster({ ministry, canManage }: { ministry: Ministry; canManage: boolean }) {
  const roster = useAsync(() => adminApi.ministries.members(ministry.id), [ministry.id])
  const members = useAsync(() => adminApi.members.list({ active: true, pageSize: 100 }), [])
  const [add, setAdd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inRoster = new Set((roster.data ?? []).map((m) => m.memberId))
  const act = async (work: () => Promise<unknown>) => { setError(null); try { await work(); roster.reload() } catch (x) { setError(messageOf(x)) } }
  return (
    <div>
      <h4 className="mb-2">Integrantes de {ministry.name}</h4>
      {error && <Notice>{error}</Notice>}
      {canManage && (
        <div className="toolbar">
          <div style={{ flex: '1 1 240px' }}>
            <SelectInput label="Agregar miembro" value={add} onChange={setAdd}
              options={[{ value: '', label: 'Elige…' }, ...(members.data?.items ?? []).filter((m) => !inRoster.has(m.id)).map((m) => ({ value: m.id, label: m.fullName }))]} />
          </div>
          <button className="rpg-button" disabled={!add} onClick={() => act(async () => { await adminApi.ministries.addMember(ministry.id, add); setAdd('') })}>Agregar</button>
        </div>
      )}
      <ul className="grid gap-1">
        {roster.data?.map((m) => (
          <li key={m.memberId} className="flex items-center justify-between gap-2">{m.fullName}
            {canManage && <button className="rpg-button" onClick={() => act(() => adminApi.ministries.removeMember(ministry.id, m.memberId))} aria-label={`Quitar a ${m.fullName}`}>Quitar</button>}</li>
        ))}
        {roster.data?.length === 0 && <li className="muted">Sin integrantes todavía.</li>}
      </ul>
    </div>
  )
}

export default function MinistriesPage({ isManagement }: { isManagement: boolean }) {
  const list = useAsync(() => adminApi.ministries.list(), [])
  const [editing, setEditing] = useState<Ministry | 'new' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = list.data?.find((m) => m.id === openId) ?? null
  const toggle = async (m: Ministry) => { setError(null); try { await adminApi.ministries.setActive(m.id, !m.isActive); list.reload() } catch (x) { setError(messageOf(x)) } }

  return (
    <div className="grid gap-6">
      <div>
        {isManagement && <div className="toolbar"><button className="rpg-button btn-primary" onClick={() => setEditing('new')}>Nuevo ministerio</button></div>}
        {(list.error || error) && <Notice>{list.error ?? error}</Notice>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Ministerio</th><th>Descripción</th><th className="num">Integrantes</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {list.data?.map((m) => (
                <tr key={m.id}><td>{m.name}</td><td className="muted">{m.description ?? '—'}</td><td className="num">{m.memberCount}</td><td>{m.isActive ? 'Activo' : 'Inactivo'}</td>
                  <td><div className="row-actions">
                    <button className="rpg-button" onClick={() => setOpenId(m.id === openId ? null : m.id)}>Integrantes</button>
                    {isManagement && <><button className="rpg-button" onClick={() => setEditing(m)}>Editar</button>
                      <button className="rpg-button" onClick={() => toggle(m)}>{m.isActive ? 'Desactivar' : 'Activar'}</button></>}
                  </div></td></tr>
              ))}
              {list.data?.length === 0 && <tr><td colSpan={5} className="muted">No hay ministerios.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {open && <Roster ministry={open} canManage />}
      {editing && <MinistryForm ministry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); list.reload() }} />}
    </div>
  )
}
