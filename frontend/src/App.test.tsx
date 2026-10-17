import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import App from './App'
import { polling } from './api'
import { CitizenPage } from './pages/CitizenPage'
import { CoordinationPage } from './pages/CoordinationPage'
import { arrivalText, coverageText } from './impact'
import type { Detail, DistributionPlan } from './types'

function mount(child: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{child}</QueryClientProvider>)
}

const community = { id: 'arraijan-demo', name: 'Sector demostrativo de Arraiján', district: 'Arraiján', is_synthetic: true }

test('validates required fields, submits and shows actual server status', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/communities')) return Response.json([community])
    if (init?.method === 'POST') return Response.json({ report_id: 'r1', thread_id: 'r1', status: 'QUEUED', is_simulated: true })
    return Response.json({ report_id: 'r1', thread_id: 'r1', status: 'WAITING_APPROVAL', is_simulated: true })
  })
  mount(<CitizenPage />)
  // The first render in a cold jsdom worker can exceed the default 1 s wait.
  await screen.findByRole('option', { name: community.name }, { timeout: 5000 })
  await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  await user.selectOptions(screen.getByLabelText('Comunidad o corregimiento'), 'arraijan-demo')
  await user.type(screen.getByLabelText('¿Qué está pasando?'), 'Estamos sin agua desde ayer')
  await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
  expect(await screen.findByText('Lo revisa el equipo')).toBeInTheDocument()
  const posted = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(JSON.parse(posted[1]!.body as string).duration_bucket).toBeNull()
  expect(JSON.parse(posted[1]!.body as string)).not.toHaveProperty('hours_without_water')
  expect((posted[1]!.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy()
})

test.each([
  ['Menos de medio día', 'LT_12H'], ['Entre medio día y 1 día', 'H12_24'],
  ['Entre 1 y 2 días', 'H24_48'], ['2 días o más', 'GE_48H'], ['No lo sé', null],
])('duration option %s preserves its interval without inventing hours', async (option, bucket) => {
  const user = userEvent.setup()
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/communities')) return Response.json([community])
    if (init?.method === 'POST') return Response.json({ report_id: 'r1', thread_id: 'r1', status: 'QUEUED', is_simulated: true })
    return Response.json({ report_id: 'r1', thread_id: 'r1', status: 'QUEUED', is_simulated: true })
  })
  mount(<CitizenPage />)
  await screen.findByRole('option', { name: community.name }, { timeout: 5000 })
  await user.selectOptions(screen.getByLabelText('Comunidad o corregimiento'), community.id)
  await user.type(screen.getByLabelText('¿Qué está pasando?'), 'No sale agua en el sector')
  await user.click(screen.getByRole('radio', { name: option }))
  await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
  await screen.findByText('Recibimos tu reporte')
  const posted = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(JSON.parse(posted[1]!.body as string)).toEqual({
    community_id: community.id, description: 'No sale agua en el sector', duration_bucket: bucket,
  })
})

test('loading and server failures are visible', async () => {
  let resolve!: (response: Response) => void
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(r => { resolve = r }))
  mount(<CitizenPage />)
  expect(screen.getByRole('status')).toHaveTextContent('Cargando comunidades')
  resolve(Response.json({ detail: 'Servicio temporalmente no disponible' }, { status: 503 }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Servicio temporalmente no disponible')
})

test('failed submission keeps idempotency key and payload for retry', async () => {
  const user = userEvent.setup()
  const calls: RequestInit[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method !== 'POST') return Response.json([community])
    calls.push(init)
    return Response.json({ detail: 'No disponible' }, { status: 503 })
  })
  mount(<CitizenPage />)
  await screen.findByRole('option', { name: community.name }, { timeout: 5000 })
  await user.selectOptions(screen.getByLabelText('Comunidad o corregimiento'), community.id)
  await user.type(screen.getByLabelText('¿Qué está pasando?'), 'Estamos sin agua')
  await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
  await screen.findByRole('alert')
  await user.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  await waitFor(() => expect(calls).toHaveLength(2))
  expect(calls[0].body).toEqual(calls[1].body)
  expect(calls[0].headers).toEqual(calls[1].headers)
})

test('coordinator corrects a proposal through protected API with a reason', async () => {
  const user = userEvent.setup()
  const detail: Detail = { id: 'e1', report_id: 'r1', status: 'WAITING_APPROVAL', provider: 'mock-deterministic',
    is_simulated: true, created_at: '2026-10-16', error: null, association: null, review: null, traces: [],
    proposal: { incident_id: 'i1', final_score: null, explanation: 'Simulación de prioridad', priority: {
      score_min: 40, score_max: 70, confidence_level: 'MEDIUM', factors: { hours: [20, 20] },
      flags: [], policy_version: 'v1.0.0-demo', immediate_review: false,
    } } }
  let posted: RequestInit | undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { posted = init; return Response.json({ status: 'RESUME_QUEUED' }) }
    if (String(url).includes('/plans/latest')) return Response.json(null)
    if (String(url).includes('/incidents') || String(url).includes('/fleet')) return Response.json([])
    if (String(url).endsWith('/e1')) return Response.json(detail)
    return Response.json([detail])
  })
  mount(<CoordinationPage token="test-coordinator-token" />)
  await user.click(await screen.findByRole('tab', { name: /Reportes/ }))
  await user.click(await screen.findByRole('button', { name: /e1/ }))
  await screen.findByText('Revisión humana')
  await user.click(screen.getByRole('radio', { name: /Corregir puntuación/ }))
  await user.type(screen.getByLabelText('Puntuación corregida'), '82')
  await user.type(screen.getByLabelText('Razón de la decisión'), 'Revisado con el equipo')
  await user.click(screen.getByRole('button', { name: 'Registrar decisión' }))
  expect(posted).toBeUndefined()
  await user.click(screen.getByRole('button', { name: 'Confirmar decisión' }))
  await waitFor(() => expect(posted).toBeDefined())
  expect(JSON.parse(posted!.body as string)).toEqual({ decision: 'CORRECT', corrected_score: 82, reason: 'Revisado con el equipo' })
  expect((posted!.headers as Record<string, string>)['X-Coordinator-Token']).toBe('test-coordinator-token')
})

test('coordinator reviews a proposed tanker plan with reasons for each stop', async () => {
  const user = userEvent.setup()
  const plan: DistributionPlan = {
    id: 'p1', status: 'PROPOSED', error: null, created_at: '2026-10-16', review: null,
    request: { unavailable_trucks: [] }, events: [{ agent: 'planner', tool: 'plan_distribution',
      event: 'PLAN_PROPOSED', detail: {}, at: '2026-10-16' }],
    result: {
      policy_version: 'v1.0.0-demo', demand_gallons: 15000, planned_gallons: 10000,
      explanation: ['Equidad: cada comunidad recibe una primera carga.'],
      routes: [{ truck_id: 't1', truck_name: 'Mega Cisterna Troncal 02', capacity: 10000,
        base_name: 'Planta El Trapichito', shift: '08:00–16:00', trips: 1, km: 12, fuel_gallons: 2,
        gallons: 10000, ends_at: '09:30', stops: [{ community_id: 'h', name: 'Hospital Regional',
          incident_ids: ['i1'], trip: 1, arrival: '08:23', gallons: 10000,
          reason: 'Puntaje 74 (institución crítica); primera carga.' }] }],
      unserved: [{ community_id: 'h', name: 'Hospital Regional', incident_ids: ['i1'],
        reason: 'COBERTURA_PARCIAL', gallons_missing: 5000, detail: 'Recibe 10000 de 15000 galones.' }],
    },
  }
  let posted: RequestInit | undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { posted = init; return Response.json({ ...plan, status: 'APPROVED' }) }
    if (String(url).includes('/plans/latest')) return Response.json(plan)
    return Response.json([])
  })
  mount(<CoordinationPage token="test-coordinator-token" />)
  await user.click(await screen.findByRole('tab', { name: /Cisternas/ }))
  expect(await screen.findByText('Puntaje 74 (institución crítica); primera carga.')).toBeInTheDocument()
  expect(screen.getByText('Cobertura parcial')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Hay un plan pendiente' })).toBeDisabled()
  await user.type(screen.getByLabelText('Razón de la decisión del plan'), 'Flota confirmada')
  await user.click(screen.getByRole('button', { name: 'Registrar decisión del plan' }))
  await user.click(screen.getByRole('button', { name: 'Confirmar decisión del plan' }))
  await waitFor(() => expect(posted).toBeDefined())
  expect(JSON.parse(posted!.body as string)).toEqual({ decision: 'APPROVE', reason: 'Flota confirmada' })
})

test('plan panel renders impact comparison card with exact metrics for scenario F2-01', async () => {
  const plan: DistributionPlan = {
    id: 'p-impact', status: 'PROPOSED', error: null, created_at: '2026-10-16', review: null,
    request: { unavailable_trucks: ['cisterna-hospital-01'] },
    events: [],
    result: {
      policy_version: 'v1.0.0-demo', demand_gallons: 38000, planned_gallons: 38000,
      explanation: ['Plan optimizado'],
      routes: [],
      unserved: [],
      impact: {
        strategies: {
          aguaia: {
            description: 'Puntaje aprobado por el coordinador',
            order: ['crit-esc-guillermo-andreve', 'crit-hosp-nicolas-solano'],
            critical_coverage_pct: 100.0,
            critical_planned_gallons: 21000,
            critical_demand_gallons: 21000,
            critical_first_arrival_minutes: { median: 143, max: 180 },
            critical_without_delivery: [],
            communities_served: 6,
            communities_total: 6,
            planned_gallons: 38000,
            demand_gallons: 38000,
            without_delivery: [],
          },
          volumen: {
            description: 'Más reportes primero',
            order: ['ref-rey-vista-alegre', 'crit-hosp-nicolas-solano'],
            critical_coverage_pct: 100.0,
            critical_planned_gallons: 21000,
            critical_demand_gallons: 21000,
            critical_first_arrival_minutes: { median: 292, max: 293 },
            critical_without_delivery: [],
            communities_served: 6,
            communities_total: 6,
            planned_gallons: 38000,
            demand_gallons: 38000,
            without_delivery: [],
          },
        },
        aguaia_vs: {
          volumen: {
            critical_coverage_pp: 0.0,
            not_better: ['critical_coverage_pct', 'communities_served'],
          },
        },
      },
    },
  }

  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).includes('/plans/latest')) return Response.json(plan)
    return Response.json([])
  })

  mount(<CoordinationPage token="test-coordinator-token" />)
  await userEvent.setup().click(await screen.findByRole('tab', { name: /Cisternas/ }))
  expect(
    await screen.findByText(
      'HidroAgente frente a por volumen de reportes: misma cobertura crítica (100 %) · primera entrega crítica 149 min antes'
    )
  ).toBeInTheDocument()
  expect(screen.getByText('Comparación con atender por volumen de reportes')).toBeInTheDocument()
  expect(screen.getByText(/143 min/)).toBeInTheDocument()
  expect(screen.getByText(/292 min/)).toBeInTheDocument()
  expect(screen.getByText(/Sin ventaja en: cobertura crítica, comunidades atendidas/)).toBeInTheDocument()
})

test('token never persists in browser storage and logout clears access', async () => {
  const user = userEvent.setup()
  const local = vi.spyOn(Storage.prototype, 'setItem')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
    Response.json(String(url).endsWith('/health') ? { is_simulated: true }
      : String(url).includes('/plans/latest') ? null : []))
  mount(<App />)
  await user.click(screen.getByRole('button', { name: 'Acceso para coordinadores' }))
  await user.type(screen.getByLabelText('Token de coordinación'), 'test-coordinator-token')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('heading', { name: 'Coordinación del suministro' })).toBeInTheDocument()
  expect(local).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Salir' }))
  expect(screen.getByLabelText('Token de coordinación')).toHaveValue('')
})

test('polling stops at every terminal state', () => {
  expect(polling('RUNNING')).toBe(2000)
  expect(polling('QUEUED')).toBe(2000)
  expect(polling('WAITING_APPROVAL')).toBe(5000)
  for (const status of ['APPROVED', 'REJECTED', 'ERROR', 'NEEDS_INFORMATION'] as const) {
    expect(polling(status)).toBe(false)
  }
})

test('impact card never invents minutes or a gain it does not have', () => {
  expect(arrivalText(null, 292)).toBe('primera entrega crítica sin comparación posible')
  expect(arrivalText(300, 250)).toBe('primera entrega crítica 50 min después')
  expect(arrivalText(143, 143)).toBe('primera entrega crítica a la misma hora')
  expect(coverageText(12.5, 100)).toBe('+12.5 pp de demanda crítica cubierta')
  expect(coverageText(-10, 50)).toBe('-10 pp de demanda crítica cubierta')
  expect(coverageText(0, null)).toBe('sin demanda crítica que cubrir')
})

test('login reports a wrong token instead of opening an empty console', async () => {
  const user = userEvent.setup()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
    String(url).endsWith('/health') ? Response.json({ is_simulated: true })
      : Response.json({ detail: 'Token de coordinación inválido' }, { status: 401 }))
  mount(<App />)
  await user.click(screen.getByRole('button', { name: 'Acceso para coordinadores' }))
  await user.type(screen.getByLabelText('Token de coordinación'), 'wrong-coordinator-token')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('El token no es correcto')
  expect(screen.queryByRole('heading', { name: 'Coordinación del suministro' })).not.toBeInTheDocument()
})

test('approving an uncertain range sends a score inside it and resolves the tentative association', async () => {
  const user = userEvent.setup()
  const detail: Detail = { id: 'e2', report_id: 'r2', status: 'WAITING_APPROVAL', provider: 'mock-deterministic',
    is_simulated: true, created_at: '2026-10-16T10:00:00', error: null, review: null, traces: [],
    association: { status: 'PENDING_REVIEW', reasoning: 'Coincidencia parcial con un corte reciente', confidence: 'MEDIUM' },
    proposal: { incident_id: 'i2', final_score: null, explanation: 'Rango por datos faltantes', priority: {
      score_min: 26, score_max: 91, confidence_level: 'LOW', factors: { hours: [26, 26], critical: [0, 30] },
      flags: ['DATOS_INCOMPLETOS'], policy_version: 'v1.0.0-demo', immediate_review: false,
    } } }
  let posted: RequestInit | undefined
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { posted = init; return Response.json({ status: 'RESUME_QUEUED' }) }
    if (String(url).includes('/plans/latest')) return Response.json(null)
    if (String(url).includes('/incidents') || String(url).includes('/fleet') || String(url).includes('/communities')) return Response.json([])
    if (String(url).endsWith('/e2')) return Response.json(detail)
    return Response.json([detail])
  })
  mount(<CoordinationPage token="test-coordinator-token" />)
  await user.click(await screen.findByRole('tab', { name: /Reportes/ }))
  await user.click(await screen.findByRole('button', { name: /e2/ }))
  expect(await screen.findByText(/la prioridad real puede estar en cualquier punto entre 26 y 91/)).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Información para decidir' })).toHaveTextContent('institución crítica')
  const score = screen.getByLabelText('Puntuación aprobada')
  expect(score).toHaveValue(null)
  await user.click(screen.getByRole('radio', { name: /Sí, es el mismo incidente/ }))
  await user.type(screen.getByLabelText('Razón de la decisión'), 'Verificado con la junta comunal')
  await user.click(screen.getByRole('button', { name: 'Registrar decisión' }))
  expect(screen.queryByRole('button', { name: 'Confirmar decisión' })).not.toBeInTheDocument()
  expect(posted).toBeUndefined()
  await user.type(score, '99')
  await user.click(screen.getByRole('button', { name: 'Registrar decisión' }))
  expect(screen.queryByRole('button', { name: 'Confirmar decisión' })).not.toBeInTheDocument()
  expect(posted).toBeUndefined()
  await user.clear(score)
  await user.type(score, '70')
  await user.click(screen.getByRole('button', { name: 'Registrar decisión' }))
  expect(screen.getByText('¿Confirmas aprobar con 70 pts?')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Confirmar decisión' }))
  await waitFor(() => expect(posted).toBeDefined())
  expect(JSON.parse(posted!.body as string)).toEqual({
    decision: 'APPROVE', reason: 'Verificado con la junta comunal', approved_score: 70, association: 'CONFIRM',
  })
})

test('plan shows unserved places without location as a limitation, not as a route', async () => {
  const user = userEvent.setup()
  const plan: DistributionPlan = {
    id: 'p2', status: 'APPROVED', error: null, created_at: '2026-10-16', events: [],
    request: { unavailable_trucks: [] }, review: { decision: 'APPROVE', reason: 'Flota confirmada' },
    result: { policy_version: 'v1.0.0-demo', demand_gallons: 3000, planned_gallons: 0, explanation: [], routes: [],
      unserved: [{ community_id: 'sector-sin-censo', name: 'Sector sin censo', incident_ids: ['i9'],
        reason: 'SIN_UBICACION', gallons_missing: null, detail: 'El sector no tiene coordenadas en el catálogo geográfico.' }] },
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
    Response.json(String(url).includes('/plans/latest') ? plan : []))
  mount(<CoordinationPage token="test-coordinator-token" />)
  await user.click(await screen.findByRole('tab', { name: /Cisternas/ }))
  expect(await screen.findByText('Sin ubicación')).toBeInTheDocument()
  expect(screen.getByText(/Sin coordenadas verificadas no se calcula ruta ni hora/)).toBeInTheDocument()
  expect(screen.getByText('Ninguna comunidad recibe agua en este plan.')).toBeInTheDocument()
  expect(screen.getByText(/el sistema no registra si el agua llegó/)).toBeInTheDocument()
})

test('map tab colours corregimientos from backend counts and keeps assignment apart from roads', async () => {
  const user = userEvent.setup()
  const square = [[[[-79.8, 8.9], [-79.7, 8.9], [-79.7, 9], [-79.8, 9], [-79.8, 8.9]]]]
  const boundaries = { source: 'OCHA/HDX COD-AB', source_url: 'x', license: 'CC BY-IGO', missing_in_source: ['corr-b'],
    features: [{ properties: { id: 'corr-a', name: 'Barrio A', district: 'La Chorrera', pcode: 'PA1' },
      geometry: { type: 'MultiPolygon', coordinates: square } }] }
  const area = (id: string, name: string, reports: number, incidents: number, geometry = 'COD_AB') =>
    ({ id, name, district: 'La Chorrera', population: 100, geometry, reports, incidents, catalog_point_reports: 0 })
  const activity = { days: null, status: null, reports: 5, incidents: 2,
    corregimientos: [area('corr-a', 'Barrio A', 3, 1), area('corr-b', 'Barrio B', 2, 1, 'SIN_GEOMETRIA')],
    unassigned: { reports: 0, incidents: 0, community_ids: [] } }
  const place = (id: string, lat: number | null) => ({ id, name: id === 'h' ? 'Hospital' : 'Sector X', lat, lng: lat && -79.75,
    location: lat ? 'ESTIMADA' : 'SIN_UBICACION', corregimiento_id: 'corr-a' })
  const planMap = { plan_id: 'p1', status: 'PROPOSED', created_at: '2026-10-16', excluded_trucks: ['t9'],
    road_routing: 'NO_CALCULADA', distance_model: 'Distancias: línea recta × 1.4.',
    routes: [{ truck_id: 't1', truck_name: 'Troncal 02', capacity: 10000, gallons: 5000, trips: 1, km: 12,
      shift: '08:00–16:00', ends_at: '09:30', depot: place('pot', 8.95),
      stops: [{ order: 1, trip: 1, arrival: '08:23', gallons: 5000, incident_ids: ['i1'], place: place('h', 8.95) }] }],
    unserved: [{ reason: 'SIN_UBICACION', gallons_missing: null, detail: 'x', incident_ids: ['i2'], place: place('s', null) }] }
  const urls: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const u = String(url); urls.push(u)
    if (u.includes('/map/boundaries')) return Response.json(boundaries)
    if (u.includes('/map/activity')) return Response.json(activity)
    if (u.includes('/map/plans/')) return Response.json(planMap)
    if (u.endsWith('/admin/plans?limit=20')) return Response.json([{ id: 'p1', status: 'PROPOSED', created_at: '2026-10-16', demand_gallons: 1, planned_gallons: 1 }])
    return Response.json(u.includes('/plans/latest') ? null : [])
  })
  const { container } = mount(<CoordinationPage token="test-coordinator-token" />)
  await user.click(await screen.findByRole('tab', { name: 'Mapa' }))
  await screen.findByRole('img', { name: /reportes por corregimiento/ })
  expect(container.querySelector('path.shade-4')).toBeInTheDocument()
  expect(screen.getByText(/Sin polígono en la fuente: Barrio B \(2 rep\.\)/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '30 días' }))
  await user.selectOptions(screen.getByLabelText('Estado del incidente'), 'SCHEDULED')
  await waitFor(() => expect(urls).toContain('/api/admin/map/activity?days=30&status=SCHEDULED'))
  await user.click(screen.getByRole('button', { name: /Barrio A/ }))
  expect(screen.getByRole('heading', { name: 'Barrio A' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Cisternas' }))
  expect(await screen.findByText('No calculada')).toBeInTheDocument()
  expect(screen.getByText('NO_CALCULADA')).toBeInTheDocument()
  expect(container.querySelector('line, polyline')).toBeNull()  // no straight lines posing as roads
  expect(screen.getByText(/se resalta su corregimiento/)).toBeInTheDocument()
  expect(container.querySelector('path.area-gap')).toBeInTheDocument()
  expect(screen.getByText(/Excluidas por el coordinador en este plan: t9/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Troncal 02/ }))
  expect(screen.getByText('1. Hospital')).toBeInTheDocument()
  expect(container.querySelector('.marker text')).toHaveTextContent('1')
})
