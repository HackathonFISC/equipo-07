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
