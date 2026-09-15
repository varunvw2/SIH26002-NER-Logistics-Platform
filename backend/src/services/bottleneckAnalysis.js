// MODULE 13 - Logistics Bottleneck Analysis
//
// Ranks roads that have repeatedly caused delays, combining historical
// incident frequency with the live risk engine's current delay estimate, so
// authorities can see both "how often has this failed" and "how risky is it
// right now".

import { db } from '../db/index.js';
import { buildRoadGraph } from './routeOptimizer.js';

function frequencyLast90Days(roadId) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  return db.prepare('SELECT COUNT(*) AS c FROM incidents WHERE road_id = ? AND created_at >= ?').get(roadId, since).c;
}

function affectedShipmentCount(roadId) {
  return db.prepare(`
    SELECT COUNT(DISTINCT s.id) AS c
    FROM shipments s
    JOIN routes r ON s.route_id = r.id, json_each(r.road_ids_json) je
    WHERE je.value = ?
  `).get(String(roadId)).c;
}

export async function analyzeBottlenecks(limit = 10) {
  const edges = await buildRoadGraph();
  const edgeByRoadId = Object.fromEntries(edges.map(e => [e.roadId, e]));
  const roads = db.prepare('SELECT * FROM roads').all();

  const results = roads
    .map(road => {
      const incidentCount = db.prepare('SELECT COUNT(*) AS c FROM incidents WHERE road_id = ?').get(road.id).c;
      const edge = edgeByRoadId[road.id];
      return {
        road_id: road.id,
        road_name: road.name,
        incident_count: incidentCount,
        historical_frequency_last_90_days: frequencyLast90Days(road.id),
        avg_delay_minutes: edge ? edge.delay_minutes : null,
        current_risk_score: edge ? edge.risk_score : null,
        current_risk_level: edge ? edge.risk_level : null,
        affected_shipments: affectedShipmentCount(road.id)
      };
    })
    .filter(r => r.incident_count > 0)
    .sort((a, b) => b.incident_count - a.incident_count || (b.current_risk_score ?? 0) - (a.current_risk_score ?? 0));

  return results.slice(0, limit);
}
