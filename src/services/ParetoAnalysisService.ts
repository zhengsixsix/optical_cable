export interface ParetoComparable {
  id: string
  cost: { total?: number }
  risk: { overall?: number }
}

export type ValidParetoCandidate<T extends ParetoComparable> = T & {
  cost: T['cost'] & { total: number }
  risk: T['risk'] & { overall: number }
}

export const hasParetoMetrics = <T extends ParetoComparable>(
  candidate: T,
): candidate is ValidParetoCandidate<T> =>
  Number.isFinite(candidate.cost.total) && Number.isFinite(candidate.risk.overall)

export const isParetoDominated = <T extends ParetoComparable>(
  candidate: ValidParetoCandidate<T>,
  candidates: readonly ValidParetoCandidate<T>[],
) => candidates.some(other =>
  other !== candidate
  && other.cost.total <= candidate.cost.total
  && other.risk.overall <= candidate.risk.overall
  && (other.cost.total < candidate.cost.total || other.risk.overall < candidate.risk.overall))

export const getValidParetoCandidates = <T extends ParetoComparable>(
  candidates: readonly T[],
) => candidates.filter(hasParetoMetrics)

export const getParetoFront = <T extends ParetoComparable>(
  candidates: readonly T[],
) => {
  const validCandidates = getValidParetoCandidates(candidates)
  return validCandidates.filter(candidate => !isParetoDominated(candidate, validCandidates))
}

export const sortParetoFront = <T extends ParetoComparable>(
  candidates: readonly ValidParetoCandidate<T>[],
) => [...candidates].sort((left, right) =>
  left.cost.total - right.cost.total
  || left.risk.overall - right.risk.overall
  || left.id.localeCompare(right.id))
