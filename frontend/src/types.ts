export type Status = 'QUEUED' | 'RUNNING' | 'WAITING_APPROVAL' | 'RESUME_QUEUED'
  | 'APPROVED' | 'REJECTED' | 'ERROR' | 'NEEDS_INFORMATION'
export interface Community {
  id: string; name: string; district: string; is_synthetic: boolean
}
export interface Receipt {
  report_id: string; thread_id: string; status: Status; is_simulated: boolean
}
export interface Execution {
  id: string; report_id: string; status: Status; provider: string; is_simulated: boolean
  created_at: string; error: string | null
}
export interface Priority {
  score_min: number; score_max: number; confidence_level: string
  factors: Record<string, [number, number]>; flags: string[]
  policy_version: string; immediate_review: boolean
}
export interface Review {
  decision: 'APPROVE' | 'REJECT' | 'CORRECT'; reason: string
  corrected_score?: number; association?: 'CONFIRM' | 'NEW'
}
export interface Detail extends Execution {
  proposal: null | { incident_id: string; priority: Priority; explanation: string; final_score: number | null }
  association: null | { status: string; reasoning: string; confidence: string }
  review: null | { payload: Review; created_at: string; applied_at: string | null; actor: string }
  traces: { id: number; agent: string; tool: string | null; event: string; category: string
    detail: Record<string, unknown>; created_at: string }[]
}
export interface Incident {
  id: string; community_id: string; summary: string; kind: string; status: string
}
