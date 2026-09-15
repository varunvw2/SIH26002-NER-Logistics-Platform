import express from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { computeAllDistrictConnectivity } from '../services/connectivityScore.js';
import { analyzeBottlenecks } from '../services/bottleneckAnalysis.js';

const router = express.Router();
router.use(requireAuth);

// MODULE 11 - Government / Admin Dashboard KPI cards -------------------------
router.get('/analytics/kpis', asyncHandler(async (req, res) => {
  const count = (sql, ...params) => db.prepare(sql).get(...params).c;
  res.json({
    total_roads: count('SELECT COUNT(*) AS c FROM roads'),
    accessible_roads: count("SELECT COUNT(*) AS c FROM roads WHERE status IN ('green','yellow')"),
    high_risk_roads: count("SELECT COUNT(*) AS c FROM roads WHERE status = 'orange'"),
    blocked_roads: count("SELECT COUNT(*) AS c FROM roads WHERE status = 'red'"),
    active_incidents: count("SELECT COUNT(*) AS c FROM incidents WHERE status = 'open'"),
    vehicles_in_transit: count("SELECT COUNT(*) AS c FROM vehicles WHERE status = 'in_transit'"),
    delayed_vehicles: count("SELECT COUNT(*) AS c FROM vehicles WHERE status IN ('delayed','rerouted')"),
    active_shipments: count("SELECT COUNT(*) AS c FROM shipments WHERE status IN ('pending','in_transit','delayed','rerouted')"),
    affected_districts: count("SELECT COUNT(*) AS c FROM districts WHERE connectivity_score IS NOT NULL AND connectivity_score < 50")
  });
}));

// MODULE 12 - District Connectivity Score ------------------------------------
router.get('/analytics/district-connectivity', asyncHandler(async (req, res) => {
  res.json(await computeAllDistrictConnectivity());
}));

// MODULE 13 - Logistics Bottleneck Analysis ----------------------------------
router.get('/analytics/bottlenecks', asyncHandler(async (req, res) => {
  res.json(await analyzeBottlenecks(Number(req.query.limit) || 10));
}));

// Historical trend: incidents per day for the last 14 days, for a simple
// dashboard sparkline/chart.
router.get('/analytics/incident-trend', asyncHandler(async (req, res) => {
  const rows = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS count
    FROM incidents
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY date(created_at)
    ORDER BY day
  `).all();
  res.json(rows);
}));

export default router;
