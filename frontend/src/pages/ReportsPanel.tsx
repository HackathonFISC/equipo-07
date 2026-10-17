import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftIcon, ArrowsClockwiseIcon, CaretRightIcon, ClockCounterClockwiseIcon, InfoIcon, MagnifyingGlassIcon,
  SirenIcon, TrayIcon,
} from '@phosphor-icons/react'
import { api, polling } from '../api'
import { EmptyState, ErrorMessage, PriorityRange, Skeleton, StatusBadge } from '../components'
import {
  durationText, incidentStatusLabels, label, priorityRows, scoreText, when,
} from '../labels'
import type { Detail, Execution, Review } from '../types'
import { placeName, placeOf, type Lookups } from '../lookups'
import { DecisionRecord, Evidence, ReportAudit } from './ReportAudit'

export type ReportView = 'operation' | 'audit'

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
  const [approvedScore, setApprovedScore] = useState('')
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
    ? `Se rechaza esta propuesta. Las prioridades de otros reportes del incidente se conservan.${tentative ? ' El reporte no se une al incidente propuesto.' : ''}`
    : `El sistema aplicará ${finalScore === '' || finalScore == null ? '…' : finalScore} pts al incidente. Si ya tiene una cisterna programada, conserva ese estado. Esto no aprueba un plan ni confirma una entrega.`
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
              placeholder={`${p?.score_min} a ${p?.score_max}`} onChange={e => edit(() => setApprovedScore(e.target.value))} />
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

function ExecutionDetail({ id, token, lookups, view, onViewChange, onViewTimeline, onShowPlan }: {
  id: string; token: string; lookups: Lookups; view: ReportView; onViewChange: (view: ReportView) => void
  onViewTimeline: (incidentId: string) => void; onShowPlan: (id: string) => void
}) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['admin', 'detail', id],
    queryFn: () => api<Detail>(`/admin/executions/${id}`, {}, token),
    refetchInterval: q => polling(q.state.data?.status),
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
  const rows = priority ? priorityRows(priority) : []
  const unknown = rows.filter(row => row.points[0] !== row.points[1])
  const relevant = rows.filter(row => row.points[0] === row.points[1]).sort((a, b) => b.points[0] - a.points[0]).slice(0, 2)
  const appliedScore = detail.review?.applied_at ? proposal?.final_score : null

  return (
    <article className="panel detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <div className="spread"><span className="kicker">Reporte {detail.report_id.slice(0, 8)}</span><StatusBadge status={detail.status} /></div>
        <h2 id="detail-title">{name ?? 'Ubicación no disponible en este registro'}</h2>
        <div className="row small muted">{community && <span>Distrito de {community.district}</span>}<span>Recibido {when(detail.created_at)}</span></div>
      </header>
      <div className="segmented report-views" role="group" aria-label="Vista del reporte">
        <button type="button" aria-pressed={view === 'operation'} onClick={() => onViewChange('operation')}>Vista operativa</button>
        <button type="button" aria-pressed={view === 'audit'} onClick={() => onViewChange('audit')}><ClockCounterClockwiseIcon aria-hidden="true" /> Auditoría y trazabilidad</button>
      </div>
      <ErrorMessage error={query.error} />
      <div hidden={view !== 'operation'} className="stack report-operation">
        <section className="stack-sm" aria-label="Reporte ciudadano">
          <h3>Problema reportado</h3>
          <p className="quote">{detail.report?.description ?? 'Descripción original no disponible en este registro histórico. Consulta el resumen del incidente en Auditoría.'}</p>
          <dl className="facts">
            <div><dt>Duración declarada</dt><dd>{durationText(detail.report)}</dd></div>
            <div><dt>Estado del incidente</dt><dd>{incident ? label(incidentStatusLabels, incident.status) : 'Sin estado disponible'}</dd></div>
          </dl>
          <p className="hint">Declaración ciudadana sin verificación independiente.</p>
        </section>
        {priority && proposal ? <>
          <PriorityRange priority={priority} finalScore={appliedScore} />
          <section className="decision-context stack-sm" aria-label="Información para decidir">
            {priority.immediate_review && <p className="alert row"><SirenIcon aria-hidden="true" /><strong>Posible institución crítica: revisión inmediata.</strong></p>}
            <p><strong>Falta confirmar: </strong>{unknown.length ? unknown.map(row => row.label.toLowerCase()).join(', ') : 'No hay factores sin valor. Los datos siguen sujetos a su procedencia.'}</p>
            {priority.flags.includes('CONTRADICCION_DURACION') && <p>La duración escrita contradice la seleccionada; verifica el dato antes de decidir.</p>}
            {detail.association?.status === 'PENDING_REVIEW' && <p>Posible duplicado: confirma si pertenece al mismo incidente o crea uno distinto.</p>}
            <p><strong>Acción requerida: </strong>{detail.status === 'WAITING_APPROVAL' ? `Revisa los datos y aprueba${priority.score_min !== priority.score_max ? ' eligiendo una puntuación dentro del rango' : ''}, corrige o rechaza.`
              : detail.review && !detail.review.applied_at ? detail.status === 'ERROR' ? 'Reintenta el procesamiento de la decisión registrada.' : 'Esperar a que el sistema aplique la decisión registrada.'
              : detail.status === 'APPROVED' ? incident?.status === 'SCHEDULED' ? 'Consulta la asignación de cisterna en el plan aprobado. La entrega no está confirmada.' : 'Continúa en Cisternas para revisar un plan de distribución.'
              : detail.status === 'REJECTED' ? 'Propuesta rechazada; consulta el motivo registrado.' : 'Consulta el estado del procesamiento.'}</p>
          </section>
          <details className="tech"><summary>¿Por qué se propone esta prioridad?</summary><div className="tech-body">
            {priority.inputs ? <ul className="priority-reasons">{relevant.map(row => <li key={row.key}><strong>{row.label}:</strong> {row.value} → {scoreText(row.points[0], row.points[1])}. <span className="muted">{row.source}.</span></li>)}</ul>
              : <p>La propuesta conserva los puntos por factor, pero no sus entradas originales. No se reconstruye su explicación con el catálogo actual.</p>}
            {!!unknown.length && <p className="small">Los factores sin confirmar amplían el rango; no restan puntos.</p>}
            <button type="button" className="ghost" onClick={() => onViewChange('audit')}>Ver factores, procedencia y fórmula en Auditoría <CaretRightIcon aria-hidden="true" /></button>
          </div></details>
        </> : <p className="note"><InfoIcon aria-hidden="true" />{detail.status === 'NEEDS_INFORMATION' ? 'Falta información para identificar el problema. No hay propuesta ni decisión que tomar.'
          : detail.status === 'ERROR' ? 'El procesamiento se interrumpió antes de proponer una prioridad.' : 'Análisis en curso. La propuesta aparecerá automáticamente.'}</p>}
        {detail.status === 'ERROR' && <div className="note danger stack-sm" role="alert">
          <p>{detail.review?.applied_at ? 'La decisión está aplicada, pero el procesamiento posterior falló.' : detail.review ? 'Decisión registrada; su aplicación se interrumpió.' : 'El análisis se interrumpió. El reporte sigue guardado.'} Consulta el error y el nodo en Auditoría.</p>
          <button type="button" className="secondary" disabled={retry.isPending} onClick={() => retry.mutate()}><ArrowsClockwiseIcon aria-hidden="true" /> Reintentar procesamiento</button>
          <ErrorMessage error={retry.error} />
        </div>}
        {detail.status === 'WAITING_APPROVAL' && proposal && !detail.review && <ReviewPanel key={id} detail={detail} token={token} />}
        <DecisionRecord detail={detail} />
        {!!detail.evidence?.length && <details className="tech"><summary>Evidencia ciudadana ({detail.evidence.length})</summary><div className="tech-body"><Evidence items={detail.evidence} /></div></details>}
      </div>
      {view === 'audit' && <ReportAudit detail={detail} incident={incident} token={token} onViewTimeline={onViewTimeline} onShowPlan={onShowPlan} />}
    </article>
  )
}

export function ReportsPanel({ token, lookups, executions, details, page, setPage, filter, setFilter, selected, setSelected, view, onViewChange, onViewTimeline, onShowPlan }: {
  token: string; lookups: Lookups
  executions: { data?: Execution[]; isPending: boolean; error: Error | null }
  details: Record<string, Detail | undefined>
  page: number; setPage: (page: number) => void
  filter: ReportFilter; setFilter: (filter: ReportFilter) => void
  selected: string | null; setSelected: (id: string | null) => void
  view: ReportView; onViewChange: (view: ReportView) => void
  onViewTimeline: (incidentId: string) => void; onShowPlan: (id: string) => void
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
                  {priority && <span className="num"><strong>{detail?.review?.applied_at && detail.proposal?.final_score != null ? `${detail.proposal.final_score} pts` : scoreText(priority.score_min, priority.score_max)}</strong></span>}
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
          <ExecutionDetail key={selected} id={selected} token={token} lookups={lookups} view={view} onViewChange={onViewChange} onViewTimeline={onViewTimeline} onShowPlan={onShowPlan} />
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
