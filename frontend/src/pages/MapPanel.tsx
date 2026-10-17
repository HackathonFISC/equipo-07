import { useMemo, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { InfoIcon, MapTrifoldIcon, TruckIcon, WarningIcon } from '@phosphor-icons/react'
import { api } from '../api'
import { EmptyState, ErrorMessage, Pill, Skeleton } from '../components'
import { gallons, incidentStatusLabels, label, unservedLabels, when } from '../labels'
import type { Boundaries, IncidentStatus, MapPlace, PlanMap, PlanStatus, PlanSummary, ReportActivity } from '../types'

type Frame = 'all' | 'urban'

// Equirectangular projection scaled by cos(8.9° N): at province scale the distortion is negligible.
const K = Math.cos((8.9 * Math.PI) / 180)
const xy = (lng: number, lat: number): [number, number] => [lng * K * 1000, -lat * 1000]
const URBAN = ['Arraiján', 'La Chorrera']

const ringPath = (ring: number[][]) => `M${ring.map(([lng, lat]) => xy(lng, lat).map(v => v.toFixed(1)).join(' ')).join('L')}Z`

const planLabels: Record<PlanStatus, [string, string]> = {
  QUEUED: ['En cola', 'progress'], RUNNING: ['Calculando', 'progress'],
  PROPOSED: ['Propuesta sin aprobar', 'warn'], APPROVED: ['Aprobado: programado', 'ok'],
  REJECTED: ['Rechazado', 'danger'], ERROR: ['Error al calcular', 'danger'],
}

function locationText(place: MapPlace, shaped: Set<string>) {
  if (place.location === 'ESTIMADA') return 'Ubicación aproximada en el mapa'
  return place.corregimiento_id && shaped.has(place.corregimiento_id)
    ? 'Sin punto en el catálogo: se resalta su corregimiento' : 'Sin punto ni polígono: no aparece en el mapa'
}

function MapCanvas({ boundaries, frame, title, areaClass, selected, onSelect, children }: {
  boundaries: Boundaries; frame: Frame; title: string; areaClass: (id: string) => string
  selected?: string | null; onSelect?: (id: string) => void; children?: (unit: number) => ReactNode
}) {
  const shapes = useMemo(() => boundaries.features.map(f => ({
    ...f.properties, d: f.geometry.coordinates.map(poly => poly.map(ringPath).join('')).join(''),
    points: f.geometry.coordinates.flat(2).map(([lng, lat]) => xy(lng, lat)),
  })), [boundaries])
  const box = useMemo(() => {
    const points = shapes.filter(s => frame === 'all' || URBAN.includes(s.district)).flatMap(s => s.points)
    const xs = points.map(p => p[0]), ys = points.map(p => p[1])
    const [x, y] = [Math.min(...xs), Math.min(...ys)]
    const [w, h] = [Math.max(...xs) - x, Math.max(...ys) - y]
    return { x: x - w * 0.03, y: y - h * 0.03, w: w * 1.06, h: h * 1.06 }
  }, [shapes, frame])
  // The selected area is drawn last so its outline is not covered by its neighbours.
  const ordered = [...shapes.filter(s => s.id !== selected), ...shapes.filter(s => s.id === selected)]
  return (
    <svg className="map" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={title}>
      {ordered.map(s => (
        <path key={s.id} d={s.d} className={`area ${areaClass(s.id)}${s.id === selected ? ' is-selected' : ''}`}
          onClick={onSelect && (() => onSelect(s.id))}>
          <title>{`${s.name} (${s.district})`}</title>
        </path>
      ))}
      {children?.(box.w / 100)}
    </svg>
  )
}

function FrameSwitch({ frame, setFrame }: { frame: Frame; setFrame: (f: Frame) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Encuadre del mapa">
      <button type="button" aria-pressed={frame === 'all'} onClick={() => setFrame('all')}>Panamá Oeste</button>
      <button type="button" aria-pressed={frame === 'urban'} onClick={() => setFrame('urban')}>Arraiján y La Chorrera</button>
    </div>
  )
}

// Equal-interval classes from 1 to the maximum; 0 keeps its own «sin reportes» class.
const shade = (value: number, max: number) => (value ? Math.ceil((4 * value) / max) : 0)
function classes(max: number) {
  return [1, 2, 3, 4].map(i => [i, Math.floor(((i - 1) * max) / 4) + 1, Math.floor((i * max) / 4)])
    .filter(([, lo, hi]) => lo <= hi)
}

function ActivityLayer({ token, boundaries }: { token: string; boundaries: Boundaries }) {
  const [days, setDays] = useState<number | null>(null)
  const [status, setStatus] = useState<IncidentStatus | ''>('')
  const [metric, setMetric] = useState<'reports' | 'incidents'>('reports')
  const [frame, setFrame] = useState<Frame>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const params = new URLSearchParams()
  if (days) params.set('days', String(days))
  if (status) params.set('status', status)
  const activity = useQuery({
    queryKey: ['admin', 'map', 'activity', days, status],
    queryFn: () => api<ReportActivity>(`/admin/map/activity?${params}`, {}, token),
    refetchInterval: 15000, placeholderData: keepPreviousData,
  })
  const areas = activity.data?.corregimientos ?? []
  const byId = new Map(areas.map(a => [a.id, a]))
  const max = Math.max(0, ...areas.map(a => a[metric]))
  const active = areas.filter(a => a[metric] > 0).sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name))
  const unshaped = areas.filter(a => a.geometry === 'SIN_GEOMETRIA')
  const current = selected ? byId.get(selected) : undefined
  const noun = metric === 'reports' ? 'reportes' : 'incidentes distintos'
  const periods: [number | null, string][] = [[1, '24 h'], [7, '7 días'], [30, '30 días'], [null, 'Todo']]

  return (
    <div className="map-layout">
      <div className="stack">
        <div className="map-toolbar">
          <div className="segmented" role="group" aria-label="Periodo">
            {periods.map(([value, text]) => (
              <button key={text} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{text}</button>
            ))}
          </div>
          <label className="field inline-field">
            <span>Estado del incidente</span>
            <select value={status} onChange={e => setStatus(e.target.value as IncidentStatus | '')}>
              <option value="">Todos</option>
              {Object.entries(incidentStatusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <div className="segmented" role="group" aria-label="Qué se colorea">
            <button type="button" aria-pressed={metric === 'reports'} onClick={() => setMetric('reports')}>Reportes</button>
            <button type="button" aria-pressed={metric === 'incidents'} onClick={() => setMetric('incidents')}>Incidentes distintos</button>
          </div>
        </div>
        <div className="map-frame">
          <FrameSwitch frame={frame} setFrame={setFrame} />
          {activity.isPending ? <div role="status" aria-label="Cargando actividad"><Skeleton lines={6} /></div> : (
            <MapCanvas boundaries={boundaries} frame={frame} selected={selected} onSelect={setSelected}
              title={`Mapa de ${noun} por corregimiento: ${active.length} con actividad`}
              areaClass={id => byId.has(id) ? `shade-${shade(byId.get(id)![metric], max)}` : 'shade-none'} />
          )}
          <div className="legend map-legend" aria-label="Leyenda">
            <span><i className="swatch shade-0" />Sin {noun}</span>
            {classes(max).map(([i, lo, hi]) => (
              <span key={i}><i className={`swatch shade-${i}`} />{lo === hi ? lo : `${lo} a ${hi}`}</span>
            ))}
          </div>
        </div>
        <ErrorMessage error={activity.error} />
        <p className="hint">
          Límites: {boundaries.source} (licencia {boundaries.license}), {boundaries.features.length} de {boundaries.features.length + boundaries.missing_in_source.length} corregimientos
          del INEC 2023. Un reporte cuenta en el corregimiento elegido por el ciudadano; si eligió un punto del catálogo (hospital,
          referencia), en el corregimiento que el catálogo declara para ese punto.
        </p>
      </div>

      <aside className="stack" aria-label="Detalle de la zona">
        {activity.data && (
          <div className="figures">
            <div className="figure"><strong>{activity.data.reports}</strong><span>Reportes</span></div>
            <div className="figure"><strong>{activity.data.incidents}</strong><span>Incidentes distintos</span></div>
          </div>
        )}
        {current ? (
          <section className="panel stack-sm zone" aria-live="polite" aria-labelledby="zone-title">
            <div className="spread">
              <div><h3 id="zone-title">{current.name}</h3><p className="small muted">Distrito de {current.district}</p></div>
              <button type="button" className="ghost small" onClick={() => setSelected(null)}>Quitar selección</button>
            </div>
            <dl className="ids">
              <div><dt>Reportes</dt><dd className="num">{current.reports}</dd></div>
              <div><dt>Incidentes distintos</dt><dd className="num">{current.incidents}</dd></div>
              <div><dt>Población 2023</dt><dd className="num">{current.population?.toLocaleString('es-PA') ?? 'Sin dato'}</dd></div>
            </dl>
            {current.catalog_point_reports > 0 && (
              <p className="hint">{current.catalog_point_reports === 1 ? '1 de estos reportes se hizo' : `${current.catalog_point_reports} de estos reportes se hicieron`} sobre un punto del catálogo que el equipo ubicó aquí, no el ciudadano.</p>
            )}
            {current.geometry === 'SIN_GEOMETRIA' && <p className="note warn"><WarningIcon aria-hidden="true" />La fuente de límites no tiene polígono para este corregimiento: no se colorea en el mapa.</p>}
          </section>
        ) : <p className="hint">Elige un corregimiento en el mapa o en la lista para ver sus cifras.</p>}

        <section className="panel stack-sm" aria-labelledby="ranking-title">
          <h3 id="ranking-title">Corregimientos con {noun} ({active.length})</h3>
          {activity.data && active.length === 0 && <EmptyState title={`Sin ${noun} con estos filtros`}>Cambia el periodo o el estado para ver más.</EmptyState>}
          <ol className="queue">
            {active.map(a => (
              <li key={a.id}>
                <button type="button" className="item" aria-pressed={selected === a.id} onClick={() => setSelected(a.id)}>
                  <span className="item-top">
                    <span className="item-title">{a.name}</span>
                    <span className="num"><strong>{a[metric]}</strong></span>
                  </span>
                  <span className="item-meta">
                    <span>{a.district}</span>
                    <span>{a.reports} rep. · {a.incidents} inc.</span>
                    {a.geometry === 'SIN_GEOMETRIA' && <span className="alert">Sin polígono</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {unshaped.length > 0 && (
          <p className="note warn">
            <WarningIcon aria-hidden="true" />
            <span>Sin polígono en la fuente: {unshaped.map(a => `${a.name} (${a.reports} rep.)`).join(', ')}. Son corregimientos
              del INEC 2023 que la capa de límites aún no separa; sus reportes están en la lista, no en el mapa.</span>
          </p>
        )}
        {activity.data && activity.data.unassigned.reports > 0 && (
          <p className="note"><InfoIcon aria-hidden="true" />
            {activity.data.unassigned.reports} {activity.data.unassigned.reports === 1 ? 'reporte' : 'reportes'} de sectores sin corregimiento
            en el catálogo (sectores de demostración) no aparecen en el mapa.</p>
        )}
      </aside>
    </div>
  )
}

function PlanLayer({ token, boundaries, initialPlan }: { token: string; boundaries: Boundaries; initialPlan?: string | null }) {
  const [chosen, setChosen] = useState<string | null>(initialPlan ?? null)
  const [truck, setTruck] = useState<string | null>(null)
  const [frame, setFrame] = useState<Frame>('urban')
  const plans = useQuery({
    queryKey: ['admin', 'plans', 'list'],
    queryFn: () => api<PlanSummary[]>('/admin/plans?limit=20', {}, token),
    refetchInterval: 10000,
  })
  const planId = chosen ?? plans.data?.[0]?.id ?? null
  const plan = useQuery({
    queryKey: ['admin', 'map', 'plan', planId],
    queryFn: () => api<PlanMap>(`/admin/map/plans/${planId}`, {}, token),
    enabled: !!planId,
    refetchInterval: q => ['QUEUED', 'RUNNING'].includes(q.state.data?.status ?? '') ? 1500 : 10000,
  })
  const data = plan.data
  const routes = data?.routes ?? []
  // One marker per truck and place; several trucks at one place sit side by side.
  const visits = new Map<string, { place: MapPlace; trucks: { index: number; orders: number[] }[] }>()
  routes.forEach((route, index) => route.stops.forEach(stop => {
    if (stop.place.lat === null || stop.place.lng === null) return
    const entry = visits.get(stop.place.id) ?? { place: stop.place, trucks: [] }
    const mine = entry.trucks.find(t => t.index === index)
    if (mine) mine.orders.push(stop.order)
    else entry.trucks.push({ index, orders: [stop.order] })
    visits.set(stop.place.id, entry)
  }))
  const depots = new Map(routes.filter(r => r.depot.lat !== null).map(r => [r.depot.id, r.depot]))
  const gaps = new Set((data?.unserved ?? []).filter(u => u.place.lat === null).map(u => u.place.corregimiento_id))
  const selectedRoute = routes.find(r => r.truck_id === truck)
  const shaped = new Set(boundaries.features.map(f => f.properties.id))
  const status = data ? planLabels[data.status] : null

  if (plans.isPending) return <div className="panel" role="status" aria-label="Cargando planes"><Skeleton lines={5} /></div>
  if (plans.data?.length === 0) {
    return <div className="panel"><EmptyState icon={<TruckIcon />} title="Todavía no hay planes de cisternas">Genera uno en la pestaña Cisternas para verlo aquí.</EmptyState></div>
  }

  return (
    <div className="map-layout">
      <div className="stack">
        <div className="map-toolbar">
          <label className="field inline-field">
            <span>Plan</span>
            <select value={planId ?? ''} onChange={e => { setChosen(e.target.value); setTruck(null) }}>
              {plans.data?.map(p => <option key={p.id} value={p.id}>{when(p.created_at)} · {planLabels[p.status][0]}</option>)}
            </select>
          </label>
          {status && <Pill tone={status[1]}>{status[0]}</Pill>}
        </div>
        <ErrorMessage error={plans.error ?? plan.error} />
        <div className="map-frame">
          <FrameSwitch frame={frame} setFrame={setFrame} />
          {!data ? <div role="status" aria-label="Cargando plan"><Skeleton lines={6} /></div> : (
            <MapCanvas boundaries={boundaries} frame={frame}
              title={`Plan ${status?.[0]}: ${routes.length} cisternas, ${visits.size} lugares con entrega; sin ruta vial calculada`}
              areaClass={id => gaps.has(id) ? 'area-gap' : 'area-base'}>
              {unit => (
                <g className={data.status === 'APPROVED' ? 'plan-approved' : 'plan-proposed'}>
                  {data.unserved.filter(u => u.place.lat !== null).map(u => {
                    const [x, y] = xy(u.place.lng!, u.place.lat!)
                    return <circle key={u.place.id} className="unserved" cx={x} cy={y} r={unit * 1.8}><title>{`${u.place.name}: ${label(unservedLabels, u.reason)}`}</title></circle>
                  })}
                  {[...visits.values()].map(({ place, trucks }) => {
                    const [x, y] = xy(place.lng!, place.lat!)
                    return trucks.map(({ index, orders }, k) => {
                      const cx = x + (k - (trucks.length - 1) / 2) * unit * 3.8
                      const dim = selectedRoute && routes[index] !== selectedRoute
                      const numbered = routes[index] === selectedRoute
                      return (
                        <g key={`${place.id}-${index}`} className={`marker truck-${index % 4}${dim ? ' is-dim' : ''}`}>
                          <circle cx={cx} cy={y} r={unit * 1.8}><title>{`${place.name}: ${routes[index].truck_name}, visita ${orders.join(' y ')}`}</title></circle>
                          {numbered && <text x={cx} y={y} fontSize={unit * (orders.length > 1 ? 1.4 : 2)}>{orders.join(',')}</text>}
                        </g>
                      )
                    })
                  })}
                  {[...depots.values()].map(d => {
                    const [x, y] = xy(d.lng!, d.lat!)
                    return <rect key={d.id} className="depot" x={x - unit * 1.5} y={y - unit * 1.5} width={unit * 3} height={unit * 3}><title>{`Planta de origen: ${d.name}`}</title></rect>
                  })}
                </g>
              )}
            </MapCanvas>
          )}
          <div className="legend map-legend" aria-label="Leyenda">
            <span><i className="swatch depot" />Planta de origen</span>
            <span><i className="swatch dot truck-0" />Entrega (color de la cisterna)</span>
            <span><i className="swatch dot unserved" />Sin cubrir</span>
            <span><i className="swatch area-gap" />Comunidad sin punto: su corregimiento</span>
            {data?.status !== 'APPROVED' && <span><i className="swatch dot truck-0 dashed" />Propuesta, no programada</span>}
          </div>
        </div>
        <p className="hint">Las ubicaciones de plantas y comunidades son aproximadas (estimadas por el equipo) y pueden caer en el
          corregimiento vecino. No se dibujan trayectos: el mapa muestra a quién atiende cada cisterna y en qué orden, no por dónde va.</p>
      </div>

      <aside className="stack" aria-label="Detalle del plan">
        <section className="panel stack-sm" aria-labelledby="concepts-title">
          <h3 id="concepts-title">Cómo leer este mapa</h3>
          <dl className="concepts">
            <div><dt>Asignación</dt><dd>El color indica qué cisterna atiende cada comunidad.</dd></div>
            <div><dt>Secuencia</dt><dd>Elige una cisterna para numerar sus visitas en orden de llegada estimada.</dd></div>
            <div><dt>Ruta vial</dt><dd><Pill tone="neutral">No calculada</Pill> <code>{data?.road_routing ?? 'NO_CALCULADA'}</code>. {data?.distance_model ?? ''}</dd></div>
          </dl>
          {data?.status === 'APPROVED' && <p className="hint">Aprobado significa programado: el sistema no registra si el agua llegó.</p>}
        </section>

        {data && routes.length === 0 && <div className="panel"><EmptyState icon={<MapTrifoldIcon />} title={['QUEUED', 'RUNNING'].includes(data.status) ? 'El plan se está calculando' : 'Este plan no tiene entregas'} /></div>}
        {routes.length > 0 && (
          <section className="panel stack-sm" aria-labelledby="trucks-title">
            <div className="spread">
              <h3 id="trucks-title">Cisternas ({routes.length})</h3>
              {truck && <button type="button" className="ghost small" onClick={() => setTruck(null)}>Ver todas</button>}
            </div>
            <ul className="queue">
              {routes.map((r, index) => (
                <li key={r.truck_id}>
                  <button type="button" className="item" aria-pressed={truck === r.truck_id} onClick={() => setTruck(truck === r.truck_id ? null : r.truck_id)}>
                    <span className="item-top">
                      <span className="item-title"><i className={`swatch dot truck-${index % 4}`} aria-hidden="true" />{r.truck_name}</span>
                      <span className="num">{gallons(r.gallons)}</span>
                    </span>
                    <span className="item-meta"><span>Desde {r.depot.name}</span><span>{r.stops.length} {r.stops.length === 1 ? 'visita' : 'visitas'} · {r.trips} {r.trips === 1 ? 'viaje' : 'viajes'}</span><span>~{r.km} km estimados</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {selectedRoute && (
          <section className="panel stack-sm" aria-live="polite" aria-labelledby="sequence-title">
            <h3 id="sequence-title">Secuencia de {selectedRoute.truck_name}</h3>
            <p className="hint">Turno {selectedRoute.shift}, regreso estimado {selectedRoute.ends_at ?? 'sin dato'}.</p>
            <ol className="stops">
              {selectedRoute.stops.map(s => (
                <li key={s.order} className="stop">
                  <time>{s.arrival}<span className="trip">viaje {s.trip}</span></time>
                  <strong>{s.order}. {s.place.name}</strong>
                  <span className="gal num">{gallons(s.gallons)}</span>
                  <span className="why">{locationText(s.place, shaped)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {data && data.unserved.length > 0 && (
          <section className="panel stack-sm" aria-labelledby="map-unserved-title">
            <h3 id="map-unserved-title">Sin cubrir o parciales ({data.unserved.length})</h3>
            <ul className="served">
              {data.unserved.map(u => (
                <li key={u.place.id}>
                  <strong>{u.place.name}</strong>
                  <Pill tone={u.reason === 'COBERTURA_PARCIAL' ? 'warn' : 'danger'}>{label(unservedLabels, u.reason)}</Pill>
                  <span className="why">{u.gallons_missing ? `Faltan ${gallons(u.gallons_missing)}. ` : ''}{locationText(u.place, shaped)}.</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {data && data.excluded_trucks.length > 0 && (
          <p className="note"><TruckIcon aria-hidden="true" />Excluidas por el coordinador en este plan: {data.excluded_trucks.join(', ')}.</p>
        )}
      </aside>
    </div>
  )
}

export function MapPanel({ token, initialPlan }: { token: string; initialPlan?: string | null }) {
  const [layer, setLayer] = useState<'activity' | 'plan'>(initialPlan ? 'plan' : 'activity')
  const boundaries = useQuery({
    queryKey: ['admin', 'map', 'boundaries'],
    queryFn: () => api<Boundaries>('/admin/map/boundaries', {}, token),
    staleTime: Infinity,
  })
  return (
    <section className="stack" aria-labelledby="map-title">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 id="map-title">Mapa de Panamá Oeste</h2>
          <p>Dónde se concentran los reportes y cómo se reparte el agua del plan de cisternas.</p>
        </div>
        <div className="segmented" role="group" aria-label="Capa del mapa">
          <button type="button" aria-pressed={layer === 'activity'} onClick={() => setLayer('activity')}>Reportes e incidentes</button>
          <button type="button" aria-pressed={layer === 'plan'} onClick={() => setLayer('plan')}>Cisternas</button>
        </div>
      </div>
      <ErrorMessage error={boundaries.error} />
      {boundaries.isPending && <div className="panel" role="status" aria-label="Cargando límites"><Skeleton lines={6} /></div>}
      {boundaries.data && (layer === 'activity'
        ? <ActivityLayer token={token} boundaries={boundaries.data} />
        : <PlanLayer token={token} boundaries={boundaries.data} initialPlan={initialPlan} />)}
    </section>
  )
}
