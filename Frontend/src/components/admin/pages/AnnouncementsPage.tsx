import { useState, type FormEvent } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import type { Announcement } from '../../../services/adminTypes.ts'
import { emptyToNull, todayIso } from '../format.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import { Check, Modal, Notice, Pager, TextArea, TextInput } from '../ui.tsx'

const PAGE = 10

function Form({ item, onDone, onClose }: { item: Announcement | null; onDone: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [publish, setPublish] = useState(item?.publishDate ?? todayIso())
  const [expires, setExpires] = useState(item?.expiresOn ?? '')
  const [important, setImportant] = useState(item?.isImportant ?? false)
  const [isPublic, setPublic] = useState(item?.isPublic ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) { setError('Título y texto son obligatorios.'); return }
    setBusy(true); setError(null)
    try {
      const input = { title: title.trim(), body: body.trim(), publishDate: publish, expiresOn: emptyToNull(expires), isImportant: important, isPublic }
      if (item) await adminApi.announcements.update(item.id, input); else await adminApi.announcements.create(input)
      onDone()
    } catch (x) { setError(messageOf(x)) } finally { setBusy(false) }
  }
  return (
    <Modal title={item ? 'Editar comunicado' : 'Nuevo comunicado'} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <TextInput label="Título" value={title} onChange={setTitle} maxLength={200} />
        <TextArea label="Texto (sin formato)" value={body} onChange={setBody} maxLength={8000} />
        <div className="form-grid">
          <TextInput label="Se publica el" type="date" value={publish} onChange={setPublish} />
          <TextInput label="Vence el (opcional)" type="date" value={expires} onChange={setExpires} />
        </div>
        <Check label="Importante" checked={important} onChange={setImportant} />
        <Check label="Visible al público" checked={isPublic} onChange={setPublic} />
        {error && <Notice>{error}</Notice>}
        <div className="modal-actions">
          <button type="button" className="rpg-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function AnnouncementsPage({ canEdit }: { canEdit: boolean }) {
  const [page, setPage] = useState(1)
  const list = useAsync(() => adminApi.announcements.list({ page, pageSize: PAGE }), [page])
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const remove = async (a: Announcement) => { setError(null); try { await adminApi.announcements.remove(a.id); list.reload() } catch (x) { setError(messageOf(x)) } }
  return (
    <div>
      {canEdit && <div className="toolbar"><button className="rpg-button btn-primary" onClick={() => setEditing('new')}>Nuevo comunicado</button></div>}
      {(list.error || error) && <Notice>{list.error ?? error}</Notice>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Título</th><th>Publica</th><th>Vence</th><th>Visibilidad</th><th /></tr></thead>
          <tbody>
            {list.data?.items.map((a) => (
              <tr key={a.id}><td>{a.isImportant && <span title="Importante">★ </span>}{a.title}</td><td>{a.publishDate}</td><td>{a.expiresOn ?? '—'}</td><td>{a.isPublic ? 'Público' : 'Interno'}</td>
                <td>{canEdit && <div className="row-actions"><button className="rpg-button" onClick={() => setEditing(a)}>Editar</button><button className="rpg-button" onClick={() => remove(a)}>Eliminar</button></div>}</td></tr>
            ))}
            {list.data?.items.length === 0 && <tr><td colSpan={5} className="muted">No hay comunicados.</td></tr>}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />}
      {editing && <Form item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); list.reload() }} />}
    </div>
  )
}
