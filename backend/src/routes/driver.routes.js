import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, writeAudit } from '../middleware/roles.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createAlert } from '../services/alertEngine.js';

const router = express.Router();
// Mounted at '/api/driver' (not generic '/api') in app.js - see the same
// note in admin.routes.js for why a role-restricted blanket router.use()
// must never sit on a generically-mounted path.
router.use(requireAuth, requireRole('driver', 'admin'));

// The exact journey pipeline requested:
//   Login -> Assigned Shipment -> View Recommended Route -> Start Journey ->
//   GPS Tracking -> Risk Monitoring -> Alert -> Alternate Route -> Reroute -> Delivery
//
// Route calculation itself is deliberately NOT duplicated here - it reuses
// POST /api/routes/optimize (planning.routes.js), the same engine the
// logistics manager's Route Planner uses. This file only adds the
// driver-scoped "which vehicle/shipment is mine" lookups and an
// ownership-checked start/reroute action.

function myVehicle(userId) {
  return db.prepare(`
    SELECT v.* FROM vehicles v
    JOIN drivers d ON v.driver_id = d.id
    WHERE d.user_id = ?
  `).get(userId);
}

router.get('/me/vehicle', asyncHandler(async (req, res) => {
  const vehicle = myVehicle(req.user.id);
  if (!vehicle) return res.status(404).json({ error: 'No vehicle is linked to your driver account yet - ask an admin to link one.' });
  res.json(vehicle);
}));

router.get('/me/shipments', asyncHandler(async (req, res) => {
  const vehicle = myVehicle(req.user.id);
  if (!vehicle) return res.json([]);
  const shipments = db.prepare(`
    SELECT s.*, ol.name AS origin_name, ol.lat AS origin_lat, ol.lng AS origin_lng, ol.district_id AS origin_district_id,
           dl.name AS destination_name, dl.lat AS dest_lat, dl.lng AS dest_lng, dl.district_id AS destination_district_id
    FROM shipments s
    LEFT JOIN locations ol ON s.origin_location_id = ol.id
    LEFT JOIN locations dl ON s.destination_location_id = dl.id
    WHERE s.vehicle_id = ? AND s.status NOT IN ('delivered', 'cancelled')
    ORDER BY s.created_at DESC
  `).all(vehicle.id);
  res.json(shipments);
}));

const startSchema = z.object({
  shipment_id: z.number().int(),
  route_id: z.number().int()
});

// Combines "Start Journey" and "Reroute" into one action: assigning a route
// to a vehicle that has none yet is a fresh start (status -> in_transit);
// assigning one to a vehicle already under way is a reroute (status ->
// 'rerouted', and an emergency_route_change alert fires) - same endpoint,
// the distinction is made from the vehicle's current state, matching how a
// driver actually experiences it as one button either way.
router.post('/me/journey/start', validateBody(startSchema), asyncHandler(async (req, res) => {
  const vehicle = myVehicle(req.user.id);
  if (!vehicle) return res.status(404).json({ error: 'No vehicle is linked to your driver account.' });

  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.body.shipment_id);
  if (!shipment || shipment.vehicle_id !== vehicle.id) {
    return res.status(403).json({ error: 'That shipment is not assigned to your vehicle.' });
  }

  const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(req.body.route_id);
  if (!route) return res.status(404).json({ error: 'Route not found. Recalculate and try again.' });

  const isReroute = Boolean(vehicle.current_route_id) && (vehicle.status === 'in_transit' || vehicle.status === 'rerouted');
  const newStatus = isReroute ? 'rerouted' : 'in_transit';

  db.prepare(`
    UPDATE vehicles SET current_route_id = ?, route_progress = 0, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(route.id, newStatus, vehicle.id);

  db.prepare(`
    UPDATE shipments SET status = ?, route_id = ?
    WHERE id = ?
  `).run(newStatus === 'rerouted' ? 'rerouted' : 'in_transit', route.id, shipment.id);

  if (isReroute) {
    createAlert({
      type: 'emergency_route_change',
      severity: route.risk_level === 'red' ? 'critical' : 'high',
      params: { vehicle: vehicle.number, risk: route.risk_score },
      target_role: 'driver',
      vehicle_id: vehicle.id
    });
    createAlert({
      type: 'emergency_route_change',
      severity: 'medium',
      params: { vehicle: vehicle.number, risk: route.risk_score },
      target_role: 'logistics_manager'
    });
  }

  writeAudit(req.user.id, isReroute ? 'driver_reroute' : 'driver_start_journey', 'vehicles', vehicle.id, { route_id: route.id });

  res.json({
    reroute: isReroute,
    vehicle: db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle.id),
    shipment: db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipment.id)
  });
}));

export default router;
