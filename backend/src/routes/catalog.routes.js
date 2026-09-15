import express from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { buildRoadGraph } from '../services/routeOptimizer.js';

const router = express.Router();
router.use(requireAuth);

// MODULE 1 - GIS / NER MAP data feeds --------------------------------------

router.get('/states', asyncHandler(async (req, res) => {
  res.json(db.prepare('SELECT * FROM states ORDER BY name').all());
}));

router.get('/districts', asyncHandler(async (req, res) => {
  const { state_id } = req.query;
  const rows = state_id
    ? db.prepare('SELECT * FROM districts WHERE state_id = ? ORDER BY name').all(state_id)
    : db.prepare('SELECT * FROM districts ORDER BY name').all();
  res.json(rows);
}));

router.get('/districts/:id', asyncHandler(async (req, res) => {
  const district = db.prepare('SELECT * FROM districts WHERE id = ?').get(req.params.id);
  if (!district) return res.status(404).json({ error: 'District not found' });
  res.json(district);
}));

// Roads carry LIVE risk (MODULE 2 output) on every read, not a stored stale
// value, so the map/table always reflects current weather + incidents.
router.get('/roads', asyncHandler(async (req, res) => {
  const { state_id, status, risk_level } = req.query;
  const edges = await buildRoadGraph();
  const roads = db.prepare('SELECT * FROM roads').all();
  const edgeByRoadId = Object.fromEntries(edges.map(e => [e.roadId, e]));

  let result = roads.map(road => {
    const edge = edgeByRoadId[road.id];
    return {
      ...road,
      coordinates: JSON.parse(road.coordinates_json),
      risk_score: edge?.risk_score ?? null,
      risk_level: edge?.risk_level ?? null,
      risk_factors: edge?.factors ?? [],
      duration_minutes: edge?.duration_minutes ?? null,
      delay_minutes: edge?.delay_minutes ?? null
    };
  });

  if (state_id) result = result.filter(r => String(r.state_id) === String(state_id));
  if (status) result = result.filter(r => r.status === status);
  if (risk_level) result = result.filter(r => r.risk_level === risk_level);

  res.json(result);
}));

router.get('/roads/:id', asyncHandler(async (req, res) => {
  const road = db.prepare('SELECT * FROM roads WHERE id = ?').get(req.params.id);
  if (!road) return res.status(404).json({ error: 'Road not found' });
  const edges = await buildRoadGraph();
  const edge = edges.find(e => e.roadId === road.id);
  const bridges = db.prepare('SELECT * FROM bridges WHERE road_id = ?').all(road.id);
  res.json({
    ...road,
    coordinates: JSON.parse(road.coordinates_json),
    bridges,
    risk_score: edge?.risk_score ?? null,
    risk_level: edge?.risk_level ?? null,
    risk_factors: edge?.factors ?? []
  });
}));

// Manual status override (e.g. a verified incident closes a road). Real
// automatic flips also happen from incidents.routes.js on critical reports.
router.patch('/roads/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['green', 'yellow', 'orange', 'red'].includes(status)) {
    return res.status(400).json({ error: 'status must be green|yellow|orange|red' });
  }
  const result = db.prepare("UPDATE roads SET status = ?, last_incident_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Road not found' });
  res.json(db.prepare('SELECT * FROM roads WHERE id = ?').get(req.params.id));
}));

router.get('/bridges', asyncHandler(async (req, res) => {
  res.json(db.prepare('SELECT * FROM bridges').all());
}));

router.get('/locations', asyncHandler(async (req, res) => {
  const { type, district_id } = req.query;
  let sql = 'SELECT * FROM locations WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (district_id) { sql += ' AND district_id = ?'; params.push(district_id); }
  res.json(db.prepare(sql).all(...params));
}));

export default router;
