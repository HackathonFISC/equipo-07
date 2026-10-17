import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import App from './App'
import { polling } from './api'
import { CitizenPage } from './pages/CitizenPage'
import { CoordinationPage } from './pages/CoordinationPage'
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
  await screen.findByRole('option', { name: community.name })
  await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  await user.selectOptions(screen.getByLabelText('Comunidad'), 'arraijan-demo')
  await user.type(screen.getByLabelText('Descripción'), 'Estamos sin agua desde ayer')
  await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
  expect(await screen.findByText('Lo revisa el equipo')).toBeInTheDocument()
  const posted = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(JSON.parse(posted[1]!.body as string).hours_without_water).toBeNull()
  expect((posted[1]!.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy()
})

test('duration options in days are sent as hours inside the policy bucket', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/communities')) return Response.json([community])
    if (init?.method === 'POST') return Response.json({ report_id: 'r1', thread_id: 'r1', status: 'QUEUED', is_simulated: true })
    return Response.json({ report_id: 'r1', thread_id: 'r1', status: 'QUEUED', is_simulated: true })
  })
  mount(<CitizenPage />)
  await screen.findByRole('option', { name: community.name })
  await user.selectOptions(screen.getByLabelText('Comunidad'), community.id)
  await user.type(screen.getByLabelText('Descripción'), 'No sale agua desde anteayer')
  await user.click(screen.getByRole('radio', { name: 'Entre 1 y 2 días' }))
  await user.click(screen.getByRole('button', { name: 'Enviar reporte' }))
  await screen.findByText('Recibimos tu reporte')
  const posted = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(JSON.parse(posted[1]!.body as string).hours_without_water).toBe(36)
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
  await screen.findByRole('option', { name: community.name })
  await user.selectOptions(screen.getByLabelText('Comunidad'), community.id)
  await user.type(screen.getByLabelText('Descripción'), 'Estamos sin agua')
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
  await user.click(await screen.findByRole('button', { name: /e1/ }))
  await screen.findByText('Revisión humana')
  await user.selectOptions(screen.getByLabelText('Decisión'), 'CORRECT')
  await user.type(screen.getByLabelText('Puntuación corregida'), '82')
  await user.type(screen.getByLabelText('Razón de la decisión'), 'Revisado con el equipo')
  await user.click(screen.getByRole('button', { name: 'Registrar decisión' }))
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
  expect(await screen.findByText('Puntaje 74 (institución crítica); primera carga.')).toBeInTheDocument()
  expect(screen.getByText('Cobertura parcial')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Hay un plan pendiente' })).toBeDisabled()
  await user.type(screen.getByLabelText('Razón de la decisión del plan'), 'Flota confirmada')
  await user.click(screen.getByRole('button', { name: 'Registrar decisión del plan' }))
  await waitFor(() => expect(posted).toBeDefined())
  expect(JSON.parse(posted!.body as string)).toEqual({ decision: 'APPROVE', reason: 'Flota confirmada' })
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
  expect(await screen.findByText('Decisiones con contexto.')).toBeInTheDocument()
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
