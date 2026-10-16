import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import App from './App'
import { polling } from './api'
import { CitizenPage } from './pages/CitizenPage'
import { CoordinationPage } from './pages/CoordinationPage'
import type { Detail } from './types'

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
  expect(await screen.findByText('Espera revisión humana')).toBeInTheDocument()
  const posted = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(JSON.parse(posted[1]!.body as string).hours_without_water).toBeNull()
  expect((posted[1]!.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy()
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
  await user.click(screen.getByRole('button', { name: 'Reintentar el mismo reporte' }))
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
    if (String(url).includes('/incidents')) return Response.json([])
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

test('token never persists in browser storage and logout clears access', async () => {
  const user = userEvent.setup()
  const local = vi.spyOn(Storage.prototype, 'setItem')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
    Response.json(String(url).endsWith('/health') ? { is_simulated: true } : []))
  mount(<App />)
  await user.click(screen.getByRole('button', { name: 'Coordinación' }))
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
