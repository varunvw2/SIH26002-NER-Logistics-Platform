import { db } from '../db/index.js';
import { SimulationProvider } from '../providers/gps/SimulationProvider.js';

const simulator = new SimulationProvider();

/**
 * Advances one vehicle's simulated position one step along its assigned
 * route. Used by both the manual `/vehicles/:id/simulate-tick` endpoint and
 * the background auto-tick loop in server.js, so "pseudo-real-time" movement
 * keeps happening even if no one is clicking anything in the UI.
 */
export async function tickVehicle(vehicleId) {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
  if (!vehicle || !vehicle.current_route_id) return null;
  if (vehicle.status !== 'in_transit' && vehicle.status !== 'rerouted') return null;

  const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(vehicle.current_route_id);
  if (!route) return null;
  const coordinates = JSON.parse(route.coordinates_json);

  const next = await simulator.getNextPosition(vehicle, { coordinates }, vehicle.route_progress);
  const arrived = next.progress >= 1;

  db.prepare(`
    UPDATE vehicles SET lat = ?, lng = ?, speed_kmh = ?, route_progress = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(next.lat, next.lng, arrived ? 0 : next.speed_kmh, next.progress, arrived ? 'delivered' : vehicle.status, vehicleId);

  db.prepare('INSERT INTO gps_positions (vehicle_id, lat, lng, speed_kmh) VALUES (?,?,?,?)')
    .run(vehicleId, next.lat, next.lng, next.speed_kmh);

  if (arrived) {
    db.prepare("UPDATE shipments SET status = 'delivered' WHERE vehicle_id = ? AND status != 'delivered'").run(vehicleId);
  }

  return { ...db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId), arrived };
}

export async function tickAllActiveVehicles() {
  const active = db.prepare("SELECT id FROM vehicles WHERE status IN ('in_transit','rerouted') AND current_route_id IS NOT NULL").all();
  for (const v of active) {
    try { await tickVehicle(v.id); } catch (error) { console.error('Simulation tick failed for vehicle', v.id, error.message); }
  }
  return active.length;
}
