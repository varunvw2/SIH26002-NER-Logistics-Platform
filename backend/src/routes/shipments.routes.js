import express from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, writeAudit } from '../middleware/roles.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createAlert } from '../services/alertEngine.js';

const router = express.Router();
router.use(requireAuth);

// MODULE 9 - Logistics / Delivery Management --------------------------------

router.get('/shipments', asyncHandler(async (req, res) => {
  const { status, priority, cargo_type } = req.query;
  let sql = `
    SELECT s.*, ol.name AS origin_name, dl.name AS destination_name, v.number AS vehicle_number
    FROM shipments s
    LEFT JOIN locations ol ON s.origin_location_id = ol.id
    LEFT JOIN locations dl ON s.destination_location_id = dl.id
    LEFT JOIN vehicles v ON s.vehicle_id = v.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND s.status = ?'; params.push(status); }
  if (priority) { sql += ' AND s.priority = ?'; params.push(priority); }
  if (cargo_type) { sql += ' AND s.cargo_type = ?'; params.push(cargo_type); }
  sql += ' ORDER BY s.created_at DESC';
  res.json(db.prepare(sql).all(...params));
}));

router.get('/shipments/:id', asyncHandler(async (req, res) => {
  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
  const route = shipment.route_id ? db.prepare('SELECT * FROM routes WHERE id = ?').get(shipment.route_id) : null;
  res.json({ ...shipment, route });
}));

const createSchema = z.object({
  cargo_type: z.enum(['medicine', 'food', 'agricultural_produce', 'construction_material', 'emergency_supplies', 'other']),
  cargo_quantity: z.string().max(200).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  origin_location_id: z.number().int(),
  destination_location_id: z.number().int(),
  vehicle_id: z.number().int().optional(),
  expected_delivery_at: z.string().optional()
});

router.post('/shipments', requireRole('logistics_manager', 'admin'), validateBody(createSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const code = `SHIP-${String(Date.now()).slice(-6)}`;
  const result = db.prepare(`
    INSERT INTO shipments (shipment_code, cargo_type, cargo_quantity, priority, origin_location_id,
      destination_location_id, vehicle_id, expected_delivery_at, status, created_by)
    VALUES (?,?,?,?,?,?,?,?,'pending',?)
  `).run(code, b.cargo_type, b.cargo_quantity ?? null, b.priority, b.origin_location_id,
    b.destination_location_id, b.vehicle_id ?? null, b.expected_delivery_at ?? null, req.user.id);

  // A vehicle carries state from its last job (status, current_route_id,
  // route_progress). Assigning it a fresh shipment means starting that job
  // clean - otherwise it would still show e.g. 'delivered' from the
  // *previous* shipment on the Dashboard/Vehicle Tracking/driver's journey
  // page until a new route is actually assigned.
  if (b.vehicle_id) {
    db.prepare(`
      UPDATE vehicles SET status = 'not_started', current_route_id = NULL, route_progress = 0, updated_at = datetime('now')
      WHERE id = ? AND status IN ('delivered', 'emergency')
    `).run(b.vehicle_id);
  }

  writeAudit(req.user.id, 'create_shipment', 'shipments', result.lastInsertRowid, b);
  res.status(201).json(db.prepare('SELECT * FROM shipments WHERE id = ?').get(result.lastInsertRowid));
}));

const statusSchema = z.object({
  status: z.enum(['pending', 'in_transit', 'delayed', 'rerouted', 'delivered', 'cancelled'])
});

router.patch('/shipments/:id/status', requireRole('logistics_manager', 'admin', 'driver'), validateBody(statusSchema), asyncHandler(async (req, res) => {
  const shipment = db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id);
  if (!shipment) return res.status(404).json({ error: 'Shipment not found' });

  db.prepare('UPDATE shipments SET status = ? WHERE id = ?').run(req.body.status, req.params.id);

  if (req.body.status === 'delayed') {
    createAlert({
      type: 'supply_delivery_delay',
      severity: shipment.priority === 'critical' ? 'critical' : 'medium',
      params: { shipment: shipment.shipment_code, cargo: shipment.cargo_type, delay: 30 },
      target_role: 'logistics_manager'
    });
  }

  writeAudit(req.user.id, 'update_shipment_status', 'shipments', shipment.id, { status: req.body.status });
  res.json(db.prepare('SELECT * FROM shipments WHERE id = ?').get(req.params.id));
}));

export default router;
