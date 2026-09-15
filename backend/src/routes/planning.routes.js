import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { optimizeRoute } from '../services/routeOptimizer.js';
import { buildPredictiveWarning } from '../services/riskEngine.js';
import { getNavigationSteps } from '../services/navigationService.js';

const router = express.Router();
router.use(requireAuth);

const optimizeSchema = z.object({
  origin_district_id: z.number().int(),
  dest_district_id: z.number().int(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  shipment_id: z.number().int().optional()
});

// MODULE 3 - AI Route Optimization ------------------------------------------
// Persists every candidate route so it can later be attached to a shipment
// (shipments.route_id) and picked up by bottleneck analytics.
router.post('/routes/optimize', validateBody(optimizeSchema), asyncHandler(async (req, res) => {
  const { origin_district_id, dest_district_id, priority, shipment_id } = req.body;
  const origin = db.prepare('SELECT * FROM districts WHERE id = ?').get(origin_district_id);
  const dest = db.prepare('SELECT * FROM districts WHERE id = ?').get(dest_district_id);
  if (!origin || !dest) return res.status(404).json({ error: 'Unknown origin or destination district' });

  const { routes, priority_weights } = await optimizeRoute({ originDistrictId: origin_district_id, destDistrictId: dest_district_id, priority });
  if (routes.length === 0) {
    return res.status(422).json({ error: 'No route found between these districts in the current road network' });
  }

  const insert = db.prepare(`
    INSERT INTO routes (shipment_id, origin_lat, origin_lng, dest_lat, dest_lng, road_ids_json,
      coordinates_json, distance_km, duration_minutes, risk_score, risk_level, status, explanation)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const saved = routes.map(route => {
    const result = insert.run(
      shipment_id ?? null, origin.lat, origin.lng, dest.lat, dest.lng,
      JSON.stringify(route.road_ids), JSON.stringify(route.coordinates),
      route.distance_km, route.duration_minutes, route.risk_score, route.risk_level,
      route.status, route.explanation
    );
    return { id: result.lastInsertRowid, ...route };
  });

  if (shipment_id) {
    const recommended = saved.find(r => r.status === 'recommended');
    if (recommended) db.prepare('UPDATE shipments SET route_id = ? WHERE id = ?').run(recommended.id, shipment_id);
  }

  res.json({
    origin: { id: origin.id, name: origin.name },
    destination: { id: dest.id, name: dest.name },
    priority, priority_weights,
    routes: saved
  });
}));

router.get('/routes/:id', asyncHandler(async (req, res) => {
  const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(req.params.id);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  res.json({ ...route, road_ids: JSON.parse(route.road_ids_json), coordinates: JSON.parse(route.coordinates_json) });
}));

// Turn-by-turn maneuvers for a route (driver navigation panel). Cached per
// route id in navigationService, so the driver's polling screen doesn't hit
// OSRM repeatedly. Returns an empty step list (not an error) if OSRM is
// unreachable - the driver still gets the map, just without instructions.
router.get('/routes/:id/navigation', asyncHandler(async (req, res) => {
  const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(req.params.id);
  if (!route) return res.status(404).json({ error: 'Route not found' });
  const steps = await getNavigationSteps(route);
  res.json({ route_id: route.id, steps });
}));

// MODULE 4 - Disruption prediction (wraps module 2's risk output in clearly
// forward-looking, non-confirmed wording).
router.get('/risk/predictions', asyncHandler(async (req, res) => {
  const { buildRoadGraph } = await import('../services/routeOptimizer.js');
  const edges = await buildRoadGraph();
  const predictions = edges
    .map(e => ({
      road_id: e.roadId,
      road_name: e.name,
      risk_score: e.risk_score,
      risk_level: e.risk_level,
      factors: e.factors,
      predictive_warning: buildPredictiveWarning({ risk_level: e.risk_level })
    }))
    .filter(p => p.predictive_warning);

  for (const p of predictions) {
    db.prepare(`
      INSERT INTO risk_predictions (road_id, risk_score, risk_level, disruption_probability, factors_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(p.road_id, p.risk_score, p.risk_level, p.risk_score / 100, JSON.stringify(p.factors));
  }

  res.json(predictions);
}));

export default router;
