import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { CoordinationPage } from './pages/CoordinationPage'
import { DecisionRecord } from './pages/ReportAudit'
import { durationText, priorityRows } from './labels'
import { placeOf } from './lookups'
import type { Detail } from './types'

const community = { id: 'sector', name: 'Comunidad de prueba', district: 'Arraiján', is_synthetic: true,
  population: 9999, vulnerability: 1 }
const detail: Detail = {
  id: 'execution-1', report_id: 'report-1', provider: 'mock-deterministic', is_simulated: true,
  status: 'WAITING_APPROVAL', created_at: '2026-10-17T12:00:00', error: null, attempts: 1,
  report: { id: 'report-1', community_id: 'sector', description: 'Sin agua cerca del parque',
    duration_bucket: 'LT_12H', hours_without_water: null, created_at: '2026-10-17T12:00:00',
    normalized: { kind: 'OUTAGE', summary: 'Sin suministro en el sector', duration_bucket: 'LT_12H',
      hours_without_water: null, critical_institution: null, flags: [] } },
  proposal: { incident_id: 'incident-1', final_score: null, explanation: 'Texto almacenado de prueba',
    priority: { score_min: 17, score_max: 67, confidence_level: 'MEDIUM', policy_version: 'v1.0.0-demo',
      immediate_review: false, flags: ['DATOS_INCOMPLETOS', 'DATOS_SECTOR_SINTETICOS'],
      factors: { hours: [9, 9], population: [8, 8], critical: [0, 30], vulnerability: [0, 20] },
      inputs: { community_id: 'sector', duration_bucket: 'LT_12H', hours_without_water: null,
        duration_source: 'CITIZEN', population: 2630, vulnerability: null, critical_institution: null, is_synthetic: true } } },
  association: { status: 'CONFIRMED', confidence: 'HIGH', reasoning: 'Incidente nuevo' }, review: null,
  traces: [
    { id: 1, agent: 'ingestion', tool: null, event: 'START', category: 'technical', detail: {}, created_at: '2026-10-17T12:00:01' },
    { id: 2, agent: 'ingestion', tool: 'save_normalized_report', event: 'NORMALIZED', category: 'technical', detail: { kind: 'OUTAGE' }, created_at: '2026-10-17T12:00:02' },
    { id: 3, agent: 'ingestion', tool: null, event: 'END', category: 'technical', detail: {}, created_at: '2026-10-17T12:00:03' },
  ],
}

function mount(data: Detail, failTimeline = false) {
  const requests: string[] = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const path = String(url); requests.push(path)
    if (init?.method === 'POST') return Response.json({ status: 'RESUME_QUEUED' }, { status: 202 })
    if (path.includes('/map/boundaries')) return Response.json({ source: 'Test', source_url: '', license: 'Test', features: [], missing_in_source: [] })
    if (path.includes('/map/plans/')) return Response.json({ plan_id: 'plan-1', status: 'PROPOSED', created_at: '2026-10-17', excluded_trucks: [], road_routing: 'NO_CALCULADA', distance_model: null, routes: [], unserved: [] })
    if (path.includes('/admin/plans?')) return Response.json([{ id: 'plan-1', status: 'PROPOSED', created_at: '2026-10-17', demand_gallons: 0, planned_gallons: 0 }])
    if (path.includes('/timeline')) return failTimeline ? Response.json({ detail: 'Historial no disponible' }, { status: 503 })
      : Response.json([{ source: 'plan', event: 'PLAN_PROPOSED', timestamp: '2026-10-17', summary: 'Plan propuesto', detail: { plan_id: 'plan-1' } }])
    if (path.includes('/communities')) return Response.json([community])
    if (path.includes('/plans/latest')) return Response.json(null)
    if (path.endsWith(`/executions/${data.id}`)) return Response.json(data)
    if (path.includes('/executions?')) return Response.json([data])
    return Response.json([])
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(<QueryClientProvider client={client}><CoordinationPage token="test-only-token" /></QueryClientProvider>)
  return { ...result, requests, fetch }
}

test('operation reads the original report without a timeline and keeps review edits across audit views', async () => {
  const user = userEvent.setup()
  const { requests } = mount(detail)
  await user.click(screen.getByRole('tab', { name: /Reportes/ }))
  await user.click(await screen.findByRole('button', { name: /Comunidad de prueba/ }))
  expect(screen.getByRole('region', { name: 'Reporte ciudadano' })).toHaveTextContent('Menos de medio día')
  expect(screen.getByRole('region', { name: 'Reporte ciudadano' })).toHaveTextContent(detail.report!.description)
  expect(requests.some(x => x.includes('/timeline'))).toBe(false)
  expect(screen.queryByText('Texto almacenado de prueba')).not.toBeInTheDocument()
  expect(screen.queryByText('9999')).not.toBeInTheDocument()
  await user.type(screen.getByLabelText('Razón de la decisión'), 'Verificación local de prueba')
  await user.click(screen.getByRole('button', { name: 'Auditoría y trazabilidad' }))
  expect(screen.getByRole('tab', { name: 'Auditoría' })).toHaveAttribute('aria-selected', 'true')
  expect(await screen.findByRole('table')).toHaveTextContent('2,630 habitantes')
  expect(screen.getByRole('table')).toHaveTextContent('8 pts')
  expect(screen.getByRole('table')).not.toHaveTextContent('9 h')
  expect(screen.getByRole('table')).toHaveTextContent('Catálogo de demostración')
  expect(screen.getByRole('list', { name: 'Nodos registrados de LangGraph' }).children).toHaveLength(1)
  await user.click(screen.getByText('Ver datos del evento (JSON)'))
  expect(within(screen.getByRole('list', { name: 'Trazabilidad' })).getByText(/"kind": "OUTAGE"/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Vista operativa' }))
  expect(screen.getByLabelText('Razón de la decisión')).toHaveValue('Verificación local de prueba')
})

test('audit preserves legacy explanation with an explicit warning and does not rebuild inputs from current catalog', async () => {
  const user = userEvent.setup()
  const legacy = structuredClone(detail)
  delete legacy.report
  delete legacy.proposal!.priority.inputs
  legacy.proposal!.explanation = 'Texto histórico erróneo: 9 horas y 8000 habitantes'
  mount(legacy)
  await user.click(screen.getByRole('tab', { name: 'Auditoría' }))
  await user.click(await screen.findByRole('button', { name: /executio/ }))
  expect(screen.getByRole('table')).toHaveTextContent('Entrada no registrada')
  expect(screen.getByRole('table')).not.toHaveTextContent('9,999')
  expect(screen.getByText(/Registro histórico sin instantánea/)).toBeVisible()
  await user.click(screen.getByText('Explicación almacenada de la propuesta'))
  expect(screen.getByText(/Texto histórico sin validar/)).toBeVisible()
  expect(screen.getByText(legacy.proposal!.explanation)).toBeVisible()
})

test('audit exposes timeline failures and links only plans actually recorded', async () => {
  const user = userEvent.setup()
  mount(detail, true)
  await user.click(screen.getByRole('tab', { name: 'Auditoría' }))
  await user.click(await screen.findByRole('button', { name: /Comunidad de prueba/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Historial no disponible')
  expect(screen.queryByRole('button', { name: /Ver plan/ })).not.toBeInTheDocument()
})

test('audit keeps the incident timeline and opens its recorded plan in the existing map', async () => {
  const user = userEvent.setup()
  mount(detail)
  await user.click(screen.getByRole('tab', { name: 'Auditoría' }))
  await user.click(await screen.findByRole('button', { name: /Comunidad de prueba/ }))
  await user.click(await screen.findByRole('button', { name: 'Historial del incidente' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByRole('heading', { name: 'Historial del incidente' })).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: /Cerrar/ }))
  await user.click(await screen.findByRole('button', { name: 'Ver plan plan-1 en el mapa' }))
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Mapa' })).toHaveAttribute('aria-selected', 'true'))
})

test.each([
  ['RESUME_QUEUED', null, 'Pendiente de aplicar'],
  ['ERROR', null, 'Aplicación interrumpida'],
  ['APPROVED', '2026-10-17T12:01:00', 'Aplicada'],
  ['ERROR', '2026-10-17T12:01:00', 'Aplicada'],
] as const)('decision record distinguishes %s with applied_at=%s', (status, applied_at, expected) => {
  const data = structuredClone(detail)
  data.status = status
  data.review = { payload: { decision: 'APPROVE', reason: 'Prueba local', approved_score: 42 },
    applied_at, created_at: '2026-10-17T12:00:50', actor: 'coordinator-shared-token' }
  if (applied_at) data.proposal!.final_score = 42
  render(<DecisionRecord detail={data} />)
  expect(screen.getByText(expected, { exact: true })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Decisión registrada' })).toHaveTextContent(applied_at ? '42 pts de 100' : 'Sin puntuación aprobada')
})

test('duration and provenance preserve zero, unknown and conflicting inputs honestly', () => {
  expect(durationText()).toMatch(/Sin registro/)
  expect(durationText({ hours_without_water: 0 })).toBe('0 h')
  expect(durationText({ duration_bucket: null })).toBe('No indicada')
  const priority = structuredClone(detail.proposal!.priority)
  priority.inputs!.duration_source = 'CONFLICT'
  priority.inputs!.duration_bucket = null
  priority.inputs!.population = 0
  priority.inputs!.vulnerability = 0
  const rows = priorityRows(priority)
  expect(rows.find(x => x.key === 'hours')!.source).toMatch(/contradictorias/)
  expect(rows.find(x => x.key === 'population')!.value).toBe('0 habitantes')
  expect(rows.find(x => x.key === 'vulnerability')!.value).toBe('Índice 0 de 1')
  expect(placeOf(detail, { community: () => community, incident: () => undefined }).name).toBe(community.name)
})

test('report location and declared duration remain visible before an incident or proposal exists', async () => {
  const user = userEvent.setup()
  const queued = structuredClone(detail)
  queued.status = 'QUEUED'
  queued.proposal = null
  queued.report!.normalized = null
  const { requests } = mount(queued)
  await user.click(screen.getByRole('tab', { name: /Reportes/ }))
  await user.click(await screen.findByRole('button', { name: /Comunidad de prueba/ }))
  expect(screen.getByRole('region', { name: 'Reporte ciudadano' })).toHaveTextContent('Menos de medio día')
  expect(screen.queryByRole('heading', { name: 'Revisión humana' })).not.toBeInTheDocument()
  expect(requests.some(x => x.includes('/timeline'))).toBe(false)
})

test('rejecting a proposal requires a reason and confirmation without sending a score', async () => {
  const user = userEvent.setup()
  const { fetch } = mount(detail)
  await user.click(screen.getByRole('tab', { name: /Reportes/ }))
  await user.click(await screen.findByRole('button', { name: /Comunidad de prueba/ }))
  await user.click(screen.getByRole('radio', { name: /Rechazar propuesta/ }))
  await user.type(screen.getByLabelText('Razón de la decisión'), 'Reporte sintético rechazado')
  await user.click(screen.getByRole('button', { name: 'Registrar decisión' }))
  expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Confirmar decisión' }))
  await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
  expect(JSON.parse(fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1]!.body as string)).toEqual({ decision: 'REJECT', reason: 'Reporte sintético rechazado' })
})
