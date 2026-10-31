import type { ReactNode } from 'react'
import type { ChurchProfile, PublicAnnouncement, PublicEvent } from '../../services/types.ts'
import type { Section } from './churchData.ts'
import { formatDate, formatShortDate, formatTime, groupEventsByDate, scheduleLabel } from './format.ts'

const dim = { color: 'var(--ink-dim)' } as const

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 border-b-2 pb-1 text-2xl" style={{ color: 'var(--accent)', borderColor: 'var(--panel-edge)' }}>{children}</h3>
}

function State<T>({ section, loading, empty, children }: { section: Section<T> | undefined; loading: boolean; empty: string; children: (data: T) => ReactNode }) {
  if (loading || !section) return <p style={dim}>Cargando…</p>
  if (section.error) return <p role="alert">{section.error}</p>
  const data = section.data
  if (data === null || (Array.isArray(data) && data.length === 0)) return <p style={dim}>{empty}</p>
  return <>{children(data)}</>
}

// Only digits and + survive, so the link can never carry anything but a phone number.
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/

export function InfoPanel({ section, loading }: { section: Section<ChurchProfile> | undefined; loading: boolean }) {
  return (
    <div className="rpg-panel p-4">
      <PanelTitle>Información</PanelTitle>
      <State section={section} loading={loading} empty="Sin información.">
        {(p) => (
          <dl className="grid gap-1">
            <div><dt style={dim}>Dirección</dt><dd>{p.address}</dd></div>
            {p.contactPhone && <div><dt style={dim}>Teléfono</dt><dd><a href={telHref(p.contactPhone)} className="underline">{p.contactPhone}</a></dd></div>}
            {p.contactEmail && EMAIL.test(p.contactEmail) && <div><dt style={dim}>Correo</dt><dd><a href={`mailto:${p.contactEmail}`} className="underline">{p.contactEmail}</a></dd></div>}
            <div>
              <dt style={dim}>Horarios habituales</dt>
              <dd>
                {p.schedules.length === 0 ? <span style={dim}>Consulta los próximos eventos.</span> : (
                  <ul>{p.schedules.map((s, i) => <li key={i}>{scheduleLabel(s)}</li>)}</ul>
                )}
              </dd>
            </div>
          </dl>
        )}
      </State>
    </div>
  )
}

function EventItem({ e }: { e: PublicEvent }) {
  return (
    <li className="mb-2" style={e.isCancelled ? { opacity: 0.6 } : undefined}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span style={{ color: 'var(--accent)' }}>{formatTime(e.time)}</span>
        <strong className={e.isCancelled ? 'line-through' : ''}>{e.title}</strong>
        {e.isCancelled && <span className="rpg-button" style={{ padding: '0 0.4rem', cursor: 'default' }}>Cancelado</span>}
      </div>
      <div style={dim}>{e.location}</div>
      {e.description && <p className="whitespace-pre-wrap">{e.description}</p>}
    </li>
  )
}

export function EventsPanel({ section, loading }: { section: Section<PublicEvent[]> | undefined; loading: boolean }) {
  return (
    <section aria-labelledby="events-title">
      <PanelTitle><span id="events-title">Próximos eventos</span></PanelTitle>
      <State section={section} loading={loading} empty="No hay eventos públicos próximos.">
        {(events) => (
          <div>
            {groupEventsByDate(events).map((g) => (
              <div key={g.date} className="mb-3">
                <h4 className="text-xl" title={formatDate(g.date)}>{formatShortDate(g.date)} <span style={dim}>· {formatDate(g.date)}</span></h4>
                <ul>{g.events.map((e) => <EventItem key={e.id} e={e} />)}</ul>
              </div>
            ))}
          </div>
        )}
      </State>
    </section>
  )
}

export function NewsPanel({ section, loading }: { section: Section<PublicAnnouncement[]> | undefined; loading: boolean }) {
  return (
    <section aria-labelledby="news-title">
      <PanelTitle><span id="news-title">Avisos</span></PanelTitle>
      <State section={section} loading={loading} empty="No hay avisos por ahora.">
        {(items) => (
          <ul>
            {items.map((a) => (
              <li key={a.id} className="mb-3">
                <strong>{a.isImportant && <span title="Importante" style={{ color: 'var(--accent)' }}>★ </span>}{a.title}</strong>
                <span style={dim}> · {formatShortDate(a.publishDate)}</span>
                <p className="whitespace-pre-wrap">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </State>
    </section>
  )
}
