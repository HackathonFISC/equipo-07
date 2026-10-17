import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, polling } from '../api'
import { ErrorMessage, FactorBar, KpiCard, PriorityGauge, StatusBadge } from '../components'
import type { Detail, Execution, Incident, IncidentTimelineEvent, Review } from '../types'
import { PlanPanel } from './PlanPanel'

function IncidentTimelineModal({ incidentId, token, onClose }: { incidentId: string; token: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['admin', 'incidents', incidentId, 'timeline'],
    queryFn: () => api<IncidentTimelineEvent[]>(`/admin/incidents/${incidentId}/timeline`, {}, token),
  })

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="timeline-modal-title" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">TRAZABILIDAD UNIFICADA DEL INCIDENTE</span>
            <h2 id="timeline-modal-title">Línea de tiempo de ciclo de vida</h2>
            <code>{incidentId}</code>
          </div>
          <button type="button" className="secondary close-btn" onClick={onClose}>
            ✕ Cerrar
          </button>
        </div>

        {query.isPending && <p role="status">Cargando línea de tiempo…</p>}
        <ErrorMessage error={query.error} />

        {query.data && query.data.length === 0 && (
          <p className="muted">No hay eventos registrados para este incidente.</p>
        )}

        {query.data && (
          <ol className="timeline-list">
            {query.data.map((evt, idx) => (
              <li key={idx} className={`timeline-entry source-${evt.source}`}>
                <div className="timeline-meta">
                  <span className={`source-badge badge-${evt.source}`}>{evt.source}</span>
                  <span className="timeline-event-name">{evt.event}</span>
                  <span className="timeline-time">{evt.timestamp} UTC</span>
                </div>
                <p className="timeline-summary">{evt.summary}</p>
                {evt.detail && Object.keys(evt.detail).length > 0 && (
                  <details className="timeline-details">
                    <summary>Detalles del evento</summary>
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



function ReviewPanel({ detail, token }: { detail: Detail; token: string }) {
  const client = useQueryClient()
  const [decision, setDecision] = useState<Review['decision']>('APPROVE')
  const [reason, setReason] = useState('')
  const [score, setScore] = useState('')
  const [association, setAssociation] = useState<Review['association']>()

  const p = detail.proposal?.priority
  const hasRange = p ? p.score_min !== p.score_max : false
  const defaultApproved = p ? Math.round((p.score_min + p.score_max) / 2) : 0
  const [approvedScore, setApprovedScore] = useState<number>(defaultApproved)

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

  return (
    <form className="stack review card-inner" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
      <div className="review-header">
        <h3>Revisión humana</h3>
        <span className="hitl-pill">Intervención Requerida (HITL)</span>
      </div>
      <p className="review-guidance">
        Como coordinador, valida la propuesta formulada por los agentes de IA y el motor determinístico antes de consolidar la decisión final.
      </p>

      <label>
        Decisión
        <select value={decision} onChange={e => setDecision(e.target.value as Review['decision'])}>
          <option value="APPROVE">Aprobar prioridad calculada</option>
          <option value="REJECT">Rechazar propuesta</option>
          <option value="CORRECT">Corregir puntuación</option>
        </select>
      </label>

      {decision === 'APPROVE' && hasRange && (
        <div className="callout info">
          <p>
            La propuesta presenta un intervalo de prioridad ({p?.score_min} – {p?.score_max} pts) por incertidumbre en los datos.
            Define la puntuación formalmente aprobada dentro del intervalo:
          </p>
          <label>
            Puntuación aprobada
            <input
              required
              type="number"
              min={p?.score_min}
              max={p?.score_max}
              step="1"
              value={approvedScore}
              onChange={e => setApprovedScore(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {decision === 'APPROVE' && !hasRange && (
        <div className="callout info">
          Se validará formalmente la prioridad calculada ({p?.score_min} pts). Esta decisión se archivará en la bitácora de auditoría.
        </div>
      )}

      {decision === 'REJECT' && (
        <div className="callout warning">
          La propuesta será descartada. Se registrará el motivo en la auditoría técnica para trazabilidad.
        </div>
      )}

      {decision === 'CORRECT' && (
        <label>
          Puntuación corregida
          <input
            required
            type="number"
            min="0"
            max="100"
            step="1"
            value={score}
            onChange={e => setScore(e.target.value)}
            placeholder="0 - 100"
          />
        </label>
      )}

      {detail.association?.status === 'PENDING_REVIEW' && decision !== 'REJECT' && (
        <div className="tentative-association-box">
          <label>
            Asociación tentativa
            <select
              required
              value={association || ''}
              onChange={e => setAssociation(e.target.value as Review['association'])}
            >
              <option value="">Selecciona una resolución</option>
              <option value="CONFIRM">Confirmar que es el mismo incidente</option>
              <option value="NEW">Crear un incidente distinto</option>
            </select>
          </label>
          <small className="muted">
            El Agente 2 detectó coincidencia semántica con dudas razonables (MEDIUM). Define si se unifica con el incidente existente o es un caso independiente.
          </small>
        </div>
      )}

      <label>
        Razón de la decisión
        <textarea
          required
          minLength={5}
          maxLength={600}
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Justifica tu decisión para la bitácora de transparencia oficial (ej: Verificado con junta comunal o IDAAN regional)..."
        />
      </label>

      <ErrorMessage error={mutation.error} />

      <button disabled={mutation.isPending || mutation.isSuccess}>
        {mutation.isPending ? 'Registrando…' : mutation.isSuccess ? 'Decisión enviada' : 'Registrar decisión'}
      </button>
    </form>
  )
}

function ExecutionDetail({ id, token, onViewTimeline }: { id: string; token: string; onViewTimeline?: (incidentId: string) => void }) {
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

  if (query.isPending) return <p role="status" className="loading-state">Cargando ejecución…</p>
  if (!query.data) return <ErrorMessage error={query.error} />

  const detail = query.data
  const proposal = detail.proposal
  const labels: Record<string, string> = {
    hours: 'Duración sin servicio',
    critical: 'Institución crítica',
    vulnerability: 'Vulnerabilidad del sector',
    population: 'Población del sector',
  }
  const factorWeights: Record<string, number> = {
    hours: 35,
    critical: 30,
    vulnerability: 20,
    population: 15,
  }

  return (
    <article className="card stack execution-detail-card">
      <div className="row detail-header">
        <div>
          <span className="eyebrow">EXPEDIENTE DE EJECUCIÓN AGÉNTICA</span>
          <h2>Propuesta y decisión</h2>
          <div className="id-strip">
            <code>{detail.id}</code>
            <span className="provider-badge">
              {detail.is_simulated ? '⚙️ Modo Simulado' : '⚡ Proveedor NIM'} · {detail.provider}
            </span>
            {proposal?.incident_id && (
              <button
                type="button"
                className="text-btn"
                onClick={() => onViewTimeline?.(proposal.incident_id)}
                style={{ marginLeft: '6px' }}
              >
                🕒 Línea de tiempo
              </button>
            )}
          </div>
        </div>
        <StatusBadge status={detail.status} />
      </div>

      <ErrorMessage error={query.error} />

      {proposal ? (
        <>
          <PriorityGauge priority={proposal.priority} finalScore={proposal.final_score} />

          {proposal.priority.immediate_review && (
            <div className="critical-alert-banner" role="alert">
              <strong>🚨 Institución crítica: revisar inmediatamente.</strong>
              <p>Este incidente afecta a un hospital, policlínica, escuela o asilo de Panamá Oeste. Requiere despacho prioritario.</p>
            </div>
          )}

          <div className="explanation-box">
            <span className="box-title">Explicación Generada por el Agente 3 (Coordinación)</span>
            <p className="explanation-text">{proposal.explanation}</p>
            <small className="muted">Instantánea determinística del reporte; no suma el volumen de reportes del incidente para evitar sesgo por spam.</small>
          </div>

          <div className="factors-section">
            <h3>Desglose Determinístico de Factores (Política v1.0.0-demo)</h3>
            <p className="muted text-sm">Ponderación matemática independiente de alucinaciones de LLM (Suma máxima: 100 puntos).</p>
            <div className="factors-grid">
              {Object.entries(proposal.priority.factors).map(([name, bounds]) => (
                <FactorBar
                  key={name}
                  label={labels[name] || name}
                  min={bounds[0]}
                  max={bounds[1]}
                  weight={factorWeights[name] || 25}
                />
              ))}
            </div>
            {/* dl factors para compatibilidad con pruebas y lectores de pantalla */}
            <dl className="factors sr-only">
              {Object.entries(proposal.priority.factors).map(([name, bounds]) => (
                <div key={name}>
                  <dt>{labels[name] || name}</dt>
                  <dd>{bounds[0]}–{bounds[1]} puntos</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flags-box">
            <span className="box-title">Banderas de Auditoría y Calidad de Datos</span>
            <ul className="flags">
              {proposal.priority.flags.map(flag => (
                <li key={flag} className="flag-item">
                  🏷️ {flag.replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
          </div>

          {detail.association && (
            <div className="association-card">
              <h4>Agente 2 · Deduplicación y Consolidación</h4>
              <p>
                <strong>Estado:</strong> <span className="mono">{detail.association.status}</span> ·
                <strong> Confianza:</strong> {detail.association.confidence}
              </p>
              <p className="muted">{detail.association.reasoning}</p>
            </div>
          )}

          {detail.status === 'WAITING_APPROVAL' && (
            <ReviewPanel key={id} detail={detail} token={token} />
          )}

          {detail.status === 'APPROVED' && (
            <p className="callout info">
              Prioridad aprobada. El incidente entra al <strong>Plan de distribución de cisternas</strong>,
              donde el agente planificador asigna cisterna, horario y galones para tu revisión.
            </p>
          )}
        </>
      ) : (
        <div className="callout info">
          <p>
            {detail.status === 'NEEDS_INFORMATION'
              ? 'Se necesita un reporte más específico para evaluar prioridad.'
              : 'Todavía no hay propuesta de prioridad generada.'}
          </p>
        </div>
      )}

      {detail.status === 'ERROR' && (
        <div className="error-resolution-box">
          <p role="alert">Procesamiento interrumpido: {detail.error}. No se sustituyó el proveedor.</p>
          <button disabled={retry.isPending} onClick={() => retry.mutate()}>
            Reintentar ejecución
          </button>
          <ErrorMessage error={retry.error} />
        </div>
      )}

      {detail.review && (
        <div className="review-summary-card">
          <div className="review-badge-row">
            <h3>Decisión registrada: {detail.review.payload.decision}</h3>
            <span className="applied-pill">
              {detail.review.applied_at ? '✓ Aplicada en base de datos' : '⏳ Pendiente de aplicar'}
            </span>
          </div>
          <p className="review-reason"><strong>Motivo:</strong> {detail.review.payload.reason}</p>
          <p>Puntuación final: <strong>{proposal?.final_score ?? 'Sin puntuación aprobada'}</strong> / 100</p>
          <small className="muted">
            Operador responsable: {detail.review.actor} · {detail.review.created_at} UTC
          </small>
          <div className="disclaimer-mini">Nota: La decisión aprueba la prioridad en el sistema; el despacho físico depende de la disponibilidad de cisternas del IDAAN.</div>
        </div>
      )}

      {!!detail.evidence?.length && (
        <section aria-label="Evidencia del ciudadano" className="stack evidence-section">
          <h3>Evidencia enviada por el ciudadano</h3>
          <ul className="evidence-list">
            {detail.evidence.map((item, i) => (
              <li key={i}>
                <strong>{item.kind === 'image' ? 'Foto' : item.kind === 'voice' || item.kind === 'audio' ? 'Audio (sin transcribir)' : 'Archivo'}</strong>
                {' '}· {item.channel} · {item.status === 'STORED' ? 'guardado' : 'no guardado'}
                {item.analysis?.status === 'DONE' && (
                  <p className="text-sm">
                    {item.analysis.simulated ? 'Simulación' : `Análisis de IA (${item.analysis.model})`}:{' '}
                    {item.analysis.description}{' '}
                    <em>
                      {item.analysis.relevant === true ? '— relevante para el reporte'
                        : item.analysis.relevant === false ? '— no parece relacionada con el agua'
                        : ''}
                    </em>
                  </p>
                )}
                {item.analysis?.status === 'ERROR' && <p className="text-sm muted">Análisis no disponible ({item.analysis.error}).</p>}
                {item.kind === 'image' && item.status === 'STORED' && !item.analysis && <p className="text-sm muted">Análisis en curso…</p>}
              </li>
            ))}
          </ul>
          <small className="muted">El análisis es orientativo: no cambia el tipo, las horas ni el puntaje. Decide la persona coordinadora.</small>
        </section>
      )}

      <section aria-label="Trazabilidad" className="stack trace-section">
        <div className="trace-header">
          <h3>Trazabilidad de la ejecución</h3>
          <span className="trace-count">{detail.traces.length} eventos auditables</span>
        </div>
        <p className="muted text-sm">Registro inmutable de acciones tomadas por cada agente y herramienta durante el ciclo de vida del incidente.</p>
        <ol className="trace">
          {detail.traces.map(t => (
            <li key={t.id} className="trace-item">
              <div className="trace-main">
                <span className="agent-badge">{t.agent}</span>
                <span className="event-name">{t.event}</span>
                {t.tool && <code className="tool-name">{t.tool}</code>}
              </div>
              <small className="trace-time">{t.created_at} UTC · Categoría: {t.category}</small>
              {Object.keys(t.detail).length > 0 && (
                <details className="trace-details">
                  <summary>Ver datos de auditoría</summary>
                  <pre>{JSON.stringify(t.detail, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      </section>
    </article>
  )
}

export function CoordinationPage({ token }: { token: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [timelineIncidentId, setTimelineIncidentId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'waiting' | 'approved'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(0)

  const executions = useQuery({
    queryKey: ['admin', 'executions', page],
    queryFn: () => api<Execution[]>(`/admin/executions?offset=${page * 25}&limit=25`, {}, token),
    refetchInterval: 5000,
  })

  const incidents = useQuery({
    queryKey: ['admin', 'incidents', page],
    queryFn: () => api<Incident[]>(`/admin/incidents?offset=${page * 25}&limit=25`, {}, token),
    refetchInterval: 5000,
  })

  // Métricas calculadas para el dashboard
  const kpis = useMemo(() => {
    const list = executions.data || []
    const incList = incidents.data || []
    const waiting = list.filter(e => e.status === 'WAITING_APPROVAL').length
    const approved = list.filter(e => e.status === 'APPROVED').length
    const errors = list.filter(e => e.status === 'ERROR').length
    return {
      totalExecutions: list.length,
      waitingReview: waiting,
      approvedCount: approved,
      totalIncidents: incList.length,
      errorCount: errors,
    }
  }, [executions.data, incidents.data])

  // Filtrado de ejecuciones
  const filteredExecutions = useMemo(() => {
    if (!executions.data) return []
    return executions.data.filter(e => {
      if (filter === 'waiting' && e.status !== 'WAITING_APPROVAL') return false
      if (filter === 'approved' && e.status !== 'APPROVED') return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return e.id.toLowerCase().includes(term) || e.report_id.toLowerCase().includes(term)
      }
      return true
    })
  }, [executions.data, filter, searchTerm])

  return (
    <section className="stack coordination-page">
      <div className="coord-hero">
        <p className="eyebrow">CENTRO DE OPERACIONES Y MANDO · PANAMÁ OESTE</p>
        <h1>Decisiones con contexto.</h1>
        <p className="muted">
          Supervisa los reportes procesados por los agentes de IA, valida la evidencia determinística y registra tus decisiones con plena explicabilidad y trazabilidad.
        </p>
      </div>

      <div className="kpi-grid">
        <KpiCard
          title="Total Evaluaciones"
          value={kpis.totalExecutions}
          subtitle="Reportes procesados en esta página"
        />
        <KpiCard
          title="Pendientes de Revisión (HITL)"
          value={kpis.waitingReview}
          subtitle="Esperando aprobación de coordinador"
          tone="amber"
        />
        <KpiCard
          title="Prioridades Aprobadas"
          value={kpis.approvedCount}
          subtitle="Listas para coordinación de ruta"
          tone="emerald"
        />
        <KpiCard
          title="Incidentes Consolidados"
          value={kpis.totalIncidents}
          subtitle="Eventos unificados por sector"
          tone="blue"
        />
      </div>

      <PlanPanel token={token} />

      <div className="coord-grid">
        <aside className="stack sidebar">
          <div className="card stack">
            <div className="sidebar-header">
              <h2>Reportes y ejecuciones</h2>
              <span className="count-tag">{filteredExecutions.length}</span>
            </div>

            <div className="filter-toolbar">
              <input
                type="search"
                className="search-input"
                placeholder="Buscar por ID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <div className="filter-buttons">
                <button
                  type="button"
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`filter-btn ${filter === 'waiting' ? 'active' : ''}`}
                  onClick={() => setFilter('waiting')}
                >
                  Pendientes ({kpis.waitingReview})
                </button>
                <button
                  type="button"
                  className={`filter-btn ${filter === 'approved' ? 'active' : ''}`}
                  onClick={() => setFilter('approved')}
                >
                  Aprobados
                </button>
              </div>
            </div>

            {executions.isPending && <p role="status">Cargando reportes…</p>}
            <ErrorMessage error={executions.error} />
            {filteredExecutions.length === 0 && !executions.isPending && (
              <p className="muted empty-note">Aún no hay reportes en esta página.</p>
            )}

            <div className="executions-list">
              {filteredExecutions.map(e => (
                <button
                  className={`execution ${selected === e.id ? 'selected' : ''}`}
                  key={e.id}
                  onClick={() => setSelected(e.id)}
                  aria-pressed={selected === e.id}
                >
                  <div className="exec-row-top">
                    <code>{e.id.slice(0, 8)}</code>
                    <StatusBadge status={e.status} />
                  </div>
                  <div className="exec-row-meta">
                    <small>{e.created_at} UTC</small>
                    <span className="provider-tag-mini">{e.provider}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="row pagination-row">
              <button
                className="secondary pagination-btn"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span className="page-indicator">Página {page + 1}</span>
              <button
                className="secondary pagination-btn"
                disabled={(executions.data?.length || 0) < 25 && (incidents.data?.length || 0) < 25}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>

          <div className="card stack incidents-card">
            <div className="sidebar-header">
              <h2>Incidentes consolidados</h2>
              <span className="count-tag">{incidents.data?.length || 0}</span>
            </div>
            <p className="muted text-sm">Eventos agrupados por el Agente 2 para evitar dispersión en distribución.</p>
            <ErrorMessage error={incidents.error} />
            {incidents.isPending && <p role="status">Cargando incidentes…</p>}
            {incidents.data?.length === 0 && <p className="muted">Sin incidentes en esta página.</p>}
            <div className="incidents-scroll">
              {incidents.data?.map(i => (
                <div className="incident" key={i.id}>
                  <div className="incident-header">
                    <strong>📍 {i.community_id}</strong>
                    <span className="incident-kind-badge">{i.kind}</span>
                  </div>
                  <p>{i.summary}</p>
                  <div className="incident-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <small>{i.status} · ID: <code>{i.id.slice(0, 8)}</code></small>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => setTimelineIncidentId(i.id)}
                    >
                      Línea de tiempo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="detail-pane">
          {selected ? (
            <ExecutionDetail key={selected} id={selected} token={token} onViewTimeline={setTimelineIncidentId} />
          ) : (
            <div className="card empty select-prompt">
              <div className="empty-content">
                <span className="empty-icon">📊</span>
                <h3>Ninguna ejecución seleccionada</h3>
                <p>Selecciona una ejecución de la lista lateral para inspeccionar su prioridad determinística, revisar la justificación agéntica, ejecutar la intervención humana o consultar las trazas de auditoría.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {timelineIncidentId && (
        <IncidentTimelineModal
          incidentId={timelineIncidentId}
          token={token}
          onClose={() => setTimelineIncidentId(null)}
        />
      )}
    </section>
  )
}
