import express from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { buildRoadGraph } from '../services/routeOptimizer.js';
import { computeAllDistrictConnectivity } from '../services/connectivityScore.js';
import { listAlerts } from '../services/alertEngine.js';

const router = express.Router();
router.use(requireAuth);

// MODULE 10 - Emergency Mode --------------------------------------------------
// One aggregate endpoint powering a dedicated, visually distinct dashboard
// view: blocked roads, the safest currently-available paths, critical
// facilities, active emergency vehicles, affected districts, active alerts.
router.get('/emergency/state', asyncHandler(async (req, res) => {
  const edges = await buildRoadGraph();
  const blockedRoads = edges.filter(e => e.road_status === 'red' || e.risk_level === 'red');
  const safeRoutes = [...edges].sort((a, b) => a.risk_score - b.risk_score).slice(0, 5);

  const hospitals = db.prepare("SELECT * FROM locations WHERE type = 'hospital'").all();
  const reliefCenters = db.prepare("SELECT * FROM locations WHERE type = 'relief_center'").all();
  const warehouses = db.prepare("SELECT * FROM locations WHERE type = 'warehouse'").all();

  const emergencyVehicles = db.prepare("SELECT * FROM vehicles WHERE status = 'emergency'").all();
  const criticalShipments = db.prepare(`
    SELECT * FROM shipments WHERE priority = 'critical' AND status NOT IN ('delivered', 'cancelled')
  `).all();

  const connectivity = await computeAllDistrictConnectivity();
  const affectedDistricts = connectivity.filter(d => d.risk === 'high' || d.risk === 'critical');

  const activeAlerts = listAlerts({ limit: 20 });

  res.json({
    generated_at: new Date().toISOString(),
    blocked_roads: blockedRoads.map(e => ({ road_id: e.roadId, name: e.name, risk_score: e.risk_score, factors: e.factors, coordinates: e.coordinates })),
    safest_available_routes: safeRoutes.map(e => ({ road_id: e.roadId, name: e.name, risk_score: e.risk_score, risk_level: e.risk_level, coordinates: e.coordinates })),
    hospitals, relief_centers: reliefCenters, warehouses,
    emergency_vehicles: emergencyVehicles,
    critical_priority_shipments: criticalShipments,
    affected_districts: affectedDistricts,
    active_alerts: activeAlerts
  });
}));

export default router;
