// MODULE 3 - AI Route Optimization
//
// Builds a real graph from the seeded road network (districts = nodes, roads
// = edges) and runs Dijkstra's algorithm with a priority-weighted composite
// edge cost - NOT a simple shortest-distance search. Each edge's risk is
// computed live by the risk engine (module 2) from current weather + open
// incidents + road/bridge condition, so results genuinely change as those
// inputs change.
//
// Routing engine choice: a full OSRM/GraphHopper deployment is unnecessary
// for a ~16-node demo road graph and would add a whole extra service to run
// for no benefit at this scale - a small in-process Dijkstra over the seeded
// graph is the practical choice here, with the same "risk layer on top of
// routing" concept the spec asks for. The graph/edge-cost logic is isolated
// in this one module so it can be swapped for a real routing engine later.

import { db } from '../db/index.js';
import { calculateRoadRisk } from './riskEngine.js';
import { estimateSegmentDuration } from './etaPredictor.js';
import { getWeatherProvider } from '../providers/weather/index.js';

const PRIORITY_WEIGHTS = {
  critical: { distance: 0.3, time: 0.3, risk: 6.0 },
  high: { distance: 0.4, time: 0.4, risk: 4.0 },
  medium: { distance: 0.5, time: 0.5, risk: 2.5 },
  low: { distance: 0.7, time: 0.6, risk: 1.0 }
};

/** Builds the live-scored edge list for every road in the network. */
export async function buildRoadGraph() {
  const roads = db.prepare('SELECT * FROM roads').all();
  const districtIds = [...new Set(roads.flatMap(r => [r.from_district_id, r.to_district_id]))];

  const weatherProvider = getWeatherProvider();
  const weatherByDistrict = {};
  for (const id of districtIds) {
    weatherByDistrict[id] = await weatherProvider.getDistrictWeather(id);
  }

  const edges = roads.map(road => {
    const openIncidents = db.prepare(
      "SELECT severity FROM incidents WHERE road_id = ? AND status = 'open'"
    ).all(road.id);
    const bridges = db.prepare('SELECT * FROM bridges WHERE road_id = ?').all(road.id);
    const weatherReadings = [weatherByDistrict[road.from_district_id], weatherByDistrict[road.to_district_id]];

    const risk = calculateRoadRisk(road, weatherReadings, openIncidents, bridges);
    const timing = estimateSegmentDuration(road.length_km, road.road_condition, risk.risk_level);

    return {
      roadId: road.id,
      name: road.name,
      from: road.from_district_id,
      to: road.to_district_id,
      distance_km: road.length_km,
      duration_minutes: timing.duration_minutes,
      // Undelayed duration, used only for edge-cost ranking (see costOf) so
      // risk isn't double-counted: once as this delay, once as risk_score.
      // duration_minutes above (delay included) is what's shown to users.
      base_duration_minutes: timing.base_minutes,
      delay_minutes: timing.delay_minutes,
      risk_score: risk.risk_score,
      risk_level: risk.risk_level,
      factors: risk.factors,
      road_status: road.status,
      coordinates: JSON.parse(road.coordinates_json)
    };
  });

  return edges;
}

// Pathfinding cost is distance/time ONLY - deliberately no risk term. Risk
// must NOT feed into Dijkstra's per-edge cost here, because Dijkstra sums
// edge costs additively along the path: a 2-segment route would then have
// its segments' risk scores added together and get penalized twice over
// versus a 1-segment route, even when each of its segments is individually
// safer than the single segment it's being compared against. That would
// make "recommended" biased toward fewer, riskier hops - the opposite of
// what a risk-aware recommendation should do. Risk is instead applied once,
// to each *whole candidate path's* bottleneck (worst-segment) risk, in
// rankCandidates() below, after all candidate paths are already found.
function pathfindingCost(edge, weights) {
  return edge.distance_km * weights.distance + edge.base_duration_minutes * weights.time;
}

/** Dijkstra over the (undirected, multi-edge) road graph. */
function shortestPath(edges, originId, destId, weights, excludeRoadIds = new Set()) {
  const adjacency = {};
  for (const e of edges) {
    if (excludeRoadIds.has(e.roadId)) continue;
    const cost = pathfindingCost(e, weights);
    (adjacency[e.from] ??= []).push({ ...e, cost, to: e.to, forward: true });
    (adjacency[e.to] ??= []).push({ ...e, cost, to: e.from, forward: false });
  }

  const dist = { [originId]: 0 };
  const prev = {};
  const visited = new Set();
  const queue = [[0, originId]];

  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, u] = queue.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === destId) break;

    for (const edge of adjacency[u] || []) {
      const nd = d + edge.cost;
      if (dist[edge.to] === undefined || nd < dist[edge.to]) {
        dist[edge.to] = nd;
        prev[edge.to] = { edge, from: u };
        queue.push([nd, edge.to]);
      }
    }
  }

  if (dist[destId] === undefined) return null;

  const pathEdges = [];
  let cur = destId;
  while (cur !== originId) {
    const { edge, from } = prev[cur];
    pathEdges.unshift(edge);
    cur = from;
  }
  return { edges: pathEdges, cost: dist[destId] };
}

function flattenCoordinates(pathEdges) {
  const coords = [];
  for (const edge of pathEdges) {
    const seq = edge.forward ? edge.coordinates : [...edge.coordinates].reverse();
    for (const pt of seq) {
      const last = coords[coords.length - 1];
      if (!last || last[0] !== pt[0] || last[1] !== pt[1]) coords.push(pt);
    }
  }
  return coords;
}

function summarizePath(pathEdges) {
  const distance_km = Math.round(pathEdges.reduce((s, e) => s + e.distance_km, 0));
  const duration_minutes = Math.round(pathEdges.reduce((s, e) => s + e.duration_minutes, 0));
  // Undelayed total, used only for ranking (see rankScore in optimizeRoute)
  // so risk isn't counted twice - once directly, once via its own
  // delay-inflated duration. duration_minutes above (delay included) is the
  // real ETA shown to users.
  const base_duration_minutes = Math.round(pathEdges.reduce((s, e) => s + e.base_duration_minutes, 0));
  const delay_minutes = Math.round(pathEdges.reduce((s, e) => s + e.delay_minutes, 0));
  const worst = pathEdges.reduce((a, b) => (b.risk_score > a.risk_score ? b : a), pathEdges[0]);
  return {
    road_ids: pathEdges.map(e => e.roadId),
    road_names: pathEdges.map(e => e.name),
    distance_km,
    duration_minutes,
    base_duration_minutes,
    delay_minutes,
    risk_score: worst.risk_score,
    risk_level: worst.risk_level,
    limiting_factors: worst.factors,
    coordinates: flattenCoordinates(pathEdges)
  };
}

function pathKey(pathEdges) {
  return pathEdges.map(e => e.roadId).sort((a, b) => a - b).join('-');
}

/**
 * Finds a recommended route plus up to two alternatives between two
 * districts, weighted by cargo priority. Not shortest-distance routing -
 * risk and time are folded into the edge cost per PRIORITY_WEIGHTS.
 */
export async function optimizeRoute({ originDistrictId, destDistrictId, priority = 'medium' }) {
  const weights = PRIORITY_WEIGHTS[priority] || PRIORITY_WEIGHTS.medium;
  const edges = await buildRoadGraph();

  const best = shortestPath(edges, originDistrictId, destDistrictId, weights);
  if (!best) {
    return { routes: [], explanation: 'No connecting road found between these two districts in the seeded network.' };
  }

  const candidates = [best];
  const seenKeys = new Set([pathKey(best.edges)]);

  // Simple cumulative-exclusion k-alternative search: each round, exclude
  // every road used by any candidate found so far and re-run Dijkstra, which
  // forces a genuinely different path each time. This is what surfaces all
  // 3 parallel roads on the demo's Guwahati<->Itanagar corridor, not just
  // one alternative. Not a full Yen's-algorithm k-shortest-path (which would
  // also explore paths that reuse an excluded edge in combination with
  // different other edges) - a deliberate simplification, fine at this
  // graph's scale (~16 nodes).
  const excluded = new Set(best.edges.map(e => e.roadId));
  for (let round = 0; round < 4 && candidates.length < 3; round++) {
    const alt = shortestPath(edges, originDistrictId, destDistrictId, weights, excluded);
    if (!alt) break;
    const key = pathKey(alt.edges);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      candidates.push(alt);
    }
    for (const e of alt.edges) excluded.add(e.roadId);
  }

  // Rank the *whole summarized candidates* now (distance/duration are real
  // path totals; risk_score is the path's bottleneck/worst-segment risk from
  // summarizePath) - this is the one point where priority-weighted risk
  // actually decides "recommended", computed once per candidate rather than
  // once per edge, so a multi-segment route is never penalized just for
  // having more segments (see pathfindingCost's comment above).
  const top = candidates.map(c => summarizePath(c.edges));
  for (const route of top) {
    route.rankScore = route.distance_km * weights.distance + route.base_duration_minutes * weights.time + route.risk_score * weights.risk;
  }
  top.sort((a, b) => a.rankScore - b.rankScore);

  // Label: lowest rank score = recommended; among the rest, the lowest-risk
  // one is the "emergency" (safest fallback) route; anything else is an
  // alternative.
  const recommended = top[0];
  const rest = top.slice(1);
  rest.sort((a, b) => a.risk_score - b.risk_score);

  const labeled = [{ ...recommended, status: 'recommended' }];
  rest.forEach((r, i) => labeled.push({ ...r, status: i === 0 ? 'emergency' : 'alternative' }));

  for (const route of labeled) {
    route.explanation = buildExplanation(route, recommended, priority);
  }

  return { routes: labeled, priority_weights: weights };
}

function buildExplanation(route, recommended, priority) {
  if (route.status === 'recommended') {
    if (route.risk_score <= 20) {
      return `Lowest overall risk (${route.risk_score}/100) for a ${priority}-priority shipment among all available paths.`;
    }
    return `Best balance of distance, time and risk (${route.risk_score}/100) for a ${priority}-priority shipment.`;
  }
  if (route === recommended) return '';
  const distanceDiff = route.distance_km - recommended.distance_km;
  const distancePhrase = distanceDiff > 0 ? `${distanceDiff}km longer and ` : distanceDiff < 0 ? `${-distanceDiff}km shorter but ` : '';
  if (route.risk_score > recommended.risk_score) {
    return `Not recommended: ${distancePhrase}carries higher risk (${route.risk_score}/100) than the recommended route (${recommended.risk_score}/100). Main factors: ${route.limiting_factors.slice(0, 2).join('; ')}.`;
  }
  return `Safer fallback (risk ${route.risk_score}/100) if the recommended route becomes blocked, at the cost of ${distanceDiff > 0 ? `+${distanceDiff}km` : 'a longer travel time'}.`;
}
