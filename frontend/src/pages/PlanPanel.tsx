import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { ErrorMessage } from '../components'
import type { DistributionPlan, FleetTruck, PlanStatus } from '../types'

const planStatusLabels: Record<PlanStatus, string> = {
  QUEUED: 'En cola', RUNNING: 'Calculando', PROPOSED: 'Espera tu revisión',
  APPROVED: 'Aprobado: rutas programadas', REJECTED: 'Rechazado', ERROR: 'Error al calcular',
}

const unservedLabels: Record<string, string> = {
  COBERTURA_PARCIAL: 'Cobertura parcial',
  SIN_CISTERNA_COMPATIBLE: 'Sin cisterna compatible',
  SIN_TIEMPO_EN_TURNO: 'Sin tiempo en turno',
  SIN_UBICACION: 'Sin ubicación',
  SIN_DEMANDA_ESTIMADA: 'Sin demanda estimada',
  FUGA_REQUIERE_REPARACION: 'Fuga: requiere reparación',
}

function PlanReview({ plan, token }: { plan: DistributionPlan; token: string }) {
  const client = useQueryClient()
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => api<DistributionPlan>(`/admin/plans/${plan.id}/review`, {
      method: 'POST', body: JSON.stringify({ decision, reason }),
    }, token),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin'] }),
  })
  return (
    <form className="stack review card-inner" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
      <div className="review-header">
        <h3>Revisión humana del plan</h3>
        <span className="hitl-pill">Intervención Requerida (HITL)</span>
      </div>
      <label>
        Decisión sobre el plan
        <select value={decision} onChange={e => setDecision(e.target.value as 'APPROVE' | 'REJECT')}>
          <option value="APPROVE">Aprobar y programar rutas</option>
          <option value="REJECT">Rechazar (permite regenerar con otras cisternas)</option>
        </select>
      </label>
      <label>
        Razón de la decisión del plan
        <textarea required minLength={5} maxLength={600} rows={2} value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ej. Verificado con jefe de flota; cisternas en planta." />
      </label>
      <ErrorMessage error={mutation.error} />
      <button disabled={mutation.isPending}>
        {mutation.isPending ? 'Guardando…' : 'Registrar decisión del plan'}
      </button>
      <p className="muted text-sm">Aprobar programa las rutas. No confirma que el agua haya sido entregada.</p>
    </form>
  )
}

export function PlanPanel({ token }: { token: string }) {
  const client = useQueryClient()
  const [unavailable, setUnavailable] = useState<string[]>([])

  const plan = useQuery({
    queryKey: ['admin', 'plan'],
    queryFn: () => api<DistributionPlan | null>('/admin/plans/latest', {}, token),
    refetchInterval: query => ['QUEUED', 'RUNNING'].includes(query.state.data?.status ?? '') ? 1500 : 10000,
  })
  const fleet = useQuery({
    queryKey: ['admin', 'fleet'],
    queryFn: () => api<FleetTruck[]>('/admin/fleet', {}, token),
  })
  const generate = useMutation({
    mutationFn: () => api('/admin/plans', {
      method: 'POST', body: JSON.stringify({ unavailable_trucks: unavailable }),
    }, token),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'plan'] }),
  })

  const current = plan.data
  const busy = !!current && ['QUEUED', 'RUNNING', 'PROPOSED'].includes(current.status)
  const result = current?.result
  const coverage = result && result.demand_gallons
    ? Math.round((result.planned_gallons / result.demand_gallons) * 100) : 0

  return (
    <section className="card stack plan-panel" aria-labelledby="plan-title">
      <div className="row">
        <div>
          <span className="eyebrow">AGENTE PLANIFICADOR · SOLVER DETERMINÍSTICO</span>
          <h2 id="plan-title">Plan de distribución de cisternas</h2>
          <p className="muted text-sm">
            Usa solo incidentes cuya prioridad ya aprobaste. Asigna cisternas respetando capacidad,
            acceso vial, turnos y recarga en planta.
          </p>
        </div>
        {current && <span className={`plan-status plan-${current.status.toLowerCase()}`}>{planStatusLabels[current.status]}</span>}
      </div>

      <form className="stack plan-generate" onSubmit={e => { e.preventDefault(); generate.mutate() }}>
        <fieldset className="truck-picks" disabled={busy}>
          <legend>Cisternas no disponibles hoy</legend>
          {fleet.data?.map(t => (
            <label key={t.id} className="truck-pick">
              <input
                type="checkbox"
                checked={unavailable.includes(t.id)}
                onChange={e => setUnavailable(e.target.checked
                  ? [...unavailable, t.id] : unavailable.filter(id => id !== t.id))}
              />
              <span><strong>{t.name}</strong> · {t.capacity_gallons.toLocaleString('es-PA')} gal · {t.shift_start}–{t.shift_end}</span>
            </label>
          ))}
        </fieldset>
        <ErrorMessage error={fleet.error} />
        <ErrorMessage error={generate.error} />
        <button disabled={busy || generate.isPending}>
          {busy ? 'Hay un plan pendiente' : 'Generar plan de cisternas'}
        </button>
      </form>

      <ErrorMessage error={plan.error} />
      {current?.status === 'ERROR' && <p role="alert" className="error">El planificador falló ({current.error}). Puedes generar uno nuevo.</p>}

      {result && (
        <>
          <div className="plan-summary">
            <div><strong>{result.planned_gallons.toLocaleString('es-PA')}</strong><span>galones programados</span></div>
            <div><strong>{coverage}%</strong><span>de la demanda diaria ({result.demand_gallons.toLocaleString('es-PA')} gal)</span></div>
            <div><strong>{result.routes.length}</strong><span>cisternas con ruta</span></div>
            <div><strong>{result.routes.reduce((sum, r) => sum + r.km, 0).toFixed(0)} km</strong><span>recorrido estimado</span></div>
          </div>

          {result.routes.length === 0 && <p className="muted">No hay demandas aprobadas que puedan atenderse con la flota disponible.</p>}

          {result.routes.map(route => (
            <article key={route.truck_id} className="route-card">
              <header className="route-header">
                <h3>🚛 {route.truck_name}</h3>
                <span className="muted text-sm">
                  {route.capacity.toLocaleString('es-PA')} gal · Base {route.base_name} · Turno {route.shift} ·
                  {' '}{route.trips} {route.trips === 1 ? 'viaje' : 'viajes'} · {route.km} km · ~{route.fuel_gallons} gal combustible · regreso {route.ends_at}
                </span>
              </header>
              <table className="route-table">
                <thead>
                  <tr><th>Viaje</th><th>Llegada</th><th>Destino</th><th>Galones</th><th>Por qué</th></tr>
                </thead>
                <tbody>
                  {route.stops.map((stop, i) => (
                    <tr key={`${stop.community_id}-${i}`}>
                      <td>{stop.trip}</td>
                      <td>{stop.arrival}</td>
                      <td>{stop.name}</td>
                      <td>{stop.gallons.toLocaleString('es-PA')}</td>
                      <td className="muted">{stop.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}

          {result.unserved.length > 0 && (
            <div className="unserved">
              <h3>Demanda sin atender o parcial</h3>
              <ul>
                {result.unserved.map(u => (
                  <li key={u.community_id}>
                    <strong>{u.name}</strong> <span className="unserved-tag">{unservedLabels[u.reason] ?? u.reason}</span>
                    {u.gallons_missing ? ` · faltan ${u.gallons_missing.toLocaleString('es-PA')} gal` : ''}
                    <div className="muted text-sm">{u.detail}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="plan-explanation">
            <summary>Cómo decidió el planificador (política {result.policy_version})</summary>
            <ul>{result.explanation.map(line => <li key={line}>{line}</li>)}</ul>
          </details>
        </>
      )}

      {current?.status === 'PROPOSED' && <PlanReview key={current.id} plan={current} token={token} />}

      {current?.review && (
        <p className="muted">
          Decisión del coordinador: <strong>{current.review.decision === 'APPROVE' ? 'Aprobado' : 'Rechazado'}</strong> — {current.review.reason}
        </p>
      )}

      {current && (
        <details className="trace-details">
          <summary>Trazabilidad del plan ({current.events.length} eventos)</summary>
          <ol className="trace">
            {current.events.map((e, i) => (
              <li key={i} className="trace-item">
                <div className="trace-main">
                  <span className="agent-badge">{e.agent}</span>
                  <span className="event-name">{e.event}</span>
                  {e.tool && <code className="tool-name">{e.tool}</code>}
                </div>
                <small className="trace-time">{e.at} UTC</small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}
