import { useState, type FormEvent } from 'react'
import { adminApi } from '../../../services/adminApi.ts'
import { DONATION_METHODS } from '../../../services/adminTypes.ts'
import { formatMoney, MONTHS, todayIso } from '../format.ts'
import { messageOf, useAsync } from '../useAsync.ts'
import { BarChart, Check, Notice, Pager, SelectInput, TextInput } from '../ui.tsx'

const PAGE = 15

export default function DonationsPage() {
  const [date, setDate] = useState(todayIso())
  const [amount, setAmount] = useState('')
  const [concept, setConcept] = useState('')
  const [method, setMethod] = useState('1')
  const [anonymous, setAnonymous] = useState(true)
  const [memberId, setMemberId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [voided, setVoided] = useState(false)
  const [year] = useState(() => new Date().getFullYear())

  const members = useAsync(() => adminApi.members.list({ active: true, pageSize: 100 }), [])
  const list = useAsync(() => adminApi.donations.list({ from, to, includeVoided: voided, page, pageSize: PAGE }), [from, to, voided, page])
  const monthly = useAsync(() => adminApi.donations.monthly(year), [year])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null); setOk(null)
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) { setFormError('Escribe un monto mayor que cero.'); return }
    if (Math.round(value * 100) / 100 !== value) { setFormError('Máximo 2 decimales.'); return }
    if (!concept.trim()) { setFormError('El concepto es obligatorio.'); return }
    if (!anonymous && !memberId) { setFormError('Elige al donante o marca la aportación como anónima.'); return }
    setBusy(true)
    try {
      await adminApi.donations.create({ date, amount: value, concept: concept.trim(), method: Number(method), memberId: anonymous ? null : memberId })
      setAmount(''); setConcept(''); setOk('Aportación registrada.')
      list.reload(); monthly.reload()
    } catch (x) { setFormError(messageOf(x)) } finally { setBusy(false) }
  }
  const voidIt = async (id: string) => {
    setFormError(null)
    try { await adminApi.donations.void(id); list.reload(); monthly.reload() } catch (x) { setFormError(messageOf(x)) }
  }
  const donor = (id: string | null) => members.data?.items.find((m) => m.id === id)?.fullName

  return (
    <div className="grid gap-6">
      <form onSubmit={submit} className="grid gap-3" noValidate aria-label="Nueva aportación">
        <div className="form-grid">
          <TextInput label="Fecha" type="date" value={date} onChange={setDate} />
          <TextInput label="Monto (MXN)" value={amount} onChange={setAmount} maxLength={14} hint="Hasta 2 decimales" />
          <TextInput label="Concepto" value={concept} onChange={setConcept} maxLength={200} />
          <SelectInput label="Método" value={method} onChange={setMethod} options={[1, 2, 3, 4, 5].map((m) => ({ value: String(m), label: DONATION_METHODS[m] }))} />
        </div>
        <Check label="Aportación anónima (no se asocia a ninguna persona)" checked={anonymous} onChange={setAnonymous} />
        {!anonymous && (
          <SelectInput label="Donante" value={memberId} onChange={setMemberId}
            options={[{ value: '', label: 'Elige…' }, ...(members.data?.items ?? []).map((m) => ({ value: m.id, label: m.fullName }))]} />
        )}
        {formError && <Notice>{formError}</Notice>}
        {ok && <Notice kind="ok">{ok}</Notice>}
        <div><button type="submit" className="rpg-button btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Registrar aportación'}</button></div>
      </form>

      <section>
        <h3 className="rpg-title text-xl">Ingresos por mes ({year})</h3>
        {monthly.data && <BarChart title="Total por mes" labels={monthly.data.map((m) => MONTHS[m.month - 1].slice(0, 3))} values={monthly.data.map((m) => m.total)} format={formatMoney} />}
        {monthly.error && <Notice>{monthly.error}</Notice>}
      </section>

      <section>
        <div className="toolbar">
          <div style={{ width: 170 }}><TextInput label="Desde" type="date" value={from} onChange={(v) => { setFrom(v); setPage(1) }} /></div>
          <div style={{ width: 170 }}><TextInput label="Hasta" type="date" value={to} onChange={(v) => { setTo(v); setPage(1) }} /></div>
          <Check label="Incluir anuladas" checked={voided} onChange={(v) => { setVoided(v); setPage(1) }} />
          {list.data && <strong style={{ marginLeft: 'auto' }}>Total: {formatMoney(list.data.totalAmount)}</strong>}
        </div>
        {list.error && <Notice>{list.error}</Notice>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th>Donante</th><th className="num">Monto</th><th /></tr></thead>
            <tbody>
              {list.data?.items.map((d) => (
                <tr key={d.id} style={d.isVoided ? { opacity: 0.5 } : undefined}>
                  <td>{d.date}</td><td>{d.concept}</td><td>{DONATION_METHODS[d.method]}</td>
                  <td>{d.isAnonymous ? <span className="muted">Anónimo</span> : donor(d.memberId) ?? 'Miembro'}</td>
                  <td className="num">{formatMoney(d.amount)}</td>
                  <td>{d.isVoided ? <span className="muted">Anulada</span> : <div className="row-actions"><button className="rpg-button" onClick={() => voidIt(d.id)}>Anular</button></div>}</td>
                </tr>
              ))}
              {list.data?.items.length === 0 && <tr><td colSpan={6} className="muted">No hay aportaciones en este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        {list.data && <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />}
      </section>
    </div>
  )
}
