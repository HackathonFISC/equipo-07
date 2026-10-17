import type { PublicReportStatus, Status } from './types'

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers,
      ...(token ? { 'X-Coordinator-Token': token } : {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    let detailMsg = ''
    if (typeof body.detail === 'string') {
      detailMsg = body.detail
    } else if (Array.isArray(body.detail) && body.detail.length > 0) {
      detailMsg = body.detail
        .map((item: unknown) => {
          if (typeof item === 'string') return item
          if (
            item &&
            typeof item === 'object' &&
            'msg' in item &&
            typeof (item as { msg: unknown }).msg === 'string'
          ) {
            const msg = (item as { msg: string }).msg.replace(/^Value error,\s*/i, '')
            if (msg.includes('String should have at least')) {
              return 'La descripción debe tener al menos 8 caracteres'
            }
            return msg
          }
          return ''
        })
        .filter(Boolean)
        .join('. ')
    }
    const message = detailMsg ||
      (response.status === 422 ? 'Revisa los campos: el reporte o la decisión no es válido.' :
        `El servicio respondió ${response.status}. Intenta de nuevo.`)
    // The status lets the coordinator login tell a wrong token (401) from a missing one (503).
    throw Object.assign(new Error(message), { status: response.status })
  }
  return response.json() as Promise<T>
}

export function polling(status?: Status): number | false {
  if (!status || ['QUEUED', 'RUNNING', 'RESUME_QUEUED'].includes(status)) return 2000
  return status === 'WAITING_APPROVAL' ? 5000 : false
}

// APPROVED is terminal for the analysis, not for the citizen: the arrival notice comes later,
// once a coordinator approves a tanker plan. Keep polling until it arrives.
export function publicStatusPolling(data?: PublicReportStatus): number | false {
  if (data?.status === 'APPROVED' && !data.notice) return 10000
  return polling(data?.status)
}

export const statusLabels: Record<Status, string> = {
  QUEUED: 'En cola', RUNNING: 'En análisis', WAITING_APPROVAL: 'Pendiente de revisión',
  RESUME_QUEUED: 'Aplicando decisión', APPROVED: 'Prioridad aprobada', REJECTED: 'Propuesta rechazada',
  ERROR: 'Error de procesamiento', NEEDS_INFORMATION: 'Información insuficiente',
}
