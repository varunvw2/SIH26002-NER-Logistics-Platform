// MODULE 12 - District Connectivity Score
//
// A platform-generated analytical metric (explicitly NOT an official
// government statistic - the API and UI must label it as such) combining:
// share of accessible roads touching the district, live weather risk,
// open-incident density, and transport-hub/location availability.

import { db } from '../db/index.js';
import { buildRoadGraph } from './routeOptimizer.js';
import { getWeatherProvider } from '../providers/weather/index.js';

function riskCategoryFor(score) {
  if (score >= 75) return 'low';
  if (score >= 50) return 'moderate';
  if (score >= 25) return 'high';
  return 'critical';
}

export async function computeAllDistrictConnectivity() {
  const districts = db.prepare('SELECT * FROM districts').all();
  const edges = await buildRoadGraph();
  const weatherProvider = getWeatherProvider();

  const results = [];
  for (const district of districts) {
    const touching = edges.filter(e => e.from === district.id || e.to === district.id);
    const accessibleCount = touching.filter(e => e.road_status === 'green' || e.road_status === 'yellow').length;
    const roadAccessPct = touching.length ? (accessibleCount / touching.length) * 100 : 0;

    const openIncidents = touching.length
      ? db.prepare(`
          SELECT COUNT(*) AS c FROM incidents
          WHERE status = 'open' AND road_id IN (${touching.map(() => '?').join(',') || 'NULL'})
        `).get(...touching.map(e => e.roadId)).c
      : 0;
    const incidentPenalty = Math.min(openIncidents * 10, 40);

    const weather = await weatherProvider.getDistrictWeather(district.id);
    const weatherPenalty = weather.rainfall_mm > 40 ? 20 : weather.rainfall_mm > 20 ? 10 : 0;

    const locationCount = db.prepare('SELECT COUNT(*) AS c FROM locations WHERE district_id = ?').get(district.id).c;
    const transportBonus = Math.min(locationCount * 5, 15);

    let score = 100 - (100 - roadAccessPct) * 0.5 - incidentPenalty - weatherPenalty + transportBonus;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const bottleneckRoad = touching.length
      ? touching.reduce((worst, e) => (e.risk_score > worst.risk_score ? e : worst), touching[0])
      : null;

    results.push({
      district_id: district.id,
      district_name: district.name,
      state_id: district.state_id,
      connectivity_score: score,
      risk: riskCategoryFor(score),
      major_bottleneck: bottleneckRoad ? bottleneckRoad.name : null,
      active_incidents: openIncidents,
      roads_monitored: touching.length,
      roads_accessible: accessibleCount,
      is_platform_generated_metric: true
    });

    db.prepare('UPDATE districts SET connectivity_score = ?, connectivity_updated_at = datetime(\'now\') WHERE id = ?')
      .run(score, district.id);
  }

  return results;
}
