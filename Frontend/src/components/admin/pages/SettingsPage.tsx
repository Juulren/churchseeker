import { useEffect, useRef, useState, type FormEvent } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import { type ProfileInput } from '../../../services/adminTypes.ts'
import { DAY_NAMES } from '../../rpg-view/format.ts'
import { emptyToNull } from '../format.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import { Check, Loading, Modal, Notice, SelectInput, TextInput } from '../ui.tsx'
import SlideConfirm from '../../ascii/SlideConfirm.tsx'
import { useKit } from '../../ascii/useKit.ts'

/** Drop zone for the logo: a ring of characters, drag a PNG, JPEG or WebP (2 MB) or pick one. */
function LogoDrop({ onFile }: { onFile: (file: File) => void }) {
  const zone = useRef<HTMLDivElement>(null)
  const send = useRef(onFile)
  send.current = onFile
  useKit(zone, (kit, el) => kit.dropzone(el, { maxBytes: 2 * 1024 * 1024, onImage: ({ file }) => { if (file) send.current(file) } }))
  return (
    <div ref={zone} className="dropzone" aria-label="Logotipo">
      <span>Logotipo: arrastra una imagen (PNG, JPEG o WebP, 2 MB) o</span>
      <button type="button" className="rpg-button" data-dropzone="pick">Elegir imagen</button>
    </div>
  )
}

function Profile() {
  const church = useAsync(() => adminApi.church.get(), [])
  const [f, setF] = useState<ProfileInput | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const c = church.data
    if (c) setF({ name: c.name, denomination: c.denomination, patronSaint: c.patronSaint, address: c.address, contactPhone: c.contactPhone, contactEmail: c.contactEmail, latitude: c.latitude, longitude: c.longitude, schedules: c.schedules.map((s) => ({ ...s, time: s.time.slice(0, 5) })) })
  }, [church.data])
  if (church.error) return <Notice>{church.error}</Notice>
  if (!f) return <Loading />
  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setF({ ...f, [k]: v })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      await adminApi.church.update({ ...f, contactPhone: emptyToNull(f.contactPhone ?? ''), contactEmail: emptyToNull(f.contactEmail ?? ''), schedules: f.schedules.map((s) => ({ ...s, time: `${s.time}:00` })) })
      setMsg({ kind: 'ok', text: 'Configuración guardada.' })
    } catch (x) { setMsg({ kind: 'error', text: messageOf(x) }) } finally { setBusy(false) }
  }
  const upload = async (kind: 'logo' | 'model', file: File | undefined) => {
    if (!file) return
    setMsg(null)
    try { await adminApi.church.upload(kind, file); setMsg({ kind: 'ok', text: kind === 'logo' ? 'Logotipo actualizado.' : 'Modelo 3D actualizado.' }) } catch (x) { setMsg({ kind: 'error', text: messageOf(x) }) }
  }
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="form-grid">
        <TextInput label="Nombre" value={f.name} onChange={(v) => set('name', v)} maxLength={200} />
        <TextInput label="Denominación" value={f.denomination} onChange={(v) => set('denomination', v)} maxLength={100} />
        <TextInput label="Santo patrono" value={f.patronSaint} onChange={(v) => set('patronSaint', v)} maxLength={150} />
        <TextInput label="Dirección" value={f.address} onChange={(v) => set('address', v)} maxLength={300} />
        <TextInput label="Teléfono" value={f.contactPhone ?? ''} onChange={(v) => set('contactPhone', v)} maxLength={30} />
        <TextInput label="Correo" type="email" value={f.contactEmail ?? ''} onChange={(v) => set('contactEmail', v)} />
        <TextInput label="Latitud" type="number" step="any" value={String(f.latitude)} onChange={(v) => set('latitude', Number(v))} />
        <TextInput label="Longitud" type="number" step="any" value={String(f.longitude)} onChange={(v) => set('longitude', Number(v))} />
      </div>
      <fieldset className="grid gap-2 border-0 p-0">
        <legend className="rpg-label mb-1">Horarios habituales</legend>
        {f.schedules.map((s, i) => (
          <div key={i} className="toolbar" style={{ marginBottom: 0 }}>
            <div style={{ width: 150 }}><SelectInput label="Día" value={String(s.day)} onChange={(v) => set('schedules', f.schedules.map((x, j) => (j === i ? { ...x, day: Number(v) } : x)))} options={DAY_NAMES.map((d, n) => ({ value: String(n), label: d }))} /></div>
            <div style={{ width: 130 }}><TextInput label="Hora" type="time" value={s.time} onChange={(v) => set('schedules', f.schedules.map((x, j) => (j === i ? { ...x, time: v } : x)))} /></div>
            <div style={{ flex: '1 1 200px' }}><TextInput label="Descripción" value={s.description} onChange={(v) => set('schedules', f.schedules.map((x, j) => (j === i ? { ...x, description: v } : x)))} maxLength={150} /></div>
            <button type="button" className="rpg-button" onClick={() => set('schedules', f.schedules.filter((_, j) => j !== i))} aria-label="Quitar horario">Quitar</button>
          </div>
        ))}
        <div><button type="button" className="rpg-button" disabled={f.schedules.length >= 30} onClick={() => set('schedules', [...f.schedules, { day: 0, time: '09:00', description: '' }])}>Agregar horario</button></div>
      </fieldset>
      <div className="form-grid">
        <LogoDrop onFile={(file) => upload('logo', file)} />
        <label className="grid gap-1">Modelo 3D (.glb, 20 MB)<input className="input" type="file" accept=".glb,model/gltf-binary" onChange={(e) => upload('model', e.target.files?.[0])} /></label>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div><button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button></div>
    </form>
  )
}

function Books() {
  const books = useAsync(() => adminApi.books.list(), [])
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [tone, setTone] = useState('85')
  const color = '#' + Number(tone).toString(16).padStart(2, '0').repeat(3)
  const [thick, setThick] = useState('5')
  const [isPublic, setPublic] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !file) { setMsg({ kind: 'error', text: 'Escribe un título y elige un PDF.' }); return }
    setBusy(true); setMsg(null)
    try {
      await adminApi.books.upload({ title: title.trim(), description: null, author: emptyToNull(author), isPublic, spineColor: color, spineThickness: Number(thick) }, file)
      setTitle(''); setAuthor(''); setFile(null); setMsg({ kind: 'ok', text: 'Códice subido.' }); books.reload()
    } catch (x) { setMsg({ kind: 'error', text: messageOf(x) }) } finally { setBusy(false) }
  }
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null)
  // Slide to confirm, then the row breaks into characters before the codex is removed.
  const remove = async (id: string) => {
    setRemoving(null)
    try {
      // The server removes it first; only then does the row break into characters, so a failure never leaves a hidden row behind.
      await adminApi.books.remove(id)
      const row = document.querySelector<HTMLElement>('[data-book="' + id + '"]')
      if (row) { try { const kit = await import('asciify-engine/kit'); await kit.disintegrate(row, { duration: 620 }) } catch { /* the row just goes */ } }
      books.reload()
    } catch (x) { setMsg({ kind: 'error', text: messageOf(x) }) }
  }
  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className="grid gap-3" noValidate aria-label="Subir códice">
        <div className="form-grid">
          <TextInput label="Título" value={title} onChange={setTitle} maxLength={200} />
          <TextInput label="Autor" value={author} onChange={setAuthor} maxLength={150} />
          <TextInput label="Tono del lomo (de oscuro a claro)" type="range" min="20" max="235" step="5" value={tone} onChange={setTone} />
          <TextInput label="Grosor del lomo (1 a 10)" type="number" min="1" step="1" value={thick} onChange={setThick} />
        </div>
        <label className="grid gap-1">Archivo PDF (máx. 25 MB; sin scripts ni archivos incrustados)<input className="input" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <Check label="Público (si no, solo lo ve el personal de la iglesia)" checked={isPublic} onChange={setPublic} />
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div><button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Subiendo…' : 'Subir códice'}</button></div>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Título</th><th>Autor</th><th>Visibilidad</th><th /></tr></thead>
          <tbody>
            {books.data?.map((b) => <tr key={b.id} data-book={b.id}><td>{b.title}</td><td>{b.author ?? '—'}</td><td>{b.isPublic ? 'Público' : '🔒 Privado'}</td><td><div className="row-actions"><button className="rpg-button" onClick={() => setRemoving({ id: b.id, title: b.title })}>Quitar</button></div></td></tr>)}
            {books.data?.length === 0 && <tr><td colSpan={4} className="muted">Aún no hay códices.</td></tr>}
          </tbody>
        </table>
      </div>
      {removing && (
        <Modal title="Quitar códice" onClose={() => setRemoving(null)}>
          <p>Se quitará «{removing.title}» del estante.</p>
          <SlideConfirm label="Desliza para quitar" doneLabel="Quitado" onConfirm={() => void remove(removing.id)} />
          <div className="modal-actions"><button type="button" className="rpg-button" onClick={() => setRemoving(null)}>Cancelar</button></div>
        </Modal>
      )}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="grid gap-8">
      <section><h3 className="rpg-title text-xl">Iglesia</h3><Profile /></section>
      <section><h3 className="rpg-title text-xl">Estante de códices</h3><Books /></section>
    </div>
  )
}
