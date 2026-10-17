import { statusLabels } from './api'
import type { Priority, Status } from './types'

// Etiquetas en lenguaje llano para la vista ciudadana; Coordinación conserva statusLabels.
const citizenStatusLabels: Record<Status, string> = {
  QUEUED: 'Recibido', RUNNING: 'En revisión', WAITING_APPROVAL: 'Lo revisa el equipo',
  RESUME_QUEUED: 'Registrando decisión', APPROVED: 'Prioridad aprobada', REJECTED: 'No aprobado',
  ERROR: 'Problema al revisar', NEEDS_INFORMATION: 'Falta un dato',
}

export function StatusBadge({ status, audience = 'coordinator' }: { status: Status; audience?: 'citizen' | 'coordinator' }) {
  const toneClasses: Record<Status, string> = {
    QUEUED: 'badge-queued',
    RUNNING: 'badge-running',
    WAITING_APPROVAL: 'badge-waiting',
    RESUME_QUEUED: 'badge-resume',
    APPROVED: 'badge-approved badge-green',
    REJECTED: 'badge-rejected',
    ERROR: 'badge-error',
    NEEDS_INFORMATION: 'badge-needs-info',
  }
  return (
    <span className={`badge ${toneClasses[status] || ''}`}>
      {(audience === 'citizen' ? citizenStatusLabels : statusLabels)[status]}
    </span>
  )
}

export function ErrorMessage({ error }: { error: Error | null }) {
  return error ? <p role="alert" className="error">{error.message}</p> : null
}

export function PriorityGauge({ priority, finalScore }: { priority: Priority; finalScore?: number | null }) {
  const avg = Math.round((priority.score_min + priority.score_max) / 2)
  const displayScore = finalScore !== null && finalScore !== undefined ? finalScore : `${priority.score_min}–${priority.score_max}`
  const pct = Math.min(100, Math.max(0, finalScore ?? avg))

  let toneColor = '#0b8076' // Verde/Teal
  if (pct > 75) toneColor = '#dc2626' // Rojo crítico
  else if (pct > 50) toneColor = '#ea580c' // Naranja alto
  else if (pct > 25) toneColor = '#d97706' // Ámbar medio

  return (
    <div className="gauge-container">
      <div className="gauge-header">
        <div>
          <span className="gauge-eyebrow">PUNTUACIÓN DE PRIORIDAD DETERMINÍSTICA</span>
          <div className="gauge-value" style={{ color: toneColor }}>
            <strong>{displayScore}</strong>
            <span className="gauge-scale">/ 100 pts</span>
          </div>
        </div>
        <div className="gauge-meta">
          <span className={`confidence-pill confidence-${priority.confidence_level.toLowerCase()}`}>
            Confianza: {priority.confidence_level === 'HIGH' ? 'ALTA' : priority.confidence_level === 'MEDIUM' ? 'MEDIA' : 'BAJA'}
          </span>
          <span className="policy-tag">{priority.policy_version}</span>
        </div>
      </div>
      <div className="meter-track">
        <div
          className="meter-fill"
          style={{ width: `${pct}%`, backgroundColor: toneColor }}
        />
      </div>
      <div className="meter-markers">
        <span>0 (Mínima)</span>
        <span>25 (Moderada)</span>
        <span>50 (Alta)</span>
        <span>75+ (Crítica)</span>
      </div>
    </div>
  )
}

export function FactorBar({ label, min, max, weight }: { label: string; min: number; max: number; weight: number }) {
  const display = min === max ? `${min} pts` : `${min}–${max} pts`
  const pct = Math.round((max / weight) * 100)
  return (
    <div className="factor-row">
      <div className="factor-header">
        <span className="factor-name">{label}</span>
        <span className="factor-points"><strong>{display}</strong> / {weight} pts máx</span>
      </div>
      <div className="factor-track">
        <div className="factor-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ProcessStepper({ status }: { status: Status }) {
  const steps = [
    { num: '1', title: 'Recibido', desc: 'Tu reporte llegó' },
    { num: '2', title: 'Revisión', desc: 'Lo comparamos con otros avisos' },
    { num: '3', title: 'Urgencia', desc: 'Calculamos qué tan urgente es' },
    { num: '4', title: 'Decisión', desc: 'Una persona del equipo decide' },
  ]

  let activeIndex = 0
  if (status === 'QUEUED') activeIndex = 0
  else if (status === 'RUNNING') activeIndex = 1
  else if (status === 'WAITING_APPROVAL') activeIndex = 3
  else if (status === 'RESUME_QUEUED') activeIndex = 3
  else if (status === 'APPROVED' || status === 'REJECTED') activeIndex = 4
  else if (status === 'NEEDS_INFORMATION' || status === 'ERROR') activeIndex = 1

  return (
    <ol className="stepper" aria-label="Progreso del reporte">
      {steps.map((s, idx) => {
        const isDone = idx < activeIndex || (idx === 3 && status === 'APPROVED')
        const isCurrent = idx === activeIndex && status !== 'APPROVED'
        return (
          <li
            key={s.num}
            className={`step-item ${isDone ? 'step-done' : ''} ${isCurrent ? 'step-active' : ''}`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <div className="step-circle" aria-hidden="true">{isDone ? '✓' : s.num}</div>
            <div className="step-content">
              <strong>{s.title}</strong>
              <small>{s.desc}</small>
              <span className="sr-only">{isDone ? '(completado)' : isCurrent ? '(paso actual)' : '(pendiente)'}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function KpiCard({ title, value, subtitle, tone }: { title: string; value: string | number; subtitle: string; tone?: 'amber' | 'emerald' | 'rose' | 'blue' }) {
  return (
    <div className={`kpi-card ${tone ? `kpi-${tone}` : ''}`}>
      <span className="kpi-title">{title}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-subtitle">{subtitle}</span>
    </div>
  )
}
