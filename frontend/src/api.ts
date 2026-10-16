import type { Status } from './types'

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers,
      ...(token ? { 'X-Coordinator-Token': token } : {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail :
      response.status === 422 ? 'Revisa los campos: el reporte o la decisión no es válido.' :
        `El servicio respondió ${response.status}. Intenta de nuevo.`)
  }
  return response.json() as Promise<T>
}

export function polling(status?: Status): number | false {
  if (!status || ['QUEUED', 'RUNNING', 'RESUME_QUEUED'].includes(status)) return 2000
  return status === 'WAITING_APPROVAL' ? 5000 : false
}

export const statusLabels: Record<Status, string> = {
  QUEUED: 'En cola', RUNNING: 'En análisis', WAITING_APPROVAL: 'Espera revisión humana',
  RESUME_QUEUED: 'Decisión en proceso', APPROVED: 'Prioridad aprobada', REJECTED: 'Propuesta rechazada',
  ERROR: 'Error de procesamiento', NEEDS_INFORMATION: 'Falta información',
}
