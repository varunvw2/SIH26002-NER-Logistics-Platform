import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createAlert } from '../services/alertEngine.js';
import { tickVehicle } from '../services/vehicleSimulator.js';

const router = express.Router();
router.use(requireAuth);

// A driver may only act on their own vehicle - admins/logistics_managers can
// act on any vehicle (fleet-wide responsibility). Without this, any
// authenticated driver could PATCH GPS or reroute someone else's vehicle by
// guessing an id.
function assertVehicleOwnership(req, vehicleId) {
  if (req.user.role !== 'driver') return true;
  const owns = db.prepare(`
    SELECT 1 FROM vehicles v JOIN drivers d ON v.driver_id = d.id
    WHERE v.id = ? AND d.user_id = ?
  `).get(vehicleId, req.user.id);
  return Boolean(owns);
}

// MODULE 5 - Vehicle GPS Tracking -------------------------------------------

router.get('/vehicles', asyncHandler(async (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT v.*, d.name AS driver_name, d.phone AS driver_phone,
           l.name AS destination_name, l.lat AS destination_lat, l.lng AS destination_lng
    FROM vehicles v
    LEFT JOIN drivers d ON v.driver_id = d.id
    LEFT JOIN locations l ON v.destination_location_id = l.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND v.status = ?'; params.push(status); }
  res.json(db.prepare(sql).all(...params));
}));

router.get('/vehicles/:id', asyncHandler(async (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const history = db.prepare('SELECT lat, lng, speed_kmh, recorded_at FROM gps_positions WHERE vehicle_id = ? ORDER BY recorded_at DESC LIMIT 50').all(req.params.id);
  res.json({ ...vehicle, history });
}));

const gpsSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  speed_kmh: z.number().min(0).max(200).optional(),
  status: z.enum(['not_started', 'in_transit', 'delayed', 'rerouted', 'delivered', 'emergency']).optional()
});

// Real GPS integration point: a driver's phone (or hardware GPS unit) can
// call this exact endpoint with real coordinates - no server-side change
// needed to move off the simulation provider (see providers/gps/GPSProvider.js).
router.patch('/vehicles/:id/gps', requireRole('driver', 'logistics_manager', 'admin'), validateBody(gpsSchema), asyncHandler(async (req, res) => {
  const { latitude, longitude, speed_kmh, status } = req.body;
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  if (!assertVehicleOwnership(req, req.params.id)) return res.status(403).json({ error: 'Not your vehicle' });

  db.prepare(`
    UPDATE vehicles SET lat = ?, lng = ?, speed_kmh = COALESCE(?, speed_kmh), status = COALESCE(?, status),
    updated_at = datetime('now') WHERE id = ?
  `).run(latitude, longitude, speed_kmh, status, req.params.id);

  db.prepare('INSERT INTO gps_positions (vehicle_id, lat, lng, speed_kmh) VALUES (?,?,?,?)')
    .run(req.params.id, latitude, longitude, speed_kmh ?? vehicle.speed_kmh);

  res.json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id));
}));

// Advances a vehicle's simulated position one step along its assigned
// route's polyline. This is what the "GPS simulation" acceptable-for-prototype
// requirement drives; swapping providers/gps/SimulationProvider.js for a
// MobileGPSProvider is the documented upgrade path.
router.post('/vehicles/:id/simulate-tick', asyncHandler(async (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  if (!vehicle.current_route_id) return res.status(400).json({ error: 'Vehicle has no assigned route to simulate along' });

  const result = await tickVehicle(req.params.id);
  res.json(result);
}));

// Assigns a previously-computed route (see planning.routes.js) to a vehicle
// and starts it moving.
router.post('/vehicles/:id/assign-route', requireRole('logistics_manager', 'admin'), asyncHandler(async (req, res) => {
  const { route_id } = req.body;
  const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(route_id);
  if (!route) return res.status(404).json({ error: 'Route not found' });

  db.prepare(`
    UPDATE vehicles SET current_route_id = ?, route_progress = 0, status = 'in_transit', updated_at = datetime('now')
    WHERE id = ?
  `).run(route_id, req.params.id);

  db.prepare(`
    UPDATE shipments SET status = 'in_transit', route_id = ?
    WHERE vehicle_id = ? AND status = 'pending'
  `).run(route_id, req.params.id);

  if (route.risk_level === 'orange' || route.risk_level === 'red') {
    createAlert({
      type: 'high_risk_route',
      severity: route.risk_level === 'red' ? 'critical' : 'high',
      params: { road: route.explanation ?? 'assigned route', risk: route.risk_score, level: route.risk_level, factors: 'see route detail' },
      target_role: 'logistics_manager'
    });
  }

  res.json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id));
}));

router.get('/drivers', asyncHandler(async (req, res) => {
  res.json(db.prepare('SELECT * FROM drivers').all());
}));

export default router;
