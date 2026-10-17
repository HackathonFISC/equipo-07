export type Status = 'QUEUED' | 'RUNNING' | 'WAITING_APPROVAL' | 'RESUME_QUEUED'
  | 'APPROVED' | 'REJECTED' | 'ERROR' | 'NEEDS_INFORMATION'
export interface Community {
  id: string; name: string; district: string; is_synthetic: boolean
  population?: number | null; vulnerability?: number | null
}
export interface Receipt {
  report_id: string; thread_id: string; status: Status; is_simulated: boolean
}
export interface Execution {
  id: string; report_id: string; status: Status; provider: string; is_simulated: boolean
  created_at: string; error: string | null
  attempts?: number; updated_at?: string
}
export type DurationBucket = 'LT_12H' | 'H12_24' | 'H24_48' | 'GE_48H'
export interface ReportInput {
  community_id: string; description: string
  hours_without_water?: number | null; duration_bucket?: DurationBucket | null
}
export interface NormalizedReport {
  summary: string; kind: 'OUTAGE' | 'LOW_PRESSURE' | 'LEAK' | 'UNKNOWN'
  hours_without_water?: number | null; duration_bucket?: DurationBucket | null
  critical_institution: boolean | null; flags: string[]
}
export interface PriorityInputs {
  community_id: string; hours_without_water: number | null; duration_bucket: DurationBucket | null
  duration_source: 'CITIZEN' | 'TEXT' | 'UNKNOWN' | 'CONFLICT'
  critical_institution: boolean | null; population: number | null; vulnerability: number | null
  is_synthetic: boolean
}
export interface Priority {
  score_min: number; score_max: number; confidence_level: string
  factors: Record<string, [number, number]>; flags: string[]
  policy_version: string; immediate_review: boolean
  inputs?: PriorityInputs | null
}
export interface Review {
  decision: 'APPROVE' | 'REJECT' | 'CORRECT'; reason: string
  approved_score?: number; corrected_score?: number; association?: 'CONFIRM' | 'NEW'
}
export interface Detail extends Execution {
  report?: (ReportInput & { id: string; normalized: NormalizedReport | null; created_at: string }) | null
  proposal: null | { incident_id: string; priority: Priority; explanation: string; final_score: number | null }
  association: null | { status: string; reasoning: string; confidence: string; incident_id?: string }
  review: null | { payload: Review; created_at: string; applied_at: string | null; actor: string }
  traces: { id: number; agent: string; tool: string | null; event: string; category: string
    detail: Record<string, unknown>; created_at: string }[]
  evidence?: EvidenceItem[]
}
export interface EvidenceItem {
  channel: string; kind: string; mime_type: string; status: string
  analysis?: { status: 'DONE' | 'ERROR'; description?: string; relevant?: boolean | null
    model?: string; simulated?: boolean; error?: string } | null
}
export interface Incident {
  id: string; community_id: string; summary: string; kind: string; status: string
}
export type PlanStatus = 'QUEUED' | 'RUNNING' | 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'ERROR'
export interface PlanStop {
  community_id: string; name: string; incident_ids: string[]; trip: number
  arrival: string; gallons: number; reason: string
}
export interface TruckRoute {
  truck_id: string; truck_name: string; capacity: number; base_name: string; shift: string
  trips: number; km: number; fuel_gallons: number; gallons: number; ends_at: string | null
  stops: PlanStop[]
}
export interface UnservedDemand {
  community_id: string; name: string; incident_ids: string[]; reason: string
  gallons_missing: number | null; detail: string
}
export interface ImpactStrategyMetrics {
  description: string
  order: string[]
  critical_coverage_pct: number | null
  critical_planned_gallons: number
  critical_demand_gallons: number
  critical_first_arrival_minutes: { median: number | null; max: number | null }
  critical_without_delivery: string[]
  communities_served: number
  communities_total: number
  planned_gallons: number
  demand_gallons: number
  without_delivery: string[]
}

export interface ImpactComparison {
  critical_coverage_pp: number
  not_better: string[]
}

export interface PlanImpact {
  strategies: Record<string, ImpactStrategyMetrics>
  aguaia_vs: Record<string, ImpactComparison>
}

export interface DistributionPlan {
  id: string; status: PlanStatus; error: string | null; created_at: string
  request: { unavailable_trucks: string[] }
  review: null | { decision: 'APPROVE' | 'REJECT'; reason: string }
  result: null | {
    policy_version: string; routes: TruckRoute[]; unserved: UnservedDemand[]
    demand_gallons: number; planned_gallons: number; explanation: string[]
    impact?: PlanImpact | null
  }
  events: { agent: string; tool: string | null; event: string; detail: Record<string, unknown>; at: string }[]
}
export interface FleetTruck {
  id: string; name: string; capacity_gallons: number; base_plant_id: string; status: string
  shift_start: string; shift_end: string; operational_role: string
}

export interface PublicReportNotice {
  kind: 'SCHEDULED' | 'UNSERVED'
  text: string
  arrival?: string | null
}

export interface PublicReportStatus {
  report_id: string
  status: Status
  incident_status: 'OPEN' | 'PRIORITIZED' | 'SCHEDULED' | 'CLOSED' | null
  notice: PublicReportNotice | null
}

export interface IncidentTimelineEvent {
  timestamp: string
  source: 'report' | 'trace' | 'review' | 'plan' | 'notification'
  event: string
  summary: string
  detail: Record<string, unknown>
}


export type IncidentStatus = 'OPEN' | 'PRIORITIZED' | 'SCHEDULED' | 'CLOSED'
export interface CorregimientoActivity {
  id: string; name: string; district: string; population: number | null
  geometry: 'COD_AB' | 'SIN_GEOMETRIA'
  reports: number; incidents: number; catalog_point_reports: number
}
export interface ReportActivity {
  days: number | null; status: IncidentStatus | null; reports: number; incidents: number
  corregimientos: CorregimientoActivity[]
  unassigned: { reports: number; incidents: number; community_ids: string[] }
}
export interface Boundaries {
  source: string; source_url: string; license: string; missing_in_source: string[]
  features: { properties: { id: string; name: string; district: string; pcode: string }
    geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } }[]
}
export interface PlanSummary {
  id: string; status: PlanStatus; created_at: string
  demand_gallons: number | null; planned_gallons: number | null
}
export interface MapPlace {
  id: string; name: string; lat: number | null; lng: number | null
  location: 'ESTIMADA' | 'SIN_UBICACION'; corregimiento_id: string | null
}
export interface MapRoute {
  truck_id: string; truck_name: string; capacity: number; gallons: number; trips: number
  km: number; shift: string; ends_at: string | null; depot: MapPlace
  stops: { order: number; trip: number; arrival: string; gallons: number; incident_ids: string[]; place: MapPlace }[]
}
export interface PlanMap {
  plan_id: string; status: PlanStatus; created_at: string; excluded_trucks: string[]
  road_routing: 'NO_CALCULADA'; distance_model: string | null; routes: MapRoute[]
  unserved: { reason: string; gallons_missing: number | null; detail: string; incident_ids: string[]; place: MapPlace }[]
}
