import { useQuery } from '@tanstack/react-query'
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react'
import { api, polling, statusLabels } from '../api'
import { EmptyState, ErrorMessage, Pill, Skeleton } from '../components'
import {
  agentLabels, associationLabels, confidenceLabels, decisionLabels, durationText,
  eventLabels, flagLabels, kindLabels, label, priorityRows, scoreText, when,
} from '../labels'
import type { Detail, Incident, IncidentTimelineEvent } from '../types'

function JsonData({ title, value }: { title: string; value: unknown }) {
  return <details className="inline"><summary>{title}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>
}

export function DecisionRecord({ detail }: { detail: Detail }) {
  const review = detail.review
  if (!review) return null
  const requested = review.payload.decision === 'CORRECT' ? review.payload.corrected_score : review.payload.approved_score
  return (
    <section className="record" aria-label="Decisión registrada">
      <div className="spread">
        <h3>Decisión registrada: {label(decisionLabels, review.payload.decision)}</h3>
        <Pill tone={review.applied_at ? 'ok' : detail.status === 'ERROR' ? 'danger' : 'progress'}>
          {review.applied_at ? 'Aplicada' : detail.status === 'ERROR' ? 'Aplicación interrumpida' : 'Pendiente de aplicar'}
        </Pill>
      </div>
      <p><strong>Razón:</strong> {review.payload.reason}</p>
      {requested != null && <p>Puntuación elegida: <strong>{requested} pts</strong></p>}
      <p>Puntuación aplicada: <strong>{detail.proposal?.final_score != null ? `${detail.proposal.final_score} pts de 100` : 'Sin puntuación aprobada'}</strong></p>
      <p className="hint">Registrada {when(review.created_at)} · {review.applied_at ? `Aplicada ${when(review.applied_at)}` : 'Aún no consta su aplicación'}.
        {' '}Credencial compartida de coordinación ({review.actor}). Aprobar prioridad no confirma entrega.</p>
    </section>
  )
}

export function Evidence({ items }: { items: NonNullable<Detail['evidence']> }) {
  return (
    <section className="stack-sm" aria-label="Evidencia del ciudadano">
      <h3>Evidencia enviada por el ciudadano</h3>
      <ul className="served">
        {items.map((item, i) => (
          <li key={i}>
            <span><strong>{item.kind === 'image' ? 'Foto' : item.kind === 'voice' || item.kind === 'audio' ? 'Audio (sin transcribir)' : 'Archivo'}</strong>
              <span className="muted small"> por {item.channel === 'whatsapp' ? 'WhatsApp' : item.channel === 'telegram' ? 'Telegram' : item.channel}</span></span>
            <Pill tone={item.status === 'STORED' ? 'ok' : 'warn'}>{item.status === 'STORED' ? 'Guardado' : 'No guardado'}</Pill>
            <span className="why">
              {item.analysis?.status === 'DONE' && <>
                {item.analysis.simulated ? 'Simulación' : `Análisis de IA (${item.analysis.model ?? 'modelo no registrado'})`}: {item.analysis.description}{' '}
                <em>{item.analysis.relevant === true ? '(relevante para el reporte)' : item.analysis.relevant === false ? '(no parece relacionada con el agua)' : ''}</em>
              </>}
              {item.analysis?.status === 'ERROR' && `Análisis no disponible (${item.analysis.error}).`}
              {item.kind === 'image' && item.status === 'STORED' && !item.analysis && 'Sin análisis registrado todavía.'}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">Análisis orientativo sin verificación externa: no cambia el tipo, la duración ni el puntaje.</p>
    </section>
  )
}

export function ReportAudit({ detail, incident, token, onViewTimeline, onShowPlan }: {
  detail: Detail; incident?: Incident; token: string; onViewTimeline: (id: string) => void; onShowPlan: (id: string) => void
}) {
  const proposal = detail.proposal
  const priority = proposal?.priority
  const report = detail.report
  const normalized = report?.normalized
  const incidentId = proposal?.incident_id ?? detail.association?.incident_id
  const timeline = useQuery({
    queryKey: ['admin', 'incidents', incidentId, 'timeline'], enabled: !!incidentId,
    queryFn: () => api<IncidentTimelineEvent[]>(`/admin/incidents/${incidentId}/timeline`, {}, token),
    refetchInterval: q => polling(detail.status) || (q.state.data ? 10000 : false),
  })
  const nodes = [...new Set(detail.traces.filter(t => ['ingestion', 'verification', 'coordination', 'finalize'].includes(t.agent)).map(t => t.agent))]
  const planIds = [...new Set((timeline.data ?? []).filter(t => t.source === 'plan' && typeof t.detail.plan_id === 'string').map(t => t.detail.plan_id as string))]

  return (
    <div className="audit-view stack" aria-label="Auditoría del reporte">
      <div className="stack-sm">
        <h3>Auditoría y trazabilidad</h3>
        <p className="muted small">Registros de esta ejecución. Propuesta, decisión registrada y aplicación se consultan por separado.</p>
      </div>
      <nav className="audit-nav" aria-label="Contenido de auditoría">
        <a href="#audit-processing">Cronología</a><a href="#audit-data">Datos</a>
        {priority && <a href="#audit-priority">Puntuación</a>}
        <a href="#audit-association">Evidencia</a><a href="#audit-decision">Decisión</a><a href="#audit-plans">Planes</a>
      </nav>
      <dl className="facts">
        <div><dt>Proveedor / modelo registrado</dt><dd>{detail.provider}{detail.is_simulated ? ' · Simulación, sin inferencia real' : ''}</dd></div>
        <div><dt>Intentos del worker</dt><dd>{detail.attempts ?? 'No registrado'}</dd></div>
        <div><dt>Estado del workflow</dt><dd>{statusLabels[detail.status]} <code>{detail.status}</code></dd></div>
      </dl>
      {detail.error && <p className="note danger" role="alert">Error registrado: {detail.error}. {detail.review?.applied_at ? 'La decisión consta aplicada; falló el procesamiento posterior.' : detail.review ? 'La decisión está registrada; no consta su aplicación.' : 'Consulta el nodo y los intentos en la cronología.'}</p>}
      <section id="audit-processing" className="stack-sm" aria-label="Cronología de procesamiento">
        <h3>Recorrido registrado</h3>
        {nodes.length > 0 && <ol className="node-flow" aria-label="Nodos registrados de LangGraph">
          {nodes.map(node => {
            const events = detail.traces.filter(t => t.agent === node)
            const last = events[events.length - 1]
            return <li key={node}><strong>{label(agentLabels, node)}</strong><span>{label(eventLabels, last.event)}</span><code>{node}</code></li>
          })}
        </ol>}
        <p className="hint">Solo aparecen nodos con eventos persistidos. {detail.status === 'WAITING_APPROVAL' && 'El workflow está en pausa para revisión humana (human_review).'} No se registran todas las transiciones internas del checkpoint.</p>
        {detail.traces.length === 0 ? <EmptyState title="Sin eventos registrados" /> : <ol className="trace" aria-label="Trazabilidad">
          {detail.traces.map(t => <li key={t.id} className={t.category === 'audit' ? 'audit' : ''}>
            <div className="trace-line"><span className="agent">{label(agentLabels, t.agent)}</span><strong>{label(eventLabels, t.event)}</strong></div>
            <time dateTime={t.created_at}>{when(t.created_at)} · {t.category === 'audit' ? 'Auditoría' : 'Técnico'}</time>
            <span className="muted small"><code>{t.agent} · {t.event}{t.tool ? ` · ${t.tool}` : ''}</code></span>
            {typeof t.detail.status === 'string' && <span>Estado resultante: {statusLabels[t.detail.status as keyof typeof statusLabels] ?? t.detail.status}</span>}
            {typeof t.detail.error === 'string' && <span className="error">{t.detail.error}</span>}
            {Object.keys(t.detail).length > 0 && <JsonData title="Ver datos del evento (JSON)" value={t.detail} />}
          </li>)}
        </ol>}
      </section>
      <section id="audit-data" className="audit-section stack-sm" aria-label="Datos originales y normalizados">
        <h3>Declaración y normalización</h3>
        <div className="two-col">
          <div className="stack-sm"><h4>Declarado por el ciudadano</h4><p className="quote">{report?.description ?? 'Descripción original no disponible en este registro histórico.'}</p><p>Duración: {durationText(report)}</p></div>
          <div className="stack-sm"><h4>Interpretación del sistema</h4><p className="quote">{normalized?.summary ?? 'Sin normalización registrada.'}</p>
            {normalized && <><p>Tipo: {label(kindLabels, normalized.kind)} · Duración: {durationText(normalized)}</p><p className="hint">Interpretación registrada; no constituye verificación de campo.</p></>}
          </div>
        </div>
        {!priority?.inputs && report?.hours_without_water != null && <p className="hint">Las horas almacenadas en registros históricos pueden ser representativas. Sin intervalo original registrado no se reconstruye la selección ciudadana.</p>}
        <JsonData title="Ver datos originales y normalizados (JSON)" value={report ? { community_id: report.community_id, description: report.description, duration_bucket: report.duration_bucket, hours_without_water: report.hours_without_water, normalized } : null} />
      </section>
      {priority && <section id="audit-priority" className="audit-section stack-sm" aria-label="Factores y fórmula de puntuación">
        <h3>Datos utilizados y puntos calculados</h3>
        <p className="hint">Instantánea de la propuesta, independiente de cambios posteriores del catálogo. Los factores aportan puntos, no horas, porcentajes ni habitantes.</p>
        {!priority.inputs && <p className="note warn">Registro histórico sin instantánea de entradas. No se reconstruye con el catálogo actual.</p>}
        <div className="table-scroll"><table className="audit-table"><caption className="sr-only">Procedencia y aportes a la prioridad</caption>
          <thead><tr><th>Factor / dato usado</th><th>Procedencia</th><th>Puntos</th></tr></thead>
          <tbody>{priorityRows(priority).map(row => <tr key={row.key}><th scope="row">{row.label}<span>{row.value}</span></th><td>{row.source}</td><td>{scoreText(row.points[0], row.points[1])}{row.points[0] !== row.points[1] && <span>Dato sin confirmar</span>}</td></tr>)}</tbody>
          <tfoot><tr><th colSpan={2}>Propuesta calculada · {priority.policy_version}</th><td>{scoreText(priority.score_min, priority.score_max)}</td></tr></tfoot>
        </table></div>
        <details className="tech"><summary>Desglose matemático y fórmula</summary><div className="tech-body">
          {priority.policy_version === 'v1.0.0-demo' ? <>
            <p className="small">Duración: 35 × fracción del tramo (0 h: 0; &lt;12 h: 0.25; 12–&lt;24 h: 0.5; 24–&lt;48 h: 0.75; ≥48 h: 1). Institución crítica: 30 si aplica. Vulnerabilidad: índice × 20. Población: min(habitantes / 5000, 1) × 15.</p>
            <p className="hint">El motor redondea cada aporte al entero más cercano (empates al par). Sin dato: [0, peso]. Suma de mínimos y máximos = intervalo propuesto. No se recalcula en el navegador.</p>
          </> : <p>Fórmula de esta versión no publicada en la interfaz; consulta los factores registrados.</p>}
          <p className="num">{Object.values(priority.factors).map(([min, max]) => min === max ? min : `[${min}, ${max}]`).join(' + ')} → {scoreText(priority.score_min, priority.score_max)}</p>
          <JsonData title="Ver prioridad e inputs (JSON)" value={priority} />
        </div></details>
        <p className="small">Confianza de los datos: {label(confidenceLabels, priority.confidence_level)}. Una puntuación calculable no implica verificación externa.</p>
        {!!priority.flags.length && <ul className="tags">{priority.flags.map(f => <li key={f}><Pill tone="warn">{label(flagLabels, f)}</Pill></li>)}</ul>}
        <details className="tech"><summary>Explicación almacenada de la propuesta</summary><div className="tech-body">
          <p className="hint">{priority.inputs ? 'Texto de la propuesta almacenada; contrasta sus afirmaciones con la instantánea anterior.' : 'Texto histórico sin validar: puede contener errores de IA. No se presenta como hecho confirmado.'}</p><p className="small">{proposal?.explanation}</p>
        </div></details>
      </section>}
      <section id="audit-association" className="audit-section stack-sm" aria-label="Asociaciones y evidencia">
        <h3>Asociación de incidentes</h3>
        {incident && <p className="small"><strong>Resumen agrupado del sistema:</strong> {incident.summary}</p>}
        {detail.association ? <><p><strong>{label(associationLabels, detail.association.status)}</strong> · confianza {label(confidenceLabels, detail.association.confidence).toLowerCase()}</p>
          <p className="small">Justificación registrada: {detail.association.reasoning}</p><p className="hint">Asociar reportes no certifica el incidente ni verifica los hechos.</p>
          <JsonData title="Ver asociación (JSON)" value={detail.association} />
        </> : <p className="muted">Sin asociación registrada.</p>}
        {detail.evidence?.length ? <Evidence items={detail.evidence} /> : <p className="muted small">Sin archivos de evidencia registrados.</p>}
      </section>
      <div id="audit-decision">{detail.review ? <DecisionRecord detail={detail} /> : <p className="muted">Sin decisión humana registrada.</p>}</div>
      <section id="audit-plans" className="audit-section stack-sm" aria-label="Relación con planes de cisternas">
        <h3>Incidente y planes de cisternas</h3>
        <p className="hint">El historial unificado incluye reportes asociados, decisiones aplicadas, eventos de planes y avisos. El backend consulta los 20 planes y 50 avisos más recientes; la ausencia no demuestra que nunca existió un plan.</p>
        {incidentId ? <>
          <button type="button" className="secondary" onClick={() => onViewTimeline(incidentId)}><ClockCounterClockwiseIcon aria-hidden="true" /> Historial del incidente</button>
          {timeline.isPending && <Skeleton lines={2} />}<ErrorMessage error={timeline.error} />
          {timeline.data && !planIds.length && <p className="muted small">Sin relación con planes en los registros consultados.</p>}
          {timeline.data && <p className="small">Reportes asociados en el historial: {timeline.data.filter(t => t.source === 'report').length}</p>}
          {planIds.map(id => <button key={id} type="button" className="secondary" onClick={() => onShowPlan(id)}>Ver plan {id.slice(0, 8)} en el mapa</button>)}
          <p className="hint">Un plan propuesto requiere aprobación. Un plan aprobado programa asignaciones; no confirma entregas ni calcula carreteras.</p>
        </> : <p className="muted">Este reporte aún no tiene incidente asociado.</p>}
      </section>
      <details className="tech"><summary>Identificadores y marcas temporales</summary><div className="tech-body"><dl className="ids">
        <div><dt>Ejecución / thread</dt><dd><code>{detail.id}</code></dd></div><div><dt>Reporte</dt><dd><code>{detail.report_id}</code></dd></div>
        {incidentId && <div><dt>Incidente</dt><dd><code>{incidentId}</code></dd></div>}
        {report && <div><dt>Comunidad</dt><dd><code>{report.community_id}</code></dd></div>}
        <div><dt>Recibido (UTC)</dt><dd><code>{detail.created_at}</code></dd></div><div><dt>Actualizado (UTC)</dt><dd><code>{detail.updated_at ?? 'No registrado'}</code></dd></div>
      </dl></div></details>
    </div>
  )
}
