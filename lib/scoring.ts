export type OpportunityFactors = {
  needStrength: number;
  serviceFit: number;
  urgency: number;
  reachability: number;
  commercialCapacity: number;
  strategicFit: number;
  penalties: number;
};

export type ConfidenceFactors = {
  sourceAuthority: number;
  corroboration: number;
  freshness: number;
  completeness: number;
};

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

export function calculateOpportunityScore(factors: OpportunityFactors): number {
  return Math.max(0, Math.min(100,
    clamp(factors.needStrength, 25) +
    clamp(factors.serviceFit, 25) +
    clamp(factors.urgency, 15) +
    clamp(factors.reachability, 15) +
    clamp(factors.commercialCapacity, 10) +
    clamp(factors.strategicFit, 10) -
    Math.max(0, Math.min(60, Math.round(factors.penalties))),
  ));
}

export function calculateConfidence(factors: ConfidenceFactors): number {
  return Math.max(0, Math.min(100,
    clamp(factors.sourceAuthority, 35) +
    clamp(factors.corroboration, 25) +
    clamp(factors.freshness, 20) +
    clamp(factors.completeness, 20),
  ));
}

export function opportunityBand(score: number, confidence: number): "hot" | "promising" | "investigate" | "weak" {
  if (score >= 75 && confidence >= 70) return "hot";
  if (score >= 60 && confidence >= 50) return "promising";
  if (score >= 35 && confidence >= 35) return "investigate";
  return "weak";
}
