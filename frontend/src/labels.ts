import type { DurationBucket, Priority } from './types'

export const durationLabels: Record<DurationBucket, string> = {
  LT_12H: 'Menos de medio día', H12_24: 'Entre medio día y 1 día',
  H24_48: 'Entre 1 y 2 días', GE_48H: '2 días o más',
}

export function durationText(data?: { duration_bucket?: DurationBucket | null; hours_without_water?: number | null } | null) {
  if (!data) return 'Sin registro de la duración declarada'
  if (data.duration_bucket) return durationLabels[data.duration_bucket]
  return data.hours_without_water == null ? 'No indicada' : `${data.hours_without_water} h`
}

// Plain-language labels for interface text only. Contracts keep their original values;
// any code without a label falls back to the raw value so nothing is hidden.

export const flagLabels: Record<string, string> = {
  DATOS_INCOMPLETOS: 'Información incompleta',
  DATOS_SECTOR_SINTETICOS: 'Sector con datos de demostración',
  CRITICIDAD_TEXTO: 'El reporte menciona una institución crítica',
  CRITICIDAD_CATALOGO: 'Institución crítica según el catálogo',
  ASOCIACION_TENTATIVA: 'Posible duplicado por confirmar',
  DURACION_IMPRECISA: 'Duración imprecisa en el texto',
  CONTRADICCION_DURACION: 'La duración escrita no coincide con la indicada',
  DURACION_FUERA_DE_RANGO: 'Duración fuera del rango admitido (más de 90 días)',
}

export const kindLabels: Record<string, string> = {
  OUTAGE: 'Sin agua', LOW_PRESSURE: 'Baja presión', LEAK: 'Fuga', UNKNOWN: 'Tipo sin determinar',
}

export const incidentStatusLabels: Record<string, string> = {
  OPEN: 'Abierto', PRIORITIZED: 'Prioridad aprobada', SCHEDULED: 'Cisterna programada', CLOSED: 'Cerrado',
}

export const associationLabels: Record<string, string> = {
  CONFIRMED: 'Asociado a un incidente', PENDING_REVIEW: 'Asociación por confirmar', REJECTED: 'Asociación descartada',
}

export const confidenceLabels: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' }

export const decisionLabels: Record<string, string> = {
  APPROVE: 'Aprobada', REJECT: 'Rechazada', CORRECT: 'Corregida',
}

// Points per factor come from PriorityPolicyConfig defaults (backend/app/contracts.py).
export const factorInfo: Record<string, { label: string; max: number }> = {
  hours: { label: 'Tiempo sin servicio', max: 35 },
  critical: { label: 'Institución crítica', max: 30 },
  vulnerability: { label: 'Vulnerabilidad del sector', max: 20 },
  population: { label: 'Población del sector', max: 15 },
}

export const unservedLabels: Record<string, string> = {
  COBERTURA_PARCIAL: 'Cobertura parcial',
  SIN_CISTERNA_COMPATIBLE: 'Sin cisterna compatible',
  SIN_TIEMPO_EN_TURNO: 'Sin tiempo en turno',
  SIN_UBICACION: 'Sin ubicación',
  SIN_DEMANDA_ESTIMADA: 'Sin demanda estimada',
  FUGA_REQUIERE_REPARACION: 'Fuga: requiere reparación',
}

export const eventLabels: Record<string, string> = {
  REPORT_ACCEPTED: 'Reporte recibido', REPORT_CREATED: 'Reporte recibido', START: 'Inicio de etapa',
  END: 'Fin de etapa', NORMALIZED: 'Reporte interpretado', CONSOLIDATED: 'Asociado a un incidente',
  PROPOSED: 'Prioridad propuesta', REVIEW_ACCEPTED: 'Decisión registrada',
  DECISION_APPLIED: 'Decisión aplicada', RETRY_REQUESTED: 'Reintento solicitado',
  PLAN_REQUESTED: 'Plan solicitado', PLAN_PROPOSED: 'Plan propuesto', PLAN_REVIEWED: 'Plan revisado',
  NOTIFICATIONS_GENERATED: 'Avisos preparados', NOTICE_SCHEDULED: 'Aviso de llegada',
  NOTICE_UNSERVED: 'Aviso sin entrega',
  ERROR: 'Error de procesamiento',
}

export const agentLabels: Record<string, string> = {
  api: 'Recepción HTTP', worker: 'Worker', ingestion: 'Ingesta', verification: 'Verificación',
  coordination: 'Coordinación', human: 'Decisión humana', finalize: 'Aplicación de decisión',
  planner: 'Planificador', communication: 'Comunicación',
}

export const label = (map: Record<string, string>, value: string) => map[value] ?? value

// The API stores naive UTC timestamps; show them in the viewer's local time.
export function when(value: string) {
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('es-PA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export const gallons = (value: number) => `${value.toLocaleString('es-PA')} gal`

export function scoreText(min: number, max: number) {
  return min === max ? `${min} pts` : `${min} a ${max} pts`
}

export function priorityRows(priority: Priority) {
  const p = priority.inputs
  const durationSources = { CITIZEN: 'Declaración ciudadana', TEXT: 'Extraída del texto ciudadano',
    UNKNOWN: 'Sin confirmar', CONFLICT: 'Declaraciones contradictorias; sin confirmar' }
  const catalog = p ? `Catálogo${p.is_synthetic ? ' de demostración' : ''} · instantánea del cálculo` : 'Procedencia no registrada'
  const criticalSources = [
    ...(priority.flags.includes('CRITICIDAD_TEXTO') ? ['Mención en el texto; sin verificación externa'] : []),
    ...(priority.flags.includes('CRITICIDAD_CATALOGO') ? ['Catálogo geográfico'] : []),
  ]
  const values: Record<string, [string, string]> = {
    hours: [p ? p.hours_without_water == null && !p.duration_bucket ? 'Sin confirmar' : durationText(p) : 'Entrada no registrada', p ? durationSources[p.duration_source] : 'Procedencia no registrada'],
    critical: [p ? p.critical_institution == null ? 'Sin confirmar' : p.critical_institution ? 'Institución crítica' : 'No identificada como crítica'
      : 'Entrada no registrada', criticalSources.join(' + ') || 'Procedencia no registrada'],
    population: [p?.population != null ? `${p.population.toLocaleString('es-PA')} habitantes` : p ? 'Sin confirmar' : 'Entrada no registrada', catalog],
    vulnerability: [p?.vulnerability != null ? `Índice ${p.vulnerability} de 1` : p ? 'Sin confirmar' : 'Entrada no registrada', catalog],
  }
  return Object.entries(priority.factors).map(([key, points]) => ({
    key, label: factorInfo[key]?.label ?? key, points,
    value: values[key]?.[0] ?? 'Entrada no registrada', source: values[key]?.[1] ?? 'Procedencia no registrada',
  }))
}
