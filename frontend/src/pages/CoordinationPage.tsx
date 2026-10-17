import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  ArrowRightIcon, CheckCircleIcon, ClockCounterClockwiseIcon, MapPinIcon, SirenIcon, TruckIcon,
  WarningIcon, XIcon,
} from '@phosphor-icons/react'
import { api, polling } from '../api'
import { EmptyState, ErrorMessage, Pill, Skeleton } from '../components'
import { eventLabels, incidentStatusLabels, kindLabels, label, scoreText, when } from '../labels'
import type { Community, Detail, DistributionPlan, Execution, Incident, IncidentTimelineEvent } from '../types'
import { MapPanel } from './MapPanel'
import { PlanPanel } from './PlanPanel'
import { placeName, type Lookups } from '../lookups'
import { ReportsPanel, type ReportFilter } from './ReportsPanel'

type Tab = 'overview' | 'reports' | 'incidents' | 'plan' | 'map'

const sourceLabels: Record<string, string> = {
  report: 'Reporte', trace: 'Sistema', review: 'Coordinación', plan: 'Plan de cisternas', notification: 'Aviso',
}

function IncidentTimelineModal({ incidentId, token, lookups, onClose }: {
  incidentId: string; token: string; lookups: Lookups; onClose: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)
  const query = useQuery({
    queryKey: ['admin', 'incidents', incidentId, 'timeline'],
    queryFn: () => api<IncidentTimelineEvent[]>(`/admin/incidents/${incidentId}/timeline`, {}, token),
  })
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      // Keep keyboard focus inside the dialog while it is open.
      const items = [...(close.current?.closest('[role=dialog]')?.querySelectorAll<HTMLElement>('button, summary') ?? [])]
      const [first, last] = [items[0], items[items.length - 1]]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus() }
  }, [onClose])
  const incident = lookups.incident(incidentId)
  const community = incident && lookups.community(incident.community_id)

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="timeline-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="stack-sm">
            <h2 id="timeline-title">Historial del incidente</h2>
            <p className="muted small">{community ? `${community.name}, ${community.district}` : <code>{incidentId}</code>}</p>
          </div>
          <button ref={close} type="button" className="secondary small" onClick={onClose}>
            <XIcon aria-hidden="true" /> Cerrar
          </button>
        </div>
        {query.isPending && <div role="status" aria-label="Cargando historial"><Skeleton lines={5} /></div>}
        <ErrorMessage error={query.error} />
        {query.data?.length === 0 && <EmptyState title="Sin eventos registrados para este incidente" />}
        {query.data && query.data.length > 0 && (
          <ol className="trace">
            {query.data.map((evt, idx) => (
              <li key={idx} className={evt.source === 'trace' ? '' : 'audit'}>
                <div className="trace-line">
                  <span className="agent">{sourceLabels[evt.source] ?? evt.source}</span>
                  <span>{label(eventLabels, evt.event)}</span>
                  <code>{evt.event}</code>
                </div>
                <span className="small">{evt.summary}</span>
                <time>{when(evt.timestamp)}</time>
                {evt.detail && Object.keys(evt.detail).length > 0 && (
                  <details className="inline">
                    <summary>Ver datos</summary>
                    <pre>{JSON.stringify(evt.detail, null, 2)}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function Overview({ executions, details, incidents, plan, lookups, go }: {
  executions?: Execution[]; details: Record<string, Detail | undefined>; incidents?: Incident[]
  plan?: DistributionPlan | null; lookups: Lookups
  go: (tab: Tab, filter?: ReportFilter, select?: string) => void
}) {
  const list = executions ?? []
  const count = (status: string) => list.filter(e => e.status === status).length
  const waiting = list.filter(e => e.status === 'WAITING_APPROVAL')
  // Order the queue by what the system itself computed: critical alert first, then highest possible score.
  const queue = [...waiting].sort((a, b) => {
    const pa = details[a.id]?.proposal?.priority, pb = details[b.id]?.proposal?.priority
    return Number(!!pb?.immediate_review) - Number(!!pa?.immediate_review) || (pb?.score_max ?? -1) - (pa?.score_max ?? -1)
  })
  const critical = waiting.filter(e => details[e.id]?.proposal?.priority.immediate_review)
  const incomplete = waiting.filter(e => details[e.id]?.proposal?.priority.flags.includes('DATOS_INCOMPLETOS'))
  const unserved = plan?.result?.unserved ?? []
  const attention: { tone: string; icon: ReactNode; title: string; text: string; action: string; onClick: () => void }[] = []

  if (critical.length) attention.push({ tone: 'danger', icon: <SirenIcon />, title: `${critical.length} ${critical.length === 1 ? 'reporte afecta' : 'reportes afectan'} a una institución crítica`,
    text: 'Hospitales, centros de salud, escuelas o asilos esperando tu revisión.', action: 'Revisar', onClick: () => go('reports', 'waiting', queue[0]?.id) })
  if (waiting.length) attention.push({ tone: 'warn', icon: <ClockCounterClockwiseIcon />, title: `${waiting.length} ${waiting.length === 1 ? 'reporte espera' : 'reportes esperan'} tu decisión`,
    text: incomplete.length ? `${incomplete.length} con información incompleta: la prioridad es un rango.` : 'Aprueba, corrige o rechaza la prioridad propuesta.',
    action: 'Ir a la cola', onClick: () => go('reports', 'waiting', queue[0]?.id) })
  if (count('ERROR')) attention.push({ tone: 'danger', icon: <WarningIcon />, title: `${count('ERROR')} ${count('ERROR') === 1 ? 'análisis falló' : 'análisis fallaron'}`,
    text: 'Puedes reintentarlos; el reporte ya está guardado.', action: 'Ver errores', onClick: () => go('reports', 'error') })
  if (plan?.status === 'PROPOSED') attention.push({ tone: 'warn', icon: <TruckIcon />, title: 'Un plan de cisternas espera tu aprobación',
    text: 'Revisa qué comunidades cubre y cuáles quedan sin atender antes de aprobarlo.', action: 'Revisar plan', onClick: () => go('plan') })
  else if (plan && ['QUEUED', 'RUNNING'].includes(plan.status)) attention.push({ tone: 'neutral', icon: <TruckIcon />, title: 'El planificador está calculando un plan',
    text: 'Aparecerá para tu revisión en unos segundos.', action: 'Ver plan', onClick: () => go('plan') })
  if (plan?.status !== 'PROPOSED' && unserved.length) attention.push({ tone: 'warn', icon: <MapPinIcon />, title: `${unserved.length} ${unserved.length === 1 ? 'comunidad quedó' : 'comunidades quedaron'} sin cobertura completa`,
    text: `En el último plan (${plan?.status === 'APPROVED' ? 'aprobado' : plan?.status === 'REJECTED' ? 'rechazado' : 'propuesto'}).`, action: 'Ver detalle', onClick: () => go('plan') })

  const incidentCount = (status: string) => (incidents ?? []).filter(i => i.status === status).length

  return (
    <div className="overview">
      <section aria-labelledby="attention-title" className="stack">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div>
            <h2 id="attention-title">Requiere tu atención</h2>
            <p>Calculado sobre los 25 reportes más recientes y el último plan de cisternas.</p>
          </div>
        </div>
        {executions === undefined ? <div className="panel"><Skeleton lines={4} /></div> : attention.length ? (
          <div className="attention">
            {attention.map(item => (
              <div key={item.title} className={`attention-item ${item.tone}`}>
                <span className="icon" aria-hidden="true">{item.icon}</span>
                <div><h3>{item.title}</h3><p>{item.text}</p></div>
                <button type="button" className="secondary small" onClick={item.onClick}>{item.action} <ArrowRightIcon aria-hidden="true" /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel"><EmptyState icon={<CheckCircleIcon />} title="Nada pendiente por ahora">
            No hay reportes esperando decisión ni planes por revisar. Esta vista se actualiza sola cada pocos segundos.
          </EmptyState></div>
        )}

        {queue.length > 0 && (
          <section className="panel stack-sm" aria-labelledby="queue-title">
            <h3 id="queue-title">Revisar primero</h3>
            <p className="hint">Ordenados por alerta de institución crítica y luego por la puntuación máxima posible.</p>
            <ul className="queue">
              {queue.slice(0, 6).map(e => {
                const detail = details[e.id]
                const p = detail?.proposal?.priority
                return (
                  <li key={e.id}>
                    <button type="button" className="item" onClick={() => go('reports', 'waiting', e.id)}>
                      <span className="item-top">
                        <span className="item-title">{placeName(detail, lookups)}</span>
                        {p && <span className="num"><strong>{scoreText(p.score_min, p.score_max)}</strong></span>}
                      </span>
                      <span className="item-meta">
                        {p?.immediate_review && <span className="alert"><SirenIcon aria-hidden="true" /> Institución crítica</span>}
                        {p && p.score_min !== p.score_max && <span>Información incompleta</span>}
                        <span>{when(e.created_at)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </section>

      <aside className="stack" aria-label="Situación">
        <section className="stack-sm" aria-labelledby="reports-figures">
          <h3 id="reports-figures">Reportes recientes</h3>
          <div className="figures">
            <div className="figure"><strong>{count('WAITING_APPROVAL')}</strong><span>Pendientes de revisión</span></div>
            <div className="figure"><strong>{count('QUEUED') + count('RUNNING') + count('RESUME_QUEUED')}</strong><span>En análisis</span></div>
            <div className="figure"><strong>{count('APPROVED')}</strong><span>Prioridad aprobada</span></div>
            <div className="figure"><strong>{count('REJECTED') + count('NEEDS_INFORMATION') + count('ERROR')}</strong><span>Rechazados, sin datos o con error</span></div>
          </div>
          <p className="hint">{list.length === 25 ? 'Los 25 más recientes; hay más en la pestaña Reportes.' : `Total: ${list.length} reportes.`}</p>
        </section>
        <section className="stack-sm" aria-labelledby="incident-figures">
          <h3 id="incident-figures">Incidentes</h3>
          <div className="figures">
            <div className="figure"><strong>{incidentCount('OPEN')}</strong><span>Abiertos</span></div>
            <div className="figure"><strong>{incidentCount('PRIORITIZED')}</strong><span>Prioridad aprobada</span></div>
            <div className="figure"><strong>{incidentCount('SCHEDULED')}</strong><span>Cisterna programada</span></div>
            <div className="figure"><strong>{incidentCount('CLOSED')}</strong><span>Cerrados</span></div>
          </div>
          <p className="hint">Varios reportes del mismo lugar se agrupan en un incidente. Últimos {incidents?.length ?? 0} con actividad.</p>
        </section>
      </aside>
    </div>
  )
}

function IncidentsPanel({ token, lookups, onViewTimeline }: { token: string; lookups: Lookups; onViewTimeline: (id: string) => void }) {
  const [page, setPage] = useState(0)
  const incidents = useQuery({
    queryKey: ['admin', 'incidents', page],
    queryFn: () => api<Incident[]>(`/admin/incidents?offset=${page * 25}&limit=25`, {}, token),
    refetchInterval: 5000,
  })
  return (
    <section aria-labelledby="incidents-title">
      <div className="section-head">
        <div>
          <h2 id="incidents-title">Incidentes</h2>
          <p>Reportes del mismo lugar y tipo agrupados por el sistema, para no contar dos veces el mismo problema. Ordenados por actividad reciente.</p>
        </div>
      </div>
      {incidents.isPending && <div className="panel" role="status" aria-label="Cargando incidentes"><Skeleton lines={5} /></div>}
      <ErrorMessage error={incidents.error} />
      {incidents.data?.length === 0 && <div className="panel"><EmptyState icon={<MapPinIcon />} title="Sin incidentes en esta página" /></div>}
      <ul className="incidents">
        {incidents.data?.map(i => {
          const community = lookups.community(i.community_id)
          return (
            <li key={i.id} className="incident">
              <div className="spread">
                <div className="stack-sm" style={{ gap: 2 }}>
                  <h3>{community?.name ?? i.community_id}</h3>
                  {community && <span className="small muted">Distrito de {community.district}</span>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Pill>{label(kindLabels, i.kind)}</Pill>
                  <Pill tone={i.status === 'OPEN' ? 'warn' : i.status === 'CLOSED' ? 'neutral' : 'ok'}>{label(incidentStatusLabels, i.status)}</Pill>
                </div>
              </div>
              <p>{i.summary}</p>
              <div className="spread small muted">
                <span>Código <code>{i.id.slice(0, 8)}</code></span>
                <button type="button" className="ghost small" onClick={() => onViewTimeline(i.id)}>
                  <ClockCounterClockwiseIcon aria-hidden="true" /> Historial
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="pager">
        <button type="button" className="secondary small" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
        <span>Página {page + 1}</span>
        <button type="button" className="secondary small" disabled={(incidents.data?.length || 0) < 25} onClick={() => setPage(page + 1)}>Siguiente</button>
      </div>
    </section>
  )
}

export function CoordinationPage({ token, onUnauthorized }: { token: string; onUnauthorized?: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<ReportFilter>('all')
  const [page, setPage] = useState(0)
  const [timelineIncidentId, setTimelineIncidentId] = useState<string | null>(null)
  const [mapPlan, setMapPlan] = useState<string | null>(null)
  const closeTimeline = useCallback(() => setTimelineIncidentId(null), [])

  const executions = useQuery({
    queryKey: ['admin', 'executions', page],
    queryFn: () => api<Execution[]>(`/admin/executions?offset=${page * 25}&limit=25`, {}, token),
    refetchInterval: 5000,
  })
  const recent = useQuery({
    queryKey: ['admin', 'executions', 0],
    queryFn: () => api<Execution[]>('/admin/executions?offset=0&limit=25', {}, token),
    refetchInterval: 5000,
  })
  // Lookup only: the admin API returns incident and community ids, the UI shows their names.
  // shortcut: only the 100 most recent incidents resolve to a place name (API max limit); older
  // ones show "Ubicación no disponible", see docs/UI.md.
  const incidents = useQuery({
    queryKey: ['admin', 'incidents', 'lookup'],
    queryFn: () => api<Incident[]>('/admin/incidents?offset=0&limit=100', {}, token),
    refetchInterval: 10000,
  })
  const communities = useQuery({ queryKey: ['communities'], queryFn: () => api<Community[]>('/communities') })
  const plan = useQuery({
    queryKey: ['admin', 'plan'],
    queryFn: () => api<DistributionPlan | null>('/admin/plans/latest', {}, token),
    refetchInterval: query => ['QUEUED', 'RUNNING'].includes(query.state.data?.status ?? '') ? 1500 : 10000,
  })

  // shortcut: one detail request per listed report (max 50 on screen); a list endpoint with
  // place and score would replace this, see docs/UI.md.
  const visible = useMemo(() => {
    const ids = new Map<string, Execution>()
    for (const e of [...(recent.data ?? []), ...(executions.data ?? [])]) ids.set(e.id, e)
    return [...ids.values()]
  }, [recent.data, executions.data])
  const detailQueries = useQueries({
    queries: visible.map(e => ({
      queryKey: ['admin', 'detail', e.id],
      queryFn: () => api<Detail>(`/admin/executions/${e.id}`, {}, token),
      // A pending review does not change by itself: refetch only while the list shows a newer status.
      refetchInterval: (q: { state: { data?: Detail } }) => {
        const status = q.state.data?.status
        if (status && status !== e.status) return 1000
        return status === 'WAITING_APPROVAL' ? false : polling(status ?? e.status)
      },
    })),
  })
  const details: Record<string, Detail | undefined> = {}
  visible.forEach((e, i) => { details[e.id] = detailQueries[i]?.data })

  const lookups: Lookups = useMemo(() => {
    const c = new Map((communities.data ?? []).map(x => [x.id, x]))
    const inc = new Map((incidents.data ?? []).map(x => [x.id, x]))
    return { community: id => c.get(id), incident: id => inc.get(id) }
  }, [communities.data, incidents.data])

  const unauthorized = [executions.error, recent.error, incidents.error, plan.error]
    .some(e => (e as { status?: number } | null)?.status === 401)
  useEffect(() => { if (unauthorized) onUnauthorized?.() }, [unauthorized, onUnauthorized])

  const go = (next: Tab, nextFilter?: ReportFilter, select?: string) => {
    setTab(next)
    if (nextFilter) { setFilter(nextFilter); setPage(0) }
    if (select) setSelected(select)
  }

  const pending = recent.data?.filter(e => e.status === 'WAITING_APPROVAL').length ?? 0
  const tabs: [Tab, string, number][] = [
    ['overview', 'Resumen', 0],
    ['reports', 'Reportes', pending],
    ['incidents', 'Incidentes', 0],
    ['plan', 'Cisternas', plan.data?.status === 'PROPOSED' ? 1 : 0],
    ['map', 'Mapa', 0],
  ]
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return
    const index = tabs.findIndex(([value]) => value === tab)
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length][0]
    setTab(next)
    setMapPlan(null)
    document.getElementById(`tab-${next}`)?.focus()
  }

  return (
    <section className="coordination">
      <header className="console-head">
        <h1>Coordinación del suministro</h1>
        <p>Revisa reportes, decide prioridades y aprueba planes de cisternas. La IA propone; cada decisión es tuya y queda registrada.</p>
      </header>

      <div className="tabs" role="tablist" aria-label="Secciones de coordinación" onKeyDown={onTabKey}>
        {tabs.map(([value, text, badge]) => (
          <button key={value} id={`tab-${value}`} type="button" role="tab" aria-selected={tab === value}
            aria-controls={`panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => { setTab(value); setMapPlan(null) }}>
            {text}
            {badge > 0 && <span className="count-badge" aria-label={`${badge} pendientes`}>{badge}</span>}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-panel" key={tab}>
        {tab === 'overview' && (
          <>
            <ErrorMessage error={recent.error} />
            <Overview executions={recent.data} details={details} incidents={incidents.data} plan={plan.data}
              lookups={lookups} go={go} />
          </>
        )}
        {tab === 'reports' && (
          <ReportsPanel token={token} lookups={lookups} executions={executions} details={details}
            page={page} setPage={p => { setPage(p) }} filter={filter} setFilter={setFilter}
            selected={selected} setSelected={setSelected} onViewTimeline={setTimelineIncidentId} />
        )}
        {tab === 'incidents' && <IncidentsPanel token={token} lookups={lookups} onViewTimeline={setTimelineIncidentId} />}
        {tab === 'plan' && <PlanPanel token={token} lookups={lookups} onShowMap={id => { setMapPlan(id); setTab('map') }} />}
        {tab === 'map' && <MapPanel token={token} initialPlan={mapPlan} />}
      </div>

      {timelineIncidentId && (
        <IncidentTimelineModal incidentId={timelineIncidentId} token={token} lookups={lookups}
          onClose={closeTimeline} />
      )}
    </section>
  )
}
