import { statusLabels } from './api'
import type { Status } from './types'

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${status === 'APPROVED' ? 'badge-green' : ''}`}>
    {statusLabels[status]}
  </span>
}

export function ErrorMessage({ error }: { error: Error | null }) {
  return error ? <p role="alert" className="error">{error.message}</p> : null
}
