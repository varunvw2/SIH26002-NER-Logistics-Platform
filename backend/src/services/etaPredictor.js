// AI STRATEGY item 2 - Delay/ETA prediction.
//
// Rule-based (not ML) by design: base travel time from road condition/speed,
// then a delay multiplier from the risk engine's risk_level. Kept as its own
// module so it's independently testable and swappable for a regression model
// later without touching the route optimizer's graph logic.

const SPEED_KMH = { good: 60, fair: 45, poor: 30 };
const DELAY_FACTOR = { green: 0, yellow: 0.10, orange: 0.25, red: 0.50 };

export function speedForCondition(condition) {
  return SPEED_KMH[condition] ?? SPEED_KMH.fair;
}

export function delayFactorFor(riskLevel) {
  return DELAY_FACTOR[riskLevel] ?? 0;
}

export function estimateSegmentDuration(lengthKm, roadCondition, riskLevel) {
  const baseMinutes = (lengthKm / speedForCondition(roadCondition)) * 60;
  const factor = delayFactorFor(riskLevel);
  const duration_minutes = baseMinutes * (1 + factor);
  return {
    base_minutes: Number(baseMinutes.toFixed(1)),
    duration_minutes: Number(duration_minutes.toFixed(1)),
    delay_minutes: Number((duration_minutes - baseMinutes).toFixed(1))
  };
}
