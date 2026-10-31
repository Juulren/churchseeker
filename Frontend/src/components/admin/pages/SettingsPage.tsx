import { useEffect, useState, type FormEvent } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import { ROLE_VALUES, type ProfileInput } from '../../../services/adminTypes.ts'
import { DAY_NAMES } from '../../rpg-view/format.ts'
import { newPasswordError } from '../../auth/validators.ts'
import { emptyToNull } from '../format.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import { Check, Notice, SelectInput, TextInput } from '../ui.tsx'

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
  if (!f) return <p role="status" className="muted">Cargando…</p>
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
        <label className="grid gap-1">Logotipo (PNG, JPEG o WebP, 2 MB)<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => upload('logo', e.target.files?.[0])} /></label>
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
  const [color, setColor] = useState('#5b3a29')
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
  const remove = async (id: string) => { try { await adminApi.books.remove(id); books.reload() } catch (x) { setMsg({ kind: 'error', text: messageOf(x) }) } }
  return (
    <div className="grid gap-4">
      <form onSubmit={submit} className="grid gap-3" noValidate aria-label="Subir códice">
        <div className="form-grid">
          <TextInput label="Título" value={title} onChange={setTitle} maxLength={200} />
          <TextInput label="Autor" value={author} onChange={setAuthor} maxLength={150} />
          <TextInput label="Color del lomo" type="color" value={color} onChange={setColor} />
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
            {books.data?.map((b) => <tr key={b.id}><td>{b.title}</td><td>{b.author ?? '—'}</td><td>{b.isPublic ? 'Público' : '🔒 Privado'}</td><td><div className="row-actions"><button className="rpg-button" onClick={() => remove(b.id)}>Quitar</button></div></td></tr>)}
            {books.data?.length === 0 && <tr><td colSpan={4} className="muted">Aún no hay códices.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Users() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('3')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const bad = newPasswordError(password)
    if (!email.trim() || !name.trim()) { setMsg({ kind: 'error', text: 'Correo y nombre son obligatorios.' }); return }
    if (bad) { setMsg({ kind: 'error', text: bad }); return }
    setBusy(true); setMsg(null)
    try {
      await adminApi.users.create({ email: email.trim(), fullName: name.trim(), password, role: Number(role) })
      setEmail(''); setName(''); setPassword(''); setMsg({ kind: 'ok', text: 'Usuario creado en tu iglesia.' })
    } catch (x) { setMsg({ kind: 'error', text: messageOf(x) }) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="grid gap-3" noValidate aria-label="Nuevo usuario">
      <div className="form-grid">
        <TextInput label="Correo" type="email" value={email} onChange={setEmail} />
        <TextInput label="Nombre completo" value={name} onChange={setName} maxLength={200} />
        <TextInput label="Contraseña inicial" type="password" value={password} onChange={setPassword} hint="10+ caracteres, mayúscula, minúscula, número y símbolo" />
        <SelectInput label="Rol" value={role} onChange={setRole} options={Object.entries(ROLE_VALUES).map(([label, v]) => ({ value: String(v), label }))} />
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div><button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear usuario'}</button></div>
    </form>
  )
}

export default function SettingsPage() {
  return (
    <div className="grid gap-8">
      <section><h3 className="rpg-title text-xl">Iglesia</h3><Profile /></section>
      <section><h3 className="rpg-title text-xl">Estante de códices</h3><Books /></section>
      <section><h3 className="rpg-title text-xl">Personal con acceso</h3><Users /></section>
    </div>
  )
}
