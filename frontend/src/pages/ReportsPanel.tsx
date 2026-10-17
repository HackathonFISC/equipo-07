import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftIcon, ArrowsClockwiseIcon, CaretRightIcon, ClockCounterClockwiseIcon, InfoIcon, MagnifyingGlassIcon,
  SirenIcon, TrayIcon, WarningIcon,
} from '@phosphor-icons/react'
import { api, polling } from '../api'
import { EmptyState, ErrorMessage, FactorList, Pill, PriorityRange, Skeleton, StatusBadge } from '../components'
import {
  associationLabels, confidenceLabels, decisionLabels, eventLabels, factorInfo, flagLabels,
  incidentStatusLabels, kindLabels, label, scoreText, when,
} from '../labels'
import type { Detail, Execution, IncidentTimelineEvent, Review } from '../types'
import { placeName, placeOf, type Lookups } from '../lookups'

export type ReportFilter = 'all' | 'waiting' | 'error' | 'approved'

const filters: [ReportFilter, string][] = [
  ['waiting', 'Pendientes'], ['error', 'Con error'], ['approved', 'Aprobados'], ['all', 'Todos'],
]

const matches = (filter: ReportFilter, e: Execution) =>
  filter === 'all' || e.status === { waiting: 'WAITING_APPROVAL', error: 'ERROR', approved: 'APPROVED' }[filter]

function ReviewPanel({ detail, token }: { detail: Detail; token: string }) {
  const client = useQueryClient()
  const [decision, setDecision] = useState<Review['decision']>('APPROVE')
  const [reason, setReason] = useState('')
  const [score, setScore] = useState('')
  const [association, setAssociation] = useState<Review['association']>()
  const [confirming, setConfirming] = useState(false)

  const p = detail.proposal?.priority
  const hasRange = p ? p.score_min !== p.score_max : false
  const defaultApproved = p ? Math.round((p.score_min + p.score_max) / 2) : 0
  const [approvedScore, setApprovedScore] = useState<number>(defaultApproved)
  const tentative = detail.association?.status === 'PENDING_REVIEW'

  const mutation = useMutation({
    mutationFn: () => api(`/executions/${detail.id}/resume`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        reason,
        ...(decision === 'CORRECT' ? { corrected_score: Number(score) } : {}),
        ...(decision === 'APPROVE' && hasRange ? { approved_score: Number(approvedScore) } : {}),
        ...(association ? { association } : {}),
      }),
    }, token),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin'] }),
  })

  const finalScore = decision === 'CORRECT' ? (score || '…') : hasRange ? approvedScore : p?.score_min
  const consequence = decision === 'REJECT'
    ? `No se fija ninguna prioridad y el incidente no entra al plan de cisternas.${tentative ? ' El reporte no se une al incidente propuesto.' : ''}`
    : `La prioridad queda fijada en ${finalScore} pts y el incidente pasa a «Prioridad aprobada», listo para el próximo plan de cisternas. Esto no aprueba ningún plan de distribución.`
  const edit = (apply: () => void) => { apply(); setConfirming(false) }

  if (mutation.isSuccess) {
    return (
      <p className="note ok" role="status">
        <InfoIcon aria-hidden="true" />
        Decisión registrada. El sistema la está aplicando; el estado se actualizará en unos segundos.
      </p>
    )
  }

  return (
    <form className="decision" aria-labelledby="decision-title" onSubmit={e => { e.preventDefault(); setConfirming(true) }}>
      <div className="decision-head">
        <h3 id="decision-title">Revisión humana</h3>
        <p className="muted small">Tu decisión queda registrada con su razón y no se puede modificar después.</p>
      </div>

      <fieldset disabled={confirming || mutation.isPending} className="stack">
        <div className="choices cols" role="radiogroup" aria-label="Decisión">
          {([
            ['APPROVE', 'Aprobar prioridad', hasRange ? `Eliges un valor entre ${p?.score_min} y ${p?.score_max} pts` : `Se fija en ${p?.score_min} pts`],
            ['CORRECT', 'Corregir puntuación', 'Indicas otra puntuación de 0 a 100'],
            ['REJECT', 'Rechazar propuesta', 'No se fija prioridad'],
          ] as const).map(([value, title, help]) => (
            <label key={value} className={`choice ${value === 'REJECT' ? 'danger' : ''}`}>
              <input type="radio" name="decision" value={value} checked={decision === value}
                onChange={() => edit(() => setDecision(value))} />
              <span className="choice-body"><span>{title}</span><small>{help}</small></span>
            </label>
          ))}
        </div>

        {decision === 'APPROVE' && hasRange && (
          <div className="field">
            <label htmlFor="approved-score">Puntuación aprobada</label>
            <input id="approved-score" required type="number" min={p?.score_min} max={p?.score_max} step="1"
              value={approvedScore} aria-describedby="approved-help" className="num" style={{ maxWidth: 160 }}
              onChange={e => edit(() => setApprovedScore(Number(e.target.value)))} />
            <span id="approved-help" className="hint">
              La propuesta es un rango ({p?.score_min} a {p?.score_max} pts) porque faltan datos. Elige el valor que respalde tu verificación.
            </span>
          </div>
        )}

        {decision === 'CORRECT' && (
          <div className="field">
            <label htmlFor="corrected-score">Puntuación corregida</label>
            <input id="corrected-score" required type="number" min="0" max="100" step="1" value={score}
              placeholder="0 a 100" className="num" style={{ maxWidth: 160 }}
              onChange={e => edit(() => setScore(e.target.value))} />
          </div>
        )}

        {tentative && decision !== 'REJECT' && (
          <fieldset className="stack-sm">
            <legend>¿Es el mismo problema que el incidente existente?</legend>
            <p className="hint">{detail.association?.reasoning}</p>
            <div className="choices cols">
              <label className="choice">
                <input type="radio" name="association" required checked={association === 'CONFIRM'}
                  onChange={() => edit(() => setAssociation('CONFIRM'))} />
                <span className="choice-body"><span>Sí, es el mismo incidente</span><small>Se une al incidente existente</small></span>
              </label>
              <label className="choice">
                <input type="radio" name="association" required checked={association === 'NEW'}
                  onChange={() => edit(() => setAssociation('NEW'))} />
                <span className="choice-body"><span>No, es un incidente distinto</span><small>Se crea un incidente nuevo</small></span>
              </label>
            </div>
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="decision-reason">Razón de la decisión</label>
          <textarea id="decision-reason" required minLength={5} maxLength={600} rows={3} value={reason}
            aria-describedby="reason-help" onChange={e => edit(() => setReason(e.target.value))}
            placeholder="Ejemplo: verificado con la junta comunal y el IDAAN regional." />
          <span id="reason-help" className="hint">Queda en el registro de auditoría. Mínimo 5 caracteres.</span>
        </div>

        <p className="consequence"><strong>Qué pasará: </strong>{consequence}</p>
      </fieldset>

      {confirming ? (
        <div className={`confirm ${decision === 'REJECT' ? 'danger' : ''}`} role="group" aria-labelledby="confirm-title">
          <strong id="confirm-title">
            ¿Confirmas {decision === 'APPROVE' ? `aprobar con ${finalScore} pts` : decision === 'CORRECT' ? `corregir a ${finalScore} pts` : 'rechazar la propuesta'}?
          </strong>
          <ErrorMessage error={mutation.error} />
          <div className="confirm-actions">
            <button type="button" className={decision === 'REJECT' ? 'danger' : ''} disabled={mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Registrando…' : 'Confirmar decisión'}
            </button>
            <button type="button" className="secondary" disabled={mutation.isPending}
              onClick={() => { setConfirming(false); mutation.reset() }}>
              Volver a editar
            </button>
          </div>
        </div>
      ) : (
        <button type="submit" style={{ justifySelf: 'start' }}>Registrar decisión</button>
      )}
    </form>
  )
}

function Evidence({ items }: { items: NonNullable<Detail['evidence']> }) {
  return (
    <section className="stack-sm" aria-label="Evidencia del ciudadano">
      <h3>Evidencia enviada por el ciudadano</h3>
      <ul className="served">
        {items.map((item, i) => (
          <li key={i}>
            <span>
              <strong>{item.kind === 'image' ? 'Foto' : item.kind === 'voice' || item.kind === 'audio' ? 'Audio (sin transcribir)' : 'Archivo'}</strong>
              <span className="muted small"> por {item.channel === 'whatsapp' ? 'WhatsApp' : item.channel === 'telegram' ? 'Telegram' : item.channel}</span>
            </span>
            <Pill tone={item.status === 'STORED' ? 'ok' : 'warn'}>{item.status === 'STORED' ? 'Guardado' : 'No guardado'}</Pill>
            <span className="why">
              {item.analysis?.status === 'DONE' && (
                <>
                  {item.analysis.simulated ? 'Simulación' : `Análisis de IA (${item.analysis.model})`}: {item.analysis.description}{' '}
                  <em>
                    {item.analysis.relevant === true ? '(relevante para el reporte)'
                      : item.analysis.relevant === false ? '(no parece relacionada con el agua)' : ''}
                  </em>
                </>
              )}
              {item.analysis?.status === 'ERROR' && `Análisis no disponible (${item.analysis.error}).`}
              {item.kind === 'image' && item.status === 'STORED' && !item.analysis && 'Análisis en curso…'}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">El análisis es orientativo: no cambia el tipo, las horas ni el puntaje. Decide la persona coordinadora.</p>
    </section>
  )
}

function ExecutionDetail({ id, token, lookups, onViewTimeline }: {
  id: string; token: string; lookups: Lookups; onViewTimeline: (incidentId: string) => void
}) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['admin', 'detail', id],
    queryFn: () => api<Detail>(`/admin/executions/${id}`, {}, token),
    refetchInterval: q => polling(q.state.data?.status),
  })
  const incidentId = query.data?.proposal?.incident_id
  // The admin API has no report endpoint: the stated hours come from the incident timeline.
  const timeline = useQuery({
    queryKey: ['admin', 'incidents', incidentId, 'timeline'], enabled: !!incidentId,
    queryFn: () => api<IncidentTimelineEvent[]>(`/admin/incidents/${incidentId}/timeline`, {}, token),
  })
  const retry = useMutation({
    mutationFn: () => api(`/executions/${id}/retry`, { method: 'POST' }, token),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin'] }),
  })

  if (query.isPending) return <div className="panel" role="status" aria-label="Cargando reporte"><Skeleton lines={6} /></div>
  if (!query.data) return <ErrorMessage error={query.error} />

  const detail = query.data
  const proposal = detail.proposal
  const priority = proposal?.priority
  const { incident, community, name } = placeOf(detail, lookups)
  const reports = timeline.data?.filter(e => e.source === 'report') ?? []
  const hours = reports.find(e => e.detail.report_id === detail.report_id)?.detail.hours_without_water as number | null | undefined
  const unknown = priority ? Object.entries(priority.factors).filter(([, [a, b]]) => a !== b).map(([k]) => factorInfo[k]?.label ?? k) : []

  return (
    <article className="panel detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <div className="spread">
          <span className="kicker">Reporte {detail.id.slice(0, 8)}</span>
          <StatusBadge status={detail.status} />
        </div>
        <h2 id="detail-title">{name ?? (proposal ? 'Ubicación fuera de la vista' : 'Reporte sin propuesta todavía')}</h2>
        <div className="row small muted">
          {community && <span>Distrito de {community.district}</span>}
          {incident && <Pill>{label(kindLabels, incident.kind)}</Pill>}
          <span>Recibido {when(detail.created_at)}</span>
        </div>
      </header>

      <ErrorMessage error={query.error} />

      {priority?.immediate_review && (
        <div className="critical" role="alert">
          <SirenIcon aria-hidden="true" />
          <div><strong>Institución crítica: revisar de inmediato.</strong>
            <p className="small">El reporte afecta a un hospital, centro de salud, escuela o asilo según el texto o el catálogo.</p></div>
        </div>
      )}

      {incident && (
        <dl className="facts">
          <div><dt>Tiempo sin agua indicado</dt><dd className="num">{hours === undefined ? (timeline.isPending ? 'Cargando…' : 'No disponible') : hours === null ? 'No indicado' : `${hours} h`}</dd></div>
          <div><dt>Estado del incidente</dt><dd>{label(incidentStatusLabels, incident.status)}</dd></div>
          <div><dt>Reportes en el incidente</dt><dd className="num">{timeline.data ? reports.length : '…'}</dd></div>
          <div><dt>Población del sector</dt><dd className="num">{community?.population ? community.population.toLocaleString('es-PA') : 'Sin dato'}</dd></div>
        </dl>
      )}
      {incident && (
        <div className="stack-sm">
          <h3 className="small muted">Resumen del incidente</h3>
          <p className="quote">{incident.summary}</p>
        </div>
      )}

      {priority && proposal ? (
        <>
          <PriorityRange priority={priority} finalScore={proposal.final_score} />
          <div className="two-col">
            <section className="stack-sm" aria-labelledby="factors-title">
              <h3 id="factors-title">Cómo se calculó</h3>
              <FactorList factors={priority.factors} />
              <p className="hint">
                {unknown.length ? `Sin confirmar: ${unknown.join(', ').toLowerCase()}.` : 'Todos los factores tienen datos confirmados.'} Los
                puntos no son horas ni personas: cada factor aporta hasta su máximo y la suma llega a 100.
              </p>
            </section>
            <section className="stack-sm" aria-labelledby="why-title">
              <h3 id="why-title">Motivo de la propuesta</h3>
              <p className="small">{proposal.explanation}</p>
              <p className="hint">Texto generado {detail.is_simulated ? 'en modo simulado' : 'por IA'} a partir de los factores; la puntuación la calcula una regla fija.</p>
              {priority.flags.length > 0 && (
                <>
                  <h4 className="small">Alertas sobre los datos</h4>
                  <ul className="tags">{priority.flags.map(f => <li key={f}><Pill tone="warn">{label(flagLabels, f)}</Pill></li>)}</ul>
                </>
              )}
            </section>
          </div>
        </>
      ) : (
        <p className="note"><InfoIcon aria-hidden="true" />
          {detail.status === 'NEEDS_INFORMATION'
            ? 'El reporte no trae información suficiente para calcular una prioridad. No hay decisión que tomar.'
            : detail.status === 'ERROR' ? 'El análisis se interrumpió antes de proponer una prioridad.'
            : 'El análisis sigue en curso. La propuesta aparecerá aquí automáticamente.'}
        </p>
      )}

      {detail.association?.status === 'PENDING_REVIEW' && detail.status === 'WAITING_APPROVAL' && (
        <p className="note warn"><WarningIcon aria-hidden="true" />
          Posible duplicado: el sistema no está seguro de que este reporte sea el mismo incidente ya abierto. Confírmalo en tu decisión.
        </p>
      )}

      {detail.status === 'WAITING_APPROVAL' && <ReviewPanel key={id} detail={detail} token={token} />}

      {detail.status === 'APPROVED' && (
        <p className="note ok"><InfoIcon aria-hidden="true" />
          Prioridad aprobada. El incidente queda disponible para el plan de cisternas, donde se propone cisterna, horario y galones para tu revisión.
        </p>
      )}

      {detail.status === 'ERROR' && (
        <div className="note danger" role="alert" style={{ display: 'grid' }}>
          <span>El procesamiento se interrumpió ({detail.error}). No se cambió de proveedor automáticamente.</span>
          <button type="button" className="secondary" style={{ justifySelf: 'start' }} disabled={retry.isPending} onClick={() => retry.mutate()}>
            <ArrowsClockwiseIcon aria-hidden="true" /> Reintentar análisis
          </button>
          <ErrorMessage error={retry.error} />
        </div>
      )}

      {detail.review && (
        <section className="record" aria-label="Decisión registrada">
          <div className="spread">
            <h3>Decisión registrada: {label(decisionLabels, detail.review.payload.decision)}</h3>
            <Pill tone={detail.review.applied_at ? 'ok' : 'progress'}>{detail.review.applied_at ? 'Aplicada' : 'Pendiente de aplicar'}</Pill>
          </div>
          <p><strong>Razón:</strong> {detail.review.payload.reason}</p>
          <p>Puntuación final: <strong>{proposal?.final_score ?? 'sin puntuación aprobada'}</strong>{proposal?.final_score != null && ' de 100'}</p>
          <p className="hint">Registrada {when(detail.review.created_at)} con la credencial compartida de coordinación ({detail.review.actor}).
            Aprobar la prioridad no despacha cisternas: eso depende del plan aprobado y de la flota.</p>
        </section>
      )}

      {!!detail.evidence?.length && <Evidence items={detail.evidence} />}

      <details className="tech">
        <summary><CaretRightIcon className="chev" aria-hidden="true" /> Detalles técnicos y auditoría <span className="muted small">({detail.traces.length} eventos)</span></summary>
        <div className="tech-body">
          <dl className="ids">
            <div><dt>Ejecución</dt><dd><code>{detail.id}</code></dd></div>
            <div><dt>Reporte</dt><dd><code>{detail.report_id}</code></dd></div>
            {proposal && <div><dt>Incidente</dt><dd><code>{proposal.incident_id}</code></dd></div>}
            {community && <div><dt>Comunidad</dt><dd><code>{community.id}</code></dd></div>}
            <div><dt>Proveedor</dt><dd>{detail.provider}{detail.is_simulated ? ' (simulado)' : ''}</dd></div>
            {priority && <div><dt>Política</dt><dd>{priority.policy_version}, confianza {label(confidenceLabels, priority.confidence_level).toLowerCase()}</dd></div>}
            {detail.association && <div><dt>Asociación</dt><dd>{label(associationLabels, detail.association.status)}, confianza {label(confidenceLabels, detail.association.confidence).toLowerCase()}. {detail.association.reasoning}</dd></div>}
          </dl>
          {proposal && (
            <button type="button" className="secondary small" style={{ justifySelf: 'start' }} onClick={() => onViewTimeline(proposal.incident_id)}>
              <ClockCounterClockwiseIcon aria-hidden="true" /> Historial del incidente
            </button>
          )}
          <ol className="trace" aria-label="Trazabilidad">
            {detail.traces.map(t => (
              <li key={t.id} className={t.category === 'audit' ? 'audit' : ''}>
                <div className="trace-line">
                  <span className="agent">{t.agent}</span>
                  <span>{label(eventLabels, t.event)}</span>
                  <code>{t.event}{t.tool ? ` · ${t.tool}` : ''}</code>
                </div>
                <time>{when(t.created_at)}{t.category === 'audit' ? ', auditoría' : ''}</time>
                {Object.keys(t.detail).length > 0 && (
                  <details className="inline">
                    <summary>Ver datos</summary>
                    <pre>{JSON.stringify(t.detail, null, 2)}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </div>
      </details>
    </article>
  )
}

export function ReportsPanel({ token, lookups, executions, details, page, setPage, filter, setFilter, selected, setSelected, onViewTimeline }: {
  token: string; lookups: Lookups
  executions: { data?: Execution[]; isPending: boolean; error: Error | null }
  details: Record<string, Detail | undefined>
  page: number; setPage: (page: number) => void
  filter: ReportFilter; setFilter: (filter: ReportFilter) => void
  selected: string | null; setSelected: (id: string | null) => void
  onViewTimeline: (incidentId: string) => void
}) {
  const [search, setSearch] = useState('')
  const list = (executions.data ?? []).filter(e => matches(filter, e)
    && (!search || [e.id, e.report_id, placeOf(details[e.id], lookups).name ?? ''].some(v => v.toLowerCase().includes(search.toLowerCase()))))

  return (
    <div className={`workspace ${selected ? "has-selection" : ""}`}>
      <section className="list-pane" aria-label="Lista de reportes">
        <div className="list-tools">
          <div className="segmented" role="group" aria-label="Filtrar por estado">
            {filters.map(([value, text]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {text}{value !== 'all' && ` (${(executions.data ?? []).filter(e => matches(value, e)).length})`}
              </button>
            ))}
          </div>
          <div className="field">
            <label className="sr-only" htmlFor="report-search">Buscar reportes</label>
            <input id="report-search" type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por lugar o código" />
          </div>
        </div>
        <div className="list-scroll">
          {executions.isPending && <div style={{ padding: 16 }} role="status" aria-label="Cargando reportes"><Skeleton lines={5} /></div>}
          <ErrorMessage error={executions.error} />
          {!executions.isPending && list.length === 0 && (
            <EmptyState icon={search ? <MagnifyingGlassIcon /> : <TrayIcon />} title={search ? 'Sin coincidencias' : 'No hay reportes aquí'}>
              {search ? 'Prueba con otro nombre o código.' : filter === 'waiting' ? 'No hay reportes esperando revisión en esta página.' : 'Aún no hay reportes en esta página.'}
            </EmptyState>
          )}
          {list.map(e => {
            const detail = details[e.id]
            const priority = detail?.proposal?.priority
            return (
              <button key={e.id} type="button" className="item" aria-pressed={selected === e.id} onClick={() => {
                setSelected(e.id)
                // Narrow screens show the detail instead of the list: start it from the top.
                if (window.matchMedia?.("(max-width: 1099px)").matches) window.scrollTo({ top: 0 })
              }}>
                <span className="item-top">
                  <span className="item-title">{placeName(detail, lookups)}</span>
                  <StatusBadge status={e.status} />
                </span>
                <span className="item-meta">
                  {priority && <span className="num"><strong>{detail?.proposal?.final_score != null ? `${detail.proposal.final_score} pts` : scoreText(priority.score_min, priority.score_max)}</strong></span>}
                  {priority?.immediate_review && <span className="alert"><SirenIcon aria-hidden="true" /> Institución crítica</span>}
                  {priority?.flags.includes('DATOS_INCOMPLETOS') && <span>Información incompleta</span>}
                  <span>{when(e.created_at)}</span>
                  <code>{e.id.slice(0, 8)}</code>
                </span>
              </button>
            )
          })}
        </div>
        <div className="pager">
          <button type="button" className="secondary small" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page + 1}</span>
          <button type="button" className="secondary small" disabled={(executions.data?.length || 0) < 25} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      </section>

      <section aria-label="Detalle del reporte" className="stack-sm">
        {selected && (
          <button type="button" className="ghost back-to-list" onClick={() => setSelected(null)}>
            <ArrowLeftIcon aria-hidden="true" /> Volver a la lista
          </button>
        )}
        {selected ? (
          <ExecutionDetail key={selected} id={selected} token={token} lookups={lookups} onViewTimeline={onViewTimeline} />
        ) : (
          <div className="panel">
            <EmptyState icon={<CaretRightIcon />} title="Elige un reporte de la lista">
              Verás dónde ocurre, la prioridad propuesta y por qué, los datos que faltan y las acciones disponibles.
            </EmptyState>
          </div>
        )}
      </section>
    </div>
  )
}
