import type { Community, Detail, Incident } from './types'

// The admin API returns incident and community ids; the console resolves them to names.
export interface Lookups {
  community: (id: string) => Community | undefined
  incident: (id: string) => Incident | undefined
}

export function placeOf(detail: Detail | undefined, lookups: Lookups) {
  const incident = detail?.proposal ? lookups.incident(detail.proposal.incident_id) : undefined
  const community = incident ? lookups.community(incident.community_id) : undefined
  return { incident, community, name: community?.name ?? incident?.community_id }
}

export function placeName(detail: Detail | undefined, lookups: Lookups) {
  return placeOf(detail, lookups).name
    ?? (!detail ? 'Cargando…' : detail.proposal ? 'Ubicación no disponible en esta vista' : 'Sin propuesta de prioridad')
}
