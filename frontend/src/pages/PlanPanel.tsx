import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CaretRightIcon, InfoIcon, MapPinIcon, MapTrifoldIcon, TruckIcon, WarningIcon } from '@phosphor-icons/react'
import { api } from '../api'
import { EmptyState, ErrorMessage, Pill, Skeleton } from '../components'
import { arrivalText, coverageText, impactMetricLabels } from '../impact'
import { eventLabels, gallons, label, unservedLabels, when } from '../labels'
import type { DistributionPlan, FleetTruck, PlanStatus } from '../types'
import type { Lookups } from '../lookups'

const planStatusLabels: Record<PlanStatus, string> = {
  QUEUED: 'En cola', RUNNING: 'Calculando', PROPOSED: 'Propuesto: espera tu revisión',
  APPROVED: 'Aprobado: rutas programadas', REJECTED: 'Rechazado', ERROR: 'Error al calcular',
}

function Lifecycle({ status }: { status?: PlanStatus }) {
  const reviewed = status === 'APPROVED' || status === 'REJECTED'
  const steps: [string, string][] = [
    ['calc', status === 'QUEUED' || status === 'RUNNING' ? 'Calculando' : 'Calculado'],
    ['proposed', 'Propuesto'],
    ['review', status === 'REJECTED' ? 'Rechazado' : 'Aprobado'],
    ['delivered', 'Entrega realizada'],
  ]
  const state = (key: string) => {
    if (!status || status === 'ERROR') return ''
    if (key === 'calc') return status === 'QUEUED' || status === 'RUNNING' ? 'is-current' : 'is-done'
    if (key === 'proposed') return status === 'PROPOSED' ? 'is-current' : reviewed ? 'is-done' : ''
    if (key === 'review') return status === 'REJECTED' ? 'is-rejected' : status === 'APPROVED' ? 'is-current' : ''
    return ''
  }
  return (
    <ol className="lifecycle" aria-label="Etapas del plan">
      {steps.map(([key, text], i) => (
        <li key={key} className={state(key)} aria-current={state(key) === 'is-current' ? 'step' : undefined}>
          {i > 0 && <span className="sr-only">luego </span>}{text}
          {key === 'delivered' && <span className="sr-only"> (el sistema no la registra)</span>}
        </li>
      ))}
    </ol>
  )
}

function PlanReview({ plan, token }: { plan: DistributionPlan; token: string }) {
  const client = useQueryClient()
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const mutation = useMutation({
    mutationFn: () => api<DistributionPlan>(`/admin/plans/${plan.id}/review`, {
      method: 'POST', body: JSON.stringify({ decision, reason }),
    }, token),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin'] }),
  })
  const consequence = decision === 'APPROVE'
    ? 'Las rutas quedan programadas y los incidentes cubiertos pasan a «Cisterna programada»; se preparan avisos con la hora estimada para los ciudadanos. Aprobar no confirma que el agua se haya entregado.'
    : 'Ningún incidente cambia de estado. Después podrás generar un plan nuevo, por ejemplo marcando otras cisternas como no disponibles.'
  return (
    <form className="decision" aria-labelledby="plan-decision-title" onSubmit={e => { e.preventDefault(); setConfirming(true) }}>
      <div className="decision-head">
        <h3 id="plan-decision-title">Revisión humana del plan</h3>
        <p className="muted small">Decides sobre el plan completo. No cambia la prioridad aprobada de ningún incidente.</p>
      </div>
      <fieldset disabled={confirming || mutation.isPending} className="stack">
        <div className="choices cols" role="radiogroup" aria-label="Decisión sobre el plan">
          <label className="choice">
            <input type="radio" name="plan-decision" checked={decision === 'APPROVE'} onChange={() => { setDecision('APPROVE'); setConfirming(false) }} />
            <span className="choice-body"><span>Aprobar y programar rutas</span><small>Las cisternas salen según este plan</small></span>
          </label>
          <label className="choice danger">
            <input type="radio" name="plan-decision" checked={decision === 'REJECT'} onChange={() => { setDecision('REJECT'); setConfirming(false) }} />
            <span className="choice-body"><span>Rechazar el plan</span><small>Permite generar otro con distinta flota</small></span>
          </label>
        </div>
        <div className="field">
          <label htmlFor="plan-reason">Razón de la decisión del plan</label>
          <textarea id="plan-reason" required minLength={5} maxLength={600} rows={2} value={reason}
            onChange={e => setReason(e.target.value)} placeholder="Ejemplo: verificado con el jefe de flota; cisternas en planta." />
        </div>
        <p className="consequence"><strong>Qué pasará: </strong>{consequence}</p>
      </fieldset>
      {confirming ? (
        <div className={`confirm ${decision === 'REJECT' ? 'danger' : ''}`} role="group" aria-labelledby="plan-confirm-title">
          <strong id="plan-confirm-title">¿Confirmas {decision === 'APPROVE' ? 'aprobar y programar estas rutas' : 'rechazar este plan'}? La decisión no se puede cambiar.</strong>
          <ErrorMessage error={mutation.error} />
          <div className="confirm-actions">
            <button type="button" className={decision === 'REJECT' ? 'danger' : ''} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Guardando…' : 'Confirmar decisión del plan'}
            </button>
            <button type="button" className="secondary" disabled={mutation.isPending} onClick={() => { setConfirming(false); mutation.reset() }}>
              Volver a editar
            </button>
          </div>
        </div>
      ) : (
        <button type="submit" style={{ justifySelf: 'start' }}>Registrar decisión del plan</button>
      )}
    </form>
  )
}

function Impact({ plan }: { plan: NonNullable<DistributionPlan['result']> }) {
  const volumen = plan.impact?.strategies?.volumen
  const aguaia = plan.impact?.strategies?.aguaia
  const vsVolumen = plan.impact?.aguaia_vs?.volumen
  if (!volumen || !aguaia || !vsVolumen) return null
  const agMedian = aguaia.critical_first_arrival_minutes?.median ?? null
  const volMedian = volumen.critical_first_arrival_minutes?.median ?? null
  const minutes = (value: number | null) => (value === null ? 'sin entrega' : `${value} min`)
  return (
    <section className="impact" data-testid="impact-card" aria-labelledby="impact-title">
      <div className="stack-sm">
        <span className="kicker">Comparación con atender por volumen de reportes</span>
        <h3 id="impact-title">
          HidroAgente frente a por volumen de reportes: {coverageText(vsVolumen.critical_coverage_pp, aguaia.critical_coverage_pct)} · {arrivalText(agMedian, volMedian)}
        </h3>
        <p className="hint">Mismo planificador, misma flota y mismas demandas; solo cambia el orden de atención.</p>
      </div>
      <div className="impact-grid">
        <div className="impact-col ours">
          <span className="small muted">Orden de HidroAgente (puntaje aprobado)</span>
          <strong>{aguaia.critical_coverage_pct ?? 'Sin dato'} %</strong>
          <span className="small">de la demanda crítica cubierta</span>
          <span className="hint">1ª entrega crítica: {minutes(agMedian)} (mediana). {aguaia.communities_served}/{aguaia.communities_total} comunidades.</span>
        </div>
        <div className="impact-col">
          <span className="small muted">Por volumen de reportes</span>
          <strong>{volumen.critical_coverage_pct ?? 'Sin dato'} %</strong>
          <span className="small">de la demanda crítica cubierta</span>
          <span className="hint">1ª entrega crítica: {minutes(volMedian)} (mediana). {volumen.communities_served}/{volumen.communities_total} comunidades.</span>
        </div>
      </div>
      {vsVolumen.not_better.length > 0 && (
        <p className="hint">
          Sin ventaja en: {vsVolumen.not_better.map(key => impactMetricLabels[key] ?? key).join(', ')}. Mismo solver determinístico, misma flota y mismas demandas.
        </p>
      )}
    </section>
  )
}

export function PlanPanel({ token, lookups, onShowMap }: { token: string; lookups?: Lookups; onShowMap?: (planId: string) => void }) {
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
  // While a plan is pending, show the fleet it was computed with, not the next request draft.
  const excluded = busy && current ? current.request.unavailable_trucks : unavailable
  const coverage = result && result.demand_gallons ? Math.round((result.planned_gallons / result.demand_gallons) * 100) : 0
  const missing = result ? Math.max(result.demand_gallons - result.planned_gallons, 0) : 0
  // Places the solver could not size (no coordinates or no demand estimate) are outside demand_gallons.
  const noDemand = result?.unserved.filter(u => ['SIN_UBICACION', 'SIN_DEMANDA_ESTIMADA'].includes(u.reason)).length ?? 0

  // One row per community: several trucks or trips may serve the same place.
  const served = new Map<string, { name: string; gallons: number; first: string; trucks: Set<string> }>()
  for (const route of result?.routes ?? []) {
    for (const stop of route.stops) {
      const row = served.get(stop.community_id) ?? { name: stop.name, gallons: 0, first: stop.arrival, trucks: new Set() }
      row.gallons += stop.gallons
      row.first = stop.arrival < row.first ? stop.arrival : row.first
      row.trucks.add(route.truck_name)
      served.set(stop.community_id, row)
    }
  }

  return (
    <section className="plan" aria-labelledby="plan-title">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 id="plan-title">Plan de distribución de cisternas</h2>
          <p>El planificador usa solo incidentes cuya prioridad ya aprobaste y asigna cisternas respetando capacidad, acceso vial, turnos y recarga en planta. Un plan aprobado programa rutas; el sistema no registra si la entrega se realizó.</p>
        </div>
        {current && <Pill tone={current.status === 'PROPOSED' ? 'warn' : current.status === 'APPROVED' ? 'ok' : current.status === 'ERROR' || current.status === 'REJECTED' ? 'danger' : 'progress'}>{planStatusLabels[current.status]}</Pill>}
      </div>

      {current && current.status !== 'ERROR' && <Lifecycle status={current.status} />}
      <ErrorMessage error={plan.error} />
      {plan.isPending && <div className="panel" role="status" aria-label="Cargando plan"><Skeleton lines={4} /></div>}
      {current?.status === 'ERROR' && <p role="alert" className="error">El planificador falló ({current.error}). Puedes generar uno nuevo.</p>}

      <form className="panel stack" onSubmit={e => { e.preventDefault(); generate.mutate() }} aria-labelledby="fleet-title">
        <div className="spread">
          <div className="stack-sm" style={{ gap: 2 }}>
            <h3 id="fleet-title">Flota para el próximo plan</h3>
            <p className="hint">Marca las cisternas que hoy no pueden salir. Las demás quedan disponibles para el cálculo.</p>
          </div>
          <button type="submit" disabled={busy || generate.isPending}>
            {busy ? 'Hay un plan pendiente' : generate.isPending ? 'Solicitando…' : 'Generar plan de cisternas'}
          </button>
        </div>
        {busy && <p className="hint">Solo puede haber un plan en cálculo o en revisión. Abajo ves la flota con la que se calculó; decide sobre él para generar otro.</p>}
        {fleet.isPending && <Skeleton lines={2} />}
        <fieldset disabled={busy}>
          <legend className="sr-only">Cisternas no disponibles hoy</legend>
          <div className="fleet">
            {fleet.data?.map(t => (
              <label key={t.id} className="choice">
                <input type="checkbox" checked={excluded.includes(t.id)}
                  onChange={e => setUnavailable(e.target.checked ? [...unavailable, t.id] : unavailable.filter(id => id !== t.id))} />
                <span className="choice-body">
                  <span>{t.name} {excluded.includes(t.id) && <Pill tone="danger">No disponible</Pill>}</span>
                  <small className="num">{gallons(t.capacity_gallons)} · turno {t.shift_start} a {t.shift_end}{t.status !== 'disponible' ? ` · estado: ${t.status}` : ''}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <ErrorMessage error={fleet.error} />
        <ErrorMessage error={generate.error} />
      </form>

      {!plan.isPending && !current && (
        <div className="panel"><EmptyState icon={<TruckIcon />} title="Todavía no hay planes">
          Aprueba la prioridad de al menos un incidente y genera un plan para ver aquí la propuesta de rutas.
        </EmptyState></div>
      )}

      {result && (
        <>
          <section className="panel stack" aria-labelledby="coverage-title">
            <h3 id="coverage-title">Agua necesaria frente a agua programada</h3>
            <div className="figures" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <div className="figure"><strong>{gallons(result.demand_gallons)}</strong><span>Necesidad diaria estimada</span></div>
              <div className="figure"><strong>{gallons(result.planned_gallons)}</strong><span>Programado en este plan</span></div>
              <div className="figure"><strong>{result.demand_gallons ? `${coverage} %` : 'Sin demanda'}</strong><span>de la necesidad cubierta</span></div>
              <div className="figure"><strong>{result.routes.length}</strong><span>{result.routes.length === 1 ? 'cisterna con ruta' : 'cisternas con ruta'}</span></div>
            </div>
            {result.demand_gallons > 0 && (
              <div className="coverage">
                <div className="coverage-bar" role="img" aria-label={`${coverage} % programado, faltan ${gallons(missing)}`}>
                  <span className="planned" style={{ width: `${Math.min(coverage, 100)}%` }} />
                  <span className="missing" style={{ width: `${Math.max(100 - coverage, 0)}%` }} />
                </div>
                <div className="legend"><span><i />Programado</span>{missing > 0 && <span><i className="missing" />Sin cubrir: {gallons(missing)}</span>}</div>
              </div>
            )}
            {noDemand > 0 && (
              <p className="note warn"><WarningIcon aria-hidden="true" />La necesidad no incluye {noDemand} {noDemand === 1 ? 'comunidad' : 'comunidades'} sin ubicación o sin demanda estimada: el porcentaje no las cuenta. Están en «Necesidades sin cubrir».</p>
            )}
            <p className="hint">Recorrido estimado: {result.routes.reduce((sum, r) => sum + r.km, 0).toFixed(0)} km. Las horas son estimaciones del planificador, no posiciones reales de las cisternas.</p>
            {onShowMap && current && (
              <button type="button" className="secondary small" style={{ justifySelf: 'start' }} onClick={() => onShowMap(current.id)}>
                <MapTrifoldIcon aria-hidden="true" /> Ver asignación en el mapa
              </button>
            )}
          </section>

          <div className="two-col">
            <section className="panel stack-sm" aria-labelledby="served-title">
              <h3 id="served-title">Comunidades con entrega programada ({served.size})</h3>
              {served.size === 0 ? <p className="hint">Ninguna comunidad recibe agua en este plan.</p> : (
                <ul className="served">
                  {[...served.entries()].map(([id, row]) => (
                    <li key={id}>
                      <strong>{row.name}</strong>
                      <span className="num">{gallons(row.gallons)}</span>
                      <span className="why">Primera llegada {row.first} · {[...row.trucks].join(', ')}{lookups?.community(id) ? `, ${lookups.community(id)!.district}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel stack-sm" aria-labelledby="unserved-title">
              <h3 id="unserved-title">Necesidades sin cubrir o parciales ({result.unserved.length})</h3>
              {result.unserved.length === 0 ? <p className="hint">Toda la demanda aprobada queda cubierta.</p> : (
                <ul className="served">
                  {result.unserved.map(u => (
                    <li key={u.community_id}>
                      <strong>{u.name}</strong>
                      <Pill tone={u.reason === 'COBERTURA_PARCIAL' ? 'warn' : 'danger'}>{label(unservedLabels, u.reason)}</Pill>
                      <span className="why">
                        {u.gallons_missing ? `Faltan ${gallons(u.gallons_missing)}. ` : ''}{u.detail}
                        {u.reason === 'SIN_UBICACION' && ' Sin coordenadas verificadas no se calcula ruta ni hora.'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <Impact plan={result} />

          <section className="stack-sm" aria-labelledby="routes-title">
            <h3 id="routes-title">Rutas por cisterna</h3>
            {result.routes.length === 0 && <p className="note"><InfoIcon aria-hidden="true" />No hay demandas aprobadas que puedan atenderse con la flota disponible.</p>}
            {result.routes.map((route, index) => (
              <details key={route.truck_id} className="route" open={index === 0}>
                <summary>
                  <span className="route-icon" aria-hidden="true"><TruckIcon /></span>
                  <span className="stack-sm" style={{ gap: 2 }}>
                    <strong>{route.truck_name}</strong>
                    <span className="route-meta num">
                      {gallons(route.gallons)} en {route.trips} {route.trips === 1 ? 'viaje' : 'viajes'} (capacidad {gallons(route.capacity)} por viaje) · {route.km} km · regreso {route.ends_at ?? 'sin dato'}
                    </span>
                  </span>
                  <CaretRightIcon aria-hidden="true" />
                </summary>
                <p className="hint" style={{ padding: '0 16px 8px' }}>Base {route.base_name}, turno {route.shift}, ~{route.fuel_gallons} gal de combustible.</p>
                <ol className="stops">
                  {route.stops.map((stop, i) => (
                    <li key={`${stop.community_id}-${i}`} className="stop">
                      <time>{stop.arrival}<span className="trip">viaje {stop.trip}</span></time>
                      <strong>{stop.name}</strong>
                      <span className="gal num">{gallons(stop.gallons)}</span>
                      <span className="why">{stop.reason}</span>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </section>

          <details className="tech">
            <summary><CaretRightIcon className="chev" aria-hidden="true" /> Cómo decidió el planificador (política {result.policy_version})</summary>
            <div className="tech-body"><ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>{result.explanation.map(line => <li key={line}>{line}</li>)}</ul></div>
          </details>
        </>
      )}

      {current?.status === 'PROPOSED' && <PlanReview key={current.id} plan={current} token={token} />}

      {current?.review && (
        <section className="record" aria-label="Decisión sobre el plan">
          <h3>Decisión del coordinador: {current.review.decision === 'APPROVE' ? 'Aprobado' : 'Rechazado'}</h3>
          <p><strong>Razón:</strong> {current.review.reason}</p>
          {current.review.decision === 'APPROVE' && (
            <p className="note warn"><WarningIcon aria-hidden="true" />Rutas programadas. La entrega real se confirma fuera de HidroAgente: el sistema no registra si el agua llegó.</p>
          )}
        </section>
      )}

      {current && (
        <details className="tech">
          <summary><CaretRightIcon className="chev" aria-hidden="true" /> Trazabilidad del plan ({current.events.length} eventos)</summary>
          <div className="tech-body">
            <dl className="ids">
              <div><dt>Plan</dt><dd><code>{current.id}</code></dd></div>
              <div><dt>Creado</dt><dd>{when(current.created_at)}</dd></div>
              <div><dt>No disponibles</dt><dd>{current.request.unavailable_trucks.join(', ') || 'Ninguna'}</dd></div>
            </dl>
            <ol className="trace">
              {current.events.map((e, i) => (
                <li key={i} className="audit">
                  <div className="trace-line">
                    <span className="agent">{e.agent}</span>
                    <span>{label(eventLabels, e.event)}</span>
                    <code>{e.event}{e.tool ? ` · ${e.tool}` : ''}</code>
                  </div>
                  <time>{when(e.at)}</time>
                  {Object.keys(e.detail ?? {}).length > 0 && (
                    <details className="inline"><summary>Ver datos</summary><pre>{JSON.stringify(e.detail, null, 2)}</pre></details>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </details>
      )}

      {!result && current && current.status !== 'ERROR' && (
        <p className="note"><MapPinIcon aria-hidden="true" />El plan aparecerá aquí en cuanto el planificador termine.</p>
      )}
    </section>
  )
}
