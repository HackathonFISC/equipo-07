import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, polling } from '../api'
import { ErrorMessage, StatusBadge } from '../components'
import type { Detail, Execution, Incident, Review } from '../types'

function ReviewPanel({ detail, token }: { detail: Detail; token: string }) {
  const client = useQueryClient()
  const [decision, setDecision] = useState<Review['decision']>('APPROVE')
  const [reason, setReason] = useState('')
  const [score, setScore] = useState('')
  const [association, setAssociation] = useState<Review['association']>()
  const mutation = useMutation({
    mutationFn: () => api(`/executions/${detail.id}/resume`, { method: 'POST', body: JSON.stringify({
      decision, reason, ...(decision === 'CORRECT' ? { corrected_score: Number(score) } : {}),
      ...(association ? { association } : {}),
    }) }, token),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin'] }),
  })
  return <form className="stack review" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
    <h3>Revisión humana</h3>
    <label>Decisión<select value={decision} onChange={e => setDecision(e.target.value as Review['decision'])}>
      <option value="APPROVE">Aprobar límite inferior de la prioridad</option>
      <option value="REJECT">Rechazar propuesta</option><option value="CORRECT">Corregir puntuación</option>
    </select></label>
    {decision === 'CORRECT' && <label>Puntuación corregida
      <input required type="number" min="0" max="100" step="1" value={score}
        onChange={e => setScore(e.target.value)} /></label>}
    {detail.association?.status === 'PENDING_REVIEW' && decision !== 'REJECT' &&
      <label>Asociación tentativa<select required value={association || ''}
        onChange={e => setAssociation(e.target.value as Review['association'])}>
        <option value="">Selecciona una resolución</option>
        <option value="CONFIRM">Confirmar que es el mismo incidente</option>
        <option value="NEW">Crear un incidente distinto</option>
      </select></label>}
    <label>Razón de la decisión<textarea required minLength={5} maxLength={600} rows={3}
      value={reason} onChange={e => setReason(e.target.value)} /></label>
    <ErrorMessage error={mutation.error} />
    <button disabled={mutation.isPending || mutation.isSuccess}>
      {mutation.isPending ? 'Registrando…' : mutation.isSuccess ? 'Decisión enviada' : 'Registrar decisión'}
    </button>
  </form>
}

function ExecutionDetail({ id, token }: { id: string; token: string }) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['admin', 'detail', id],
    queryFn: () => api<Detail>(`/admin/executions/${id}`, {}, token),
    refetchInterval: q => polling(q.state.data?.status),
  })
  const retry = useMutation({
    mutationFn: () => api(`/executions/${id}/retry`, { method: 'POST' }, token),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin'] }),
  })
  if (query.isPending) return <p role="status">Cargando ejecución…</p>
  if (!query.data) return <ErrorMessage error={query.error} />
  const detail = query.data
  const proposal = detail.proposal
  const labels: Record<string, string> = { hours: 'Duración', critical: 'Institución crítica',
    vulnerability: 'Vulnerabilidad del sector', population: 'Población del sector' }
  return <article className="card stack">
    <div className="row"><h2>Propuesta y decisión</h2><StatusBadge status={detail.status} /></div>
    <code className="muted break-all">{detail.id}</code>
    <p className="muted">{detail.is_simulated ? 'Interpretación simulada' : 'Proveedor LLM'} · {detail.provider}</p>
    <ErrorMessage error={query.error} />
    {proposal ? <>
      <div className="score"><strong>{proposal.priority.score_min}–{proposal.priority.score_max}</strong>
        <span>/ 100 puntos · política de demostración</span></div>
      {proposal.priority.immediate_review && <p className="error">Institución crítica: revisar inmediatamente.</p>}
      <p>{proposal.explanation}</p>
      <p className="muted">Instantánea del reporte; no suma el volumen de reportes del incidente.</p>
      <dl className="factors">{Object.entries(proposal.priority.factors).map(([name, bounds]) =>
        <div key={name}><dt>{labels[name] || name}</dt><dd>{bounds[0]}–{bounds[1]} puntos</dd></div>)}</dl>
      <p className="muted">Confianza de datos: {proposal.priority.confidence_level} · {proposal.priority.policy_version}</p>
      <ul className="flags">{proposal.priority.flags.map(flag => <li key={flag}>{flag.replaceAll('_', ' ')}</li>)}</ul>
      {detail.association && <p>Consolidación: {detail.association.reasoning} ({detail.association.status})</p>}
      {detail.status === 'WAITING_APPROVAL' && <ReviewPanel key={id} detail={detail} token={token} />}
    </> : <p>{detail.status === 'NEEDS_INFORMATION' ? 'Se necesita un reporte más específico.' : 'Todavía no hay propuesta.'}</p>}
    {detail.status === 'ERROR' && <div>
      <p role="alert">Procesamiento interrumpido: {detail.error}. No se sustituyó el proveedor.</p>
      <button disabled={retry.isPending} onClick={() => retry.mutate()}>Reintentar ejecución</button>
      <ErrorMessage error={retry.error} />
    </div>}
    {detail.review && <div className="note">
      <h3>Decisión registrada: {detail.review.payload.decision}</h3>
      <p>{detail.review.payload.reason}</p>
      <p>Puntuación final: {proposal?.final_score ?? 'Sin puntuación aprobada'}</p>
      <p>{detail.review.applied_at ? 'Aplicada y persistida' : 'Pendiente de aplicar por el worker'} · {detail.review.actor}</p>
      <p>La decisión no implica despacho ni entrega de agua.</p>
    </div>}
    <section aria-label="Trazabilidad" className="stack">
      <h3>Trazabilidad de la ejecución</h3>
      <ol className="trace">{detail.traces.map(t => <li key={t.id}>
        <div><strong>{t.agent}</strong> · {t.event} {t.tool && <code>{t.tool}</code>}</div>
        <small>{t.created_at} UTC · {t.category}</small>
        {Object.keys(t.detail).length > 0 && <details><summary>Datos del evento</summary>
          <pre>{JSON.stringify(t.detail, null, 2)}</pre></details>}
      </li>)}</ol>
    </section>
  </article>
}

export function CoordinationPage({ token }: { token: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const executions = useQuery({ queryKey: ['admin', 'executions', page],
    queryFn: () => api<Execution[]>(`/admin/executions?offset=${page * 25}&limit=25`, {}, token),
    refetchInterval: 5000,
  })
  const incidents = useQuery({ queryKey: ['admin', 'incidents', page],
    queryFn: () => api<Incident[]>(`/admin/incidents?offset=${page * 25}&limit=25`, {}, token),
    refetchInterval: 5000,
  })
  return <section className="stack">
    <div><p className="eyebrow">CENTRO DE COORDINACIÓN</p><h1>Decisiones con contexto.</h1>
      <p className="muted">Revisa la evidencia, resuelve la incertidumbre y registra tu decisión.</p></div>
    <div className="coord-grid">
      <aside className="stack">
        <div className="card stack"><h2>Reportes y ejecuciones</h2>
          {executions.isPending && <p role="status">Cargando reportes…</p>}
          <ErrorMessage error={executions.error} />
          {executions.data?.length === 0 && <p>Aún no hay reportes en esta página.</p>}
          {executions.data?.map(e => <button className={`execution ${selected === e.id ? 'selected' : ''}`}
            key={e.id} onClick={() => setSelected(e.id)} aria-pressed={selected === e.id}>
            <code>{e.id.slice(0, 8)}</code><StatusBadge status={e.status} />
            <small>{e.created_at} UTC</small>
          </button>)}
          <div className="row"><button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
            <span>Página {page + 1}</span><button className="secondary"
              disabled={(executions.data?.length || 0) < 25 && (incidents.data?.length || 0) < 25}
              onClick={() => setPage(page + 1)}>Siguiente</button></div>
        </div>
        <div className="card stack"><h2>Incidentes consolidados</h2>
          <ErrorMessage error={incidents.error} />
          {incidents.isPending && <p role="status">Cargando incidentes…</p>}
          {incidents.data?.length === 0 && <p>Sin incidentes en esta página.</p>}
          {incidents.data?.map(i => <div className="incident" key={i.id}>
            <strong>{i.community_id}</strong><p>{i.summary}</p>
            <small>{i.kind} · {i.status} · {i.id.slice(0, 8)}</small>
          </div>)}
        </div>
      </aside>
      {selected ? <ExecutionDetail key={selected} id={selected} token={token} /> :
        <div className="card empty">Selecciona una ejecución para ver su prioridad, revisión y trazas.</div>}
    </div>
  </section>
}
