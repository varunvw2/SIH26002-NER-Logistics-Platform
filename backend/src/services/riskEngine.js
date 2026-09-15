// MODULE 2 - AI Road Risk / Accessibility Engine
//
// A hybrid rule-based decision-support scorer (not a black-box ML model -
// per the spec, this is presented to users as decision support, never as a
// guaranteed prediction). Inputs are genuinely read from the database
// (road condition/slope/history, live weather, recent incidents) and
// combined with transparent, explainable weights so every score comes with
// a human-readable list of contributing factors.
//
// risk_score: 0-100 (capped)
// risk_level: green < 20 <= yellow < 45 <= orange < 70 <= red

const WEIGHTS = {
  heavyRainfall: 40,   // rainfall_mm > 40
  moderateRainfall: 15, // rainfall_mm > 20
  steepTerrain: 25,     // slope_deg > 15
  poorCondition: 15,
  fairCondition: 5,
  poorBridge: 10,
  perLandslideHistory: 3,
  landslideHistoryCap: 15
};

// A confirmed incident's effect on risk scales with its severity - a single
// critical report (e.g. a landslide actually blocking the road) should push
// risk to orange/red on its own, not need several incidents to add up to
// that; a low-severity report barely moves the needle. Multiple simultaneous
// incidents still compound (a small bonus per extra one), capped so this
// contribution alone can't exceed 80.
const INCIDENT_SEVERITY_WEIGHT = { critical: 60, high: 40, medium: 20, low: 8 };
const INCIDENT_EXTRA_PER_REPORT = 8;
const INCIDENT_CONTRIBUTION_CAP = 80;

function incidentContribution(openIncidents) {
  if (!openIncidents.length) return 0;
  const worst = Math.max(...openIncidents.map(i => INCIDENT_SEVERITY_WEIGHT[i.severity] ?? 0));
  const extra = Math.min((openIncidents.length - 1) * INCIDENT_EXTRA_PER_REPORT, 20);
  return Math.min(worst + extra, INCIDENT_CONTRIBUTION_CAP);
}

export function riskLevelFor(score) {
  if (score >= 70) return 'red';
  if (score >= 45) return 'orange';
  if (score >= 20) return 'yellow';
  return 'green';
}

/**
 * @param {object} road - roads row (terrain_slope_deg, road_condition, landslide_history_count)
 * @param {{rainfall_mm:number, condition:string}[]} weatherReadings - weather at the road's endpoint districts
 * @param {{severity:string}[]} openIncidents - currently-open incidents reported on this road
 * @param {{condition:string}[]} bridges - bridges located on this road
 */
export function calculateRoadRisk(road, weatherReadings = [], openIncidents = [], bridges = []) {
  const factors = [];
  let score = 0;

  const maxRainfall = Math.max(0, ...weatherReadings.map(w => w.rainfall_mm ?? 0));
  if (maxRainfall > 40) {
    score += WEIGHTS.heavyRainfall;
    factors.push(`Heavy rainfall (${maxRainfall}mm) detected on this corridor`);
  } else if (maxRainfall > 20) {
    score += WEIGHTS.moderateRainfall;
    factors.push(`Moderate rainfall (${maxRainfall}mm) on this corridor`);
  }

  if ((road.terrain_slope_deg ?? 0) > 15) {
    score += WEIGHTS.steepTerrain;
    factors.push(`Steep terrain (${road.terrain_slope_deg}° slope)`);
  }

  if (road.road_condition === 'poor') {
    score += WEIGHTS.poorCondition;
    factors.push('Poor road surface condition');
  } else if (road.road_condition === 'fair') {
    score += WEIGHTS.fairCondition;
    factors.push('Fair (aging) road surface condition');
  }

  if (bridges.some(b => b.condition === 'poor')) {
    score += WEIGHTS.poorBridge;
    factors.push('At least one bridge on this route in poor condition');
  }

  if ((road.landslide_history_count ?? 0) > 0) {
    const add = Math.min(road.landslide_history_count * WEIGHTS.perLandslideHistory, WEIGHTS.landslideHistoryCap);
    score += add;
    factors.push(`${road.landslide_history_count} historical landslide event(s) on record`);
  }

  if (openIncidents.length > 0) {
    score += incidentContribution(openIncidents);
    const worstSeverity = openIncidents.reduce((worst, i) => {
      const order = ['low', 'medium', 'high', 'critical'];
      return order.indexOf(i.severity) > order.indexOf(worst) ? i.severity : worst;
    }, 'low');
    factors.push(`${openIncidents.length} active incident(s) reported on this road (worst: ${worstSeverity})`);
  }

  score = Math.min(100, Math.round(score));

  return {
    risk_score: score,
    risk_level: riskLevelFor(score),
    disruption_probability: Number((score / 100).toFixed(2)),
    factors: factors.length ? factors : ['Normal conditions, no elevated risk factors detected']
  };
}

/**
 * Distinguishes a forward-looking prediction from a confirmed incident, per
 * the spec's requirement that wording clearly separate the two.
 */
export function buildPredictiveWarning(risk) {
  if (risk.risk_level === 'red') {
    return `PREDICTION: Very high probability of route disruption. This is a risk forecast, not a confirmed incident.`;
  }
  if (risk.risk_level === 'orange') {
    return `PREDICTION: High probability of route disruption within the next few hours if conditions persist.`;
  }
  if (risk.risk_level === 'yellow') {
    return `PREDICTION: Moderate probability of delay. Monitor conditions.`;
  }
  return null;
}
