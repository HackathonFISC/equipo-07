export const impactMetricLabels: Record<string, string> = {
  critical_coverage_pct: 'cobertura crítica',
  communities_served: 'comunidades atendidas',
  'critical_first_arrival_minutes.median': 'primera entrega crítica',
}

export function coverageText(pp: number, aguaiaPct: number | null): string {
  if (pp === 0) return aguaiaPct === null ? 'sin demanda crítica que cubrir' : `misma cobertura crítica (${aguaiaPct} %)`
  return `${pp > 0 ? '+' : ''}${pp} pp de demanda crítica cubierta`
}

// Never turns a missing delivery into "0 min": no median means nothing to compare.
export function arrivalText(ours: number | null, theirs: number | null): string {
  if (ours === null || theirs === null) return 'primera entrega crítica sin comparación posible'
  const diff = Math.round(theirs - ours)
  if (diff === 0) return 'primera entrega crítica a la misma hora'
  return `primera entrega crítica ${Math.abs(diff)} min ${diff > 0 ? 'antes' : 'después'}`
}
