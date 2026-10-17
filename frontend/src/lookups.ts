import type { Community, Detail, Incident } from './types'

// The admin API returns incident and community ids; the console resolves them to names.
export interface Lookups {
  community: (id: string) => Community | undefined
  incident: (id: string) => Incident | undefined
}

export function placeOf(detail: Detail | undefined, lookups: Lookups) {
  const incident = detail?.proposal ? lookups.incident(detail.proposal.incident_id) : undefined
  const communityId = detail?.report?.community_id ?? detail?.proposal?.priority.inputs?.community_id ?? incident?.community_id
  const community = communityId ? lookups.community(communityId) : undefined
  return { incident, community, name: community?.name ?? communityId }
}

export function placeName(detail: Detail | undefined, lookups: Lookups) {
  return placeOf(detail, lookups).name
    ?? (!detail ? 'Cargando…' : detail.proposal ? 'Ubicación no disponible en esta vista' : 'Sin propuesta de prioridad')
}
