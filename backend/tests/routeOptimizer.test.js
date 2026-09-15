import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Point the db module at an isolated temp SQLite file BEFORE anything
// imports it, so this test never touches the real dev database.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbFile = path.join(__dirname, '.tmp-route-optimizer-test.db');
for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(testDbFile + suffix); } catch {} }
process.env.DATABASE_FILE = testDbFile;
process.env.JWT_SECRET = 'test-secret';
// Tests must be deterministic and offline-safe regardless of what's in the
// developer's real .env - force the mock weather provider even if a real
// OPENWEATHER_API_KEY is configured for the actual running app. Setting it
// (not deleting it) matters: dotenv.config() only skips a variable that's
// already PRESENT in process.env, so a deleted key gets happily refilled
// from .env, while an empty string here survives untouched (and is falsy,
// so getWeatherProvider() still picks the mock).
process.env.OPENWEATHER_API_KEY = '';

const { db } = await import('../src/db/index.js');
const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

const { optimizeRoute } = await import('../src/services/routeOptimizer.js');

// --- Fixture: two districts connected by two roads with an identical ------
// --- travel time but very different risk, so priority weighting is the ---
// --- only thing that can flip which route "wins".                       ---
const stateId = db.prepare("INSERT INTO states (name, code) VALUES ('TestState','TS')").run().lastInsertRowid;
const distA = db.prepare("INSERT INTO districts (state_id, name, lat, lng) VALUES (?, 'District A', 26.0, 91.0)").run(stateId).lastInsertRowid;
const distB = db.prepare("INSERT INTO districts (state_id, name, lat, lng) VALUES (?, 'District B', 27.0, 92.0)").run(stateId).lastInsertRowid;

db.prepare("INSERT INTO weather_records (district_id, rainfall_mm, condition) VALUES (?, 5, 'clear')").run(distA);
db.prepare("INSERT INTO weather_records (district_id, rainfall_mm, condition) VALUES (?, 5, 'clear')").run(distB);

const coords = JSON.stringify([[91.0, 26.0], [92.0, 27.0]]);
db.prepare(`
  INSERT INTO roads (name, state_id, from_district_id, to_district_id, length_km, terrain_slope_deg, road_condition, status, landslide_history_count, coordinates_json)
  VALUES ('Short Risky Road', ?, ?, ?, 100, 20, 'poor', 'yellow', 5, ?)
`).run(stateId, distA, distB, coords);

db.prepare(`
  INSERT INTO roads (name, state_id, from_district_id, to_district_id, length_km, terrain_slope_deg, road_condition, status, landslide_history_count, coordinates_json)
  VALUES ('Long Safe Road', ?, ?, ?, 200, 5, 'good', 'green', 0, ?)
`).run(stateId, distA, distB, coords);

test('low priority cargo is routed via the shorter, riskier road', async () => {
  const { routes } = await optimizeRoute({ originDistrictId: distA, destDistrictId: distB, priority: 'low' });
  const recommended = routes.find(r => r.status === 'recommended');
  assert.equal(recommended.road_names[0], 'Short Risky Road');
});

test('critical priority cargo is routed via the longer, safer road even though it is not the shortest', async () => {
  const { routes } = await optimizeRoute({ originDistrictId: distA, destDistrictId: distB, priority: 'critical' });
  const recommended = routes.find(r => r.status === 'recommended');
  assert.equal(recommended.road_names[0], 'Long Safe Road');
  assert.ok(recommended.risk_score < routes.find(r => r.road_names[0] === 'Short Risky Road').risk_score);
});

test('both candidate roads are surfaced (recommended + alternative/emergency)', async () => {
  const { routes } = await optimizeRoute({ originDistrictId: distA, destDistrictId: distB, priority: 'critical' });
  assert.equal(routes.length, 2);
  assert.ok(routes.every(r => typeof r.explanation === 'string' && r.explanation.length > 0));
});

// --- Regression fixture: a 2-segment path must never be penalized just for
// --- having more segments than a 1-segment alternative (each segment's risk
// --- summed into the pathfinding cost independently would double-count
// --- risk and could make a genuinely safer multi-hop route lose to a single
// --- risky direct road - the exact bug this locks in).
const distD = db.prepare("INSERT INTO districts (state_id, name, lat, lng) VALUES (?, 'District D', 25.0, 90.0)").run(stateId).lastInsertRowid;
const distX = db.prepare("INSERT INTO districts (state_id, name, lat, lng) VALUES (?, 'District X', 25.5, 90.5)").run(stateId).lastInsertRowid;
const distE = db.prepare("INSERT INTO districts (state_id, name, lat, lng) VALUES (?, 'District E', 26.0, 91.5)").run(stateId).lastInsertRowid;
db.prepare("INSERT INTO weather_records (district_id, rainfall_mm, condition) VALUES (?, 5, 'clear')").run(distD);
db.prepare("INSERT INTO weather_records (district_id, rainfall_mm, condition) VALUES (?, 5, 'clear')").run(distX);
db.prepare("INSERT INTO weather_records (district_id, rainfall_mm, condition) VALUES (?, 45, 'heavy_rain')").run(distE);

const line2 = JSON.stringify([[90.0, 25.0], [91.5, 26.0]]);
db.prepare(`
  INSERT INTO roads (name, state_id, from_district_id, to_district_id, length_km, terrain_slope_deg, road_condition, status, landslide_history_count, coordinates_json)
  VALUES ('Direct Risky Road', ?, ?, ?, 260, 20, 'good', 'yellow', 0, ?)
`).run(stateId, distD, distE, line2);
db.prepare(`
  INSERT INTO roads (name, state_id, from_district_id, to_district_id, length_km, terrain_slope_deg, road_condition, status, landslide_history_count, coordinates_json)
  VALUES ('Leg 1 (D-X)', ?, ?, ?, 150, 18, 'fair', 'green', 0, ?)
`).run(stateId, distD, distX, line2);
db.prepare(`
  INSERT INTO roads (name, state_id, from_district_id, to_district_id, length_km, terrain_slope_deg, road_condition, status, landslide_history_count, coordinates_json)
  VALUES ('Leg 2 (X-E)', ?, ?, ?, 110, 0, 'good', 'green', 0, ?)
`).run(stateId, distX, distE, line2);

test('a safer 2-segment route is not penalized for having more segments than a 1-segment alternative', async () => {
  const { routes } = await optimizeRoute({ originDistrictId: distD, destDistrictId: distE, priority: 'critical' });
  const recommended = routes.find(r => r.status === 'recommended');
  // The 2-hop path's bottleneck risk (~40, from the rainfall-affected leg)
  // is lower than the direct road's (~65, steep terrain + rainfall) - it
  // must win despite having 2 segments instead of 1.
  assert.deepEqual(recommended.road_names, ['Leg 1 (D-X)', 'Leg 2 (X-E)']);
  const direct = routes.find(r => r.road_names.includes('Direct Risky Road'));
  assert.ok(recommended.risk_score < direct.risk_score);
});

test('unreachable districts return an empty route list, not a crash', async () => {
  const distC = db.prepare("INSERT INTO districts (state_id, name, lat, lng) VALUES (?, 'District C', 28.0, 93.0)").run(stateId).lastInsertRowid;
  const { routes } = await optimizeRoute({ originDistrictId: distA, destDistrictId: distC, priority: 'medium' });
  assert.deepEqual(routes, []);
});

after(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(testDbFile + suffix); } catch {} }
});
