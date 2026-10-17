import type { ReactNode } from 'react'
import { CheckIcon } from '@phosphor-icons/react'
import { statusLabels } from './api'
import { confidenceLabels, factorInfo, scoreText } from './labels'
import type { Priority, Status } from './types'

// Etiquetas en lenguaje llano para la vista ciudadana; Coordinación conserva statusLabels.
const citizenStatusLabels: Record<Status, string> = {
  QUEUED: 'Recibido', RUNNING: 'En revisión', WAITING_APPROVAL: 'Lo revisa el equipo',
  RESUME_QUEUED: 'Registrando decisión', APPROVED: 'Prioridad aprobada', REJECTED: 'No aprobado',
  ERROR: 'Problema al revisar', NEEDS_INFORMATION: 'Falta un dato',
}

const statusTone: Record<Status, string> = {
  QUEUED: 'neutral', RUNNING: 'progress', RESUME_QUEUED: 'progress', WAITING_APPROVAL: 'warn',
  APPROVED: 'ok', REJECTED: 'neutral', ERROR: 'danger', NEEDS_INFORMATION: 'warn',
}

export function StatusBadge({ status, audience = 'coordinator' }: { status: Status; audience?: 'citizen' | 'coordinator' }) {
  return (
    <span className={`badge tone-${statusTone[status] ?? 'neutral'}`}>
      {(audience === 'citizen' ? citizenStatusLabels : statusLabels)[status] ?? status}
    </span>
  )
}

export function Pill({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

export function ErrorMessage({ error }: { error: Error | null }) {
  return error ? <p role="alert" className="error">{error.message}</p> : null
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <span className="empty-icon" aria-hidden="true">{icon}</span>}
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  )
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${92 - i * 14}%` }} />)}
    </div>
  )
}

// A range on the 0-100 scale: an uncertain proposal is drawn as a band, never as one number.
export function PriorityRange({ priority, finalScore }: { priority: Priority; finalScore?: number | null }) {
  const { score_min: min, score_max: max } = priority
  const fixed = finalScore !== null && finalScore !== undefined
  return (
    <div className="range">
      <div className="range-head">
        <div>
          <span className="range-label">{fixed ? 'Puntuación aprobada' : 'Puntuación propuesta'}</span>
          <strong className="range-value">
            {fixed ? `${finalScore} pts` : scoreText(min, max)}
            <span> de 100</span>
          </strong>
          {fixed && min !== max && <span className="range-note">Propuesta original: {scoreText(min, max)}</span>}
        </div>
        <span className={`badge tone-${priority.confidence_level === 'HIGH' ? 'ok' : priority.confidence_level === 'MEDIUM' ? 'warn' : 'danger'}`}>
          Confianza {(confidenceLabels[priority.confidence_level] ?? priority.confidence_level).toLowerCase()}
        </span>
      </div>
      <div className="range-track" aria-hidden="true">
        <span className="range-band" style={{ left: `${min}%`, width: `${Math.max(max - min, 1)}%` }} />
        {fixed && <span className="range-mark" style={{ left: `${finalScore}%` }} />}
      </div>
      <div className="range-scale" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>
      {min !== max && !fixed && (
        <p className="range-explain">
          Faltan datos: la prioridad real puede estar en cualquier punto entre {min} y {max}. Al aprobar eliges un valor dentro del rango.
        </p>
      )}
    </div>
  )
}

export function FactorList({ factors }: { factors: Record<string, [number, number]> }) {
  return (
    <ul className="factors">
      {Object.entries(factors).map(([name, [min, max]]) => {
        const info = factorInfo[name] ?? { label: name, max: Math.max(max, 1) }
        const known = min === max
        return (
          <li key={name}>
            <div className="factor-head">
              <span>{info.label}</span>
              <span className="factor-points">
                <strong>{scoreText(min, max)}</strong> de {info.max}
              </span>
            </div>
            <div className="factor-track" aria-hidden="true">
              <span className="factor-known" style={{ width: `${(min / info.max) * 100}%` }} />
              {!known && <span className="factor-unknown" style={{ width: `${((max - min) / info.max) * 100}%` }} />}
            </div>
            {!known && <span className="factor-tag">Dato sin confirmar</span>}
          </li>
        )
      })}
    </ul>
  )
}

const citizenSteps = [
  { title: 'Recibido', desc: 'Tu reporte llegó' },
  { title: 'Revisión', desc: 'Lo comparamos con otros avisos' },
  { title: 'Urgencia', desc: 'Calculamos qué tan urgente es' },
  { title: 'Decisión', desc: 'Una persona del equipo decide' },
]

export function ProcessStepper({ status }: { status: Status }) {
  const active = { QUEUED: 0, RUNNING: 1, NEEDS_INFORMATION: 1, ERROR: 1, WAITING_APPROVAL: 3,
    RESUME_QUEUED: 3, APPROVED: 4, REJECTED: 4 }[status] ?? 0
  return (
    <ol className="stepper" aria-label="Progreso del reporte">
      {citizenSteps.map((step, i) => {
        const done = i < active
        const current = i === active
        return (
          <li key={step.title} className={done ? 'is-done' : current ? 'is-current' : ''} aria-current={current ? 'step' : undefined}>
            <span className="stepper-dot" aria-hidden="true">{done ? <CheckIcon weight="bold" /> : i + 1}</span>
            <span className="stepper-text">
              <strong>{step.title}</strong>
              <small>{step.desc}</small>
              <span className="sr-only">{done ? '(completado)' : current ? '(paso actual)' : '(pendiente)'}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
