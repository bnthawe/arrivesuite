// Supplier trust score computation (FR-5.5.45).
// Renormalized weights without guest reviews (post-MVP):
// responsiveness 31%, cancellation 25%, inventory freshness 25%, compliance 19%.

export interface TrustScoreComponents {
  responsiveness: number; // 0-100
  cancellationRate: number; // 0-100 (lower is better, inverted)
  inventoryFreshness: number; // 0-100
  compliance: number; // 0-100
}

export interface TrustScore {
  score: number; // 0-100
  components: TrustScoreComponents;
  weights: Record<keyof TrustScoreComponents, number>;
}

const WEIGHTS: Record<keyof TrustScoreComponents, number> = {
  responsiveness: 0.31,
  cancellationRate: 0.25,
  inventoryFreshness: 0.25,
  compliance: 0.19,
};

export function computeTrustScore(components: TrustScoreComponents): TrustScore {
  const score = Math.round(
    components.responsiveness * WEIGHTS.responsiveness +
      components.cancellationRate * WEIGHTS.cancellationRate +
      components.inventoryFreshness * WEIGHTS.inventoryFreshness +
      components.compliance * WEIGHTS.compliance,
  );
  return { score: Math.max(0, Math.min(100, score)), components, weights: WEIGHTS };
}