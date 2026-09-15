import bcrypt from 'bcryptjs';
import { db, transaction } from './index.js';
import { OSRMProvider } from '../providers/routing/OSRMProvider.js';

// ---------------------------------------------------------------------------
// Realistic (approximate) demo data for the eight NER states. Coordinates are
// real-world approximations of the named towns; road distances/conditions are
// illustrative for the demo, NOT sourced from an official survey. Everything
// here is clearly a seeded prototype dataset, not live government data.
// ---------------------------------------------------------------------------

function clearAll() {
  const tables = [
    'notifications', 'alerts', 'audit_logs', 'sync_queue', 'field_reports',
    'incidents', 'gps_positions', 'risk_predictions', 'weather_records',
    'shipments', 'routes', 'vehicles', 'bridges', 'locations', 'roads',
    'drivers', 'users', 'districts', 'states'
  ];
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
}

// --- District coordinates, known up front so road geometry can be fetched --
// --- (an async, network-dependent step) BEFORE the synchronous DB transaction.
const districtDefs = [
  ['AS', 'Kamrup Metropolitan', 'Guwahati', 26.1445, 91.7362],
  ['AS', 'Dibrugarh', 'Dibrugarh', 27.4728, 94.9120],
  ['AR', 'Papum Pare', 'Itanagar', 27.0844, 93.6053],
  ['AR', 'West Kameng', 'Bomdila', 27.2646, 92.4159],
  ['MN', 'Imphal West', 'Imphal', 24.8170, 93.9368],
  ['MN', 'Churachandpur', 'Churachandpur', 24.3333, 93.6833],
  ['ML', 'East Khasi Hills', 'Shillong', 25.5788, 91.8933],
  ['ML', 'West Garo Hills', 'Tura', 25.5138, 90.2027],
  ['MZ', 'Aizawl', 'Aizawl', 23.7271, 92.7176],
  ['MZ', 'Lunglei', 'Lunglei', 22.8833, 92.7333],
  ['NL', 'Kohima', 'Kohima', 25.6751, 94.1086],
  ['NL', 'Dimapur', 'Dimapur', 25.9091, 93.7267],
  ['SK', 'East Sikkim', 'Gangtok', 27.3389, 88.6065],
  ['SK', 'South Sikkim', 'Namchi', 27.1667, 88.3667],
  ['TR', 'West Tripura', 'Agartala', 23.8315, 91.2868],
  ['TR', 'Dhalai', 'Ambassa', 23.9167, 91.8333]
];
const districtCoord = {}; // name -> [lng, lat]
for (const [, name, , lat, lng] of districtDefs) districtCoord[name] = [lng, lat];

const roadDefs = [
  // name, state, from, to, km, slope, condition, status, landslideCount, viaWaypoints
  // (viaWaypoints matters here specifically because these 3 roads share
  // the same from/to district pair - without distinct intermediate
  // points they'd render as identical overlapping lines on the map, even
  // with real road-snapped geometry, since OSRM would otherwise return the
  // same shortest real road for all three)
  ['NH-6 (Guwahati-Shillong)', 'ML', 'Kamrup Metropolitan', 'East Khasi Hills', 100, 10, 'good', 'green', 0],
  ['NH-37 (Guwahati-Itanagar)', 'AR', 'Kamrup Metropolitan', 'Papum Pare', 280, 12, 'fair', 'green', 3, [[91.9, 26.6], [92.5, 27.0]]],
  ['SH-1 (Guwahati-Itanagar via Tezpur)', 'AR', 'Kamrup Metropolitan', 'Papum Pare', 320, 8, 'good', 'green', 0, [[92.8, 26.63], [93.2, 26.9]]],
  ['NH-415 Mountain Shortcut (Guwahati-Itanagar)', 'AR', 'Kamrup Metropolitan', 'Papum Pare', 250, 25, 'poor', 'yellow', 6, [[92.3, 27.2]]],
  ['NH-13 (Itanagar-Bomdila)', 'AR', 'Papum Pare', 'West Kameng', 180, 22, 'poor', 'yellow', 4],
  ['NH-27 (Guwahati-Dimapur)', 'NL', 'Kamrup Metropolitan', 'Dimapur', 230, 8, 'good', 'green', 0],
  ['NH-29 (Dimapur-Kohima)', 'NL', 'Dimapur', 'Kohima', 75, 18, 'fair', 'yellow', 2],
  ['NH-2 (Dimapur-Imphal)', 'MN', 'Dimapur', 'Imphal West', 215, 15, 'fair', 'orange', 1],
  ['SH-2 (Imphal-Churachandpur)', 'MN', 'Imphal West', 'Churachandpur', 65, 20, 'fair', 'green', 0],
  ['NH-306 (Guwahati-Aizawl)', 'MZ', 'Kamrup Metropolitan', 'Aizawl', 450, 14, 'fair', 'green', 1],
  ['NH-54 (Aizawl-Lunglei)', 'MZ', 'Aizawl', 'Lunglei', 120, 16, 'fair', 'yellow', 1],
  ['NH-8 (Guwahati-Agartala)', 'TR', 'Kamrup Metropolitan', 'West Tripura', 480, 6, 'good', 'green', 0],
  ['SH-3 (Agartala-Dhalai)', 'TR', 'West Tripura', 'Dhalai', 110, 10, 'fair', 'green', 0],
  ['NH-10 (Guwahati-Gangtok)', 'SK', 'Kamrup Metropolitan', 'East Sikkim', 620, 9, 'good', 'green', 0],
  ['NH-510 (Gangtok-Namchi)', 'SK', 'East Sikkim', 'South Sikkim', 78, 17, 'fair', 'yellow', 1],
  ['NH-27E (Guwahati-Dibrugarh)', 'AS', 'Kamrup Metropolitan', 'Dibrugarh', 435, 4, 'good', 'green', 0],
  ['NH-62 (Shillong-Tura)', 'ML', 'East Khasi Hills', 'West Garo Hills', 220, 13, 'fair', 'yellow', 1],

  // --- Cross-connecting roads --------------------------------------------
  // The roads above are almost a pure hub-and-spoke tree from Guwahati -
  // structurally, most district pairs had exactly ONE possible path, so
  // "find a safer alternate route" had nothing to find outside the
  // Guwahati<->Itanagar corridor. These add real cycles to the graph (via
  // the real Barak Valley/Silchar and Mao corridors) so rerouting has a
  // genuine second option for several more corridors, not just one.
  ['NH-6A (Shillong-Aizawl via Silchar)', 'ML', 'East Khasi Hills', 'Aizawl', 300, 12, 'fair', 'green', 1],
  ['NH-44 (Agartala-Aizawl)', 'TR', 'West Tripura', 'Aizawl', 180, 10, 'fair', 'green', 0],
  ['NH-2A (Kohima-Imphal via Mao)', 'NL', 'Kohima', 'Imphal West', 140, 16, 'fair', 'green', 1],
  ['NH-15 (Dibrugarh-Itanagar)', 'AS', 'Dibrugarh', 'Papum Pare', 200, 14, 'good', 'green', 0],
  ['NH-27B (Guwahati-Kohima Direct)', 'NL', 'Kamrup Metropolitan', 'Kohima', 260, 10, 'good', 'green', 0]
];

/**
 * Fetches real road-snapped geometry for every road (routed through its
 * via-waypoints, if any) from the free OSRM demo server. Falls back to the
 * straight-line/waypoint approximation per-road on any failure - this is a
 * one-time, seed-only network dependency; the running app never calls out
 * for this.
 */
async function fetchRoadGeometries() {
  const osrm = new OSRMProvider();
  const geometry = {};
  for (const [name, , fromD, toD, , , , , , viaWaypoints] of roadDefs) {
    const from = districtCoord[fromD];
    const to = districtCoord[toD];
    const fallback = viaWaypoints ? [from, ...viaWaypoints, to] : [from, to];

    // OSRM supports routing through multiple waypoints in one call - passing
    // our via-waypoints keeps the 3 parallel Guwahati-Itanagar roads visually
    // distinct even with real road geometry.
    geometry[name] = await osrm.getRoadGeometry(from, to, viaWaypoints) || fallback;
  }
  return geometry;
}

function seed(roadGeometry) {
  transaction(() => {
    clearAll();

    // --- States --------------------------------------------------------
    const insState = db.prepare('INSERT INTO states (name, code) VALUES (?, ?)');
    const states = {
      AS: insState.run('Assam', 'AS').lastInsertRowid,
      AR: insState.run('Arunachal Pradesh', 'AR').lastInsertRowid,
      MN: insState.run('Manipur', 'MN').lastInsertRowid,
      ML: insState.run('Meghalaya', 'ML').lastInsertRowid,
      MZ: insState.run('Mizoram', 'MZ').lastInsertRowid,
      NL: insState.run('Nagaland', 'NL').lastInsertRowid,
      SK: insState.run('Sikkim', 'SK').lastInsertRowid,
      TR: insState.run('Tripura', 'TR').lastInsertRowid
    };

    // --- Districts -------------------------------------------------------
    const insDistrict = db.prepare(
      'INSERT INTO districts (state_id, name, headquarters, lat, lng) VALUES (?, ?, ?, ?, ?)'
    );
    const D = {}; // name -> id
    for (const [stateCode, name, hq, lat, lng] of districtDefs) {
      D[name] = insDistrict.run(states[stateCode], name, hq, lat, lng).lastInsertRowid;
    }

    // --- Roads (a connected graph hubbed at Guwahati, the NER gateway) ---
    const insRoad = db.prepare(`
      INSERT INTO roads (name, state_id, from_district_id, to_district_id, length_km,
        terrain_slope_deg, road_condition, status, landslide_history_count, coordinates_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const coordOf = (name) => districtCoord[name];
    const R = {}; // name -> id
    for (const [name, stateCode, fromD, toD, km, slope, cond, status, landslides] of roadDefs) {
      R[name] = insRoad.run(
        name, states[stateCode], D[fromD], D[toD], km, slope, cond, status, landslides,
        JSON.stringify(roadGeometry[name])
      ).lastInsertRowid;
    }

    // --- Bridges ----------------------------------------------------------
    const insBridge = db.prepare('INSERT INTO bridges (road_id, name, condition, status, lat, lng) VALUES (?,?,?,?,?,?)');
    insBridge.run(R['NH-415 Mountain Shortcut (Guwahati-Itanagar)'], 'Kameng River Bridge', 'poor', 'yellow', 27.0, 92.3);
    insBridge.run(R['NH-2 (Dimapur-Imphal)'], 'Barak River Bridge', 'fair', 'green', 25.3, 94.0);
    insBridge.run(R['SH-3 (Agartala-Dhalai)'], 'Gomati Bridge', 'good', 'green', 23.87, 91.6);

    // --- Locations ---------------------------------------------------------
    const insLoc = db.prepare('INSERT INTO locations (type, name, district_id, lat, lng) VALUES (?,?,?,?,?)');
    const L = {};
    const locDefs = [
      ['transport_hub', 'Guwahati Logistics Hub', 'Kamrup Metropolitan', 26.15, 91.74],
      ['hospital', 'Itanagar District Hospital', 'Papum Pare', 27.09, 93.61],
      ['warehouse', 'Shillong Central Warehouse', 'East Khasi Hills', 25.58, 91.90],
      ['relief_center', 'Kohima Relief Center', 'Kohima', 25.68, 94.11],
      ['hospital', 'Imphal District Hospital', 'Imphal West', 24.82, 93.94],
      ['warehouse', 'Aizawl Warehouse', 'Aizawl', 23.73, 92.72],
      ['relief_center', 'Agartala Relief Center', 'West Tripura', 23.84, 91.29],
      ['hospital', 'Gangtok District Hospital', 'East Sikkim', 27.34, 88.61],
      ['transport_hub', 'Dimapur Transport Hub', 'Dimapur', 25.91, 93.73],
      ['warehouse', 'Dibrugarh Warehouse', 'Dibrugarh', 27.47, 94.91]
    ];
    for (const [type, name, distName, lat, lng] of locDefs) {
      L[name] = insLoc.run(type, name, D[distName], lat, lng).lastInsertRowid;
    }

    // --- Users (one per role; demo password for all: Demo@1234) ---------
    const insUser = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, language, district_id) VALUES (?,?,?,?,?,?)'
    );
    const passwordHash = bcrypt.hashSync('Demo@1234', 10);
    const U = {};
    U.admin = insUser.run('System Admin', 'admin@sih.gov.in', passwordHash, 'admin', 'en', null).lastInsertRowid;
    U.authority = insUser.run('Rina Hazarika', 'authority@sih.gov.in', passwordHash, 'authority_officer', 'en', D['Kamrup Metropolitan']).lastInsertRowid;
    U.manager = insUser.run('Wangchuk Bhutia', 'manager@sih.gov.in', passwordHash, 'logistics_manager', 'en', D['Kamrup Metropolitan']).lastInsertRowid;
    U.field = insUser.run('Tenzin Norbu', 'field@sih.gov.in', passwordHash, 'field_officer', 'en', D['Papum Pare']).lastInsertRowid;
    U.driver1 = insUser.run('Anil Bora', 'driver1@sih.gov.in', passwordHash, 'driver', 'hi', D['Kamrup Metropolitan']).lastInsertRowid;
    U.viewer = insUser.run('Analyst Viewer', 'viewer@sih.gov.in', passwordHash, 'viewer', 'en', null).lastInsertRowid;

    // --- Drivers ------------------------------------------------------
    const insDriver = db.prepare('INSERT INTO drivers (name, phone, license_no, user_id) VALUES (?,?,?,?)');
    const Dr = {};
    Dr.d1 = insDriver.run('Anil Bora', '9864000001', 'AS0120230001', U.driver1).lastInsertRowid;
    Dr.d2 = insDriver.run('Biju Thomas', '9864000002', 'AS0120230002', null).lastInsertRowid;
    Dr.d3 = insDriver.run('Chingkheinganba Singh', '9864000003', 'MN0120230003', null).lastInsertRowid;
    Dr.d4 = insDriver.run('David Lalrinawma', '9864000004', 'MZ0120230004', null).lastInsertRowid;
    Dr.d5 = insDriver.run('Esha Debbarma', '9864000005', 'TR0120230005', null).lastInsertRowid;

    // --- Vehicles -------------------------------------------------------
    const insVehicle = db.prepare(`
      INSERT INTO vehicles (number, driver_id, status, lat, lng, speed_kmh, destination_location_id)
      VALUES (?,?,?,?,?,?,?)
    `);
    const V = {};
    V.v1 = insVehicle.run('AS-01-AB-1001', Dr.d1, 'not_started', 26.1445, 91.7362, 0, L['Itanagar District Hospital']).lastInsertRowid;
    V.v2 = insVehicle.run('AS-01-AB-1002', Dr.d2, 'in_transit', 25.85, 91.80, 58, L['Shillong Central Warehouse']).lastInsertRowid;
    V.v3 = insVehicle.run('NL-04-CD-2003', Dr.d3, 'delayed', 25.75, 93.85, 22, L['Imphal District Hospital']).lastInsertRowid;
    V.v4 = insVehicle.run('AS-02-EF-3004', Dr.d4, 'delivered', 27.47, 94.91, 0, L['Dibrugarh Warehouse']).lastInsertRowid;
    V.v5 = insVehicle.run('TR-01-GH-4005', Dr.d5, 'in_transit', 24.5, 91.6, 46, L['Agartala Relief Center']).lastInsertRowid;

    // Vehicles seeded as already "in_transit" need a real assigned route
    // (not just a status label), otherwise the GPS simulator/manual Tick
    // button has nothing to advance them along.
    const insRoute = db.prepare(`
      INSERT INTO routes (origin_lat, origin_lng, dest_lat, dest_lng, road_ids_json, coordinates_json,
        distance_km, duration_minutes, risk_score, risk_level, status, explanation)
      VALUES (?,?,?,?,?,?,?,?,?,?,'recommended','Seed demo route')
    `);
    const guwahati = coordOf('Kamrup Metropolitan');
    const shillong = coordOf('East Khasi Hills');
    const agartala = coordOf('West Tripura');

    const route2 = insRoute.run(
      guwahati[1], guwahati[0], shillong[1], shillong[0],
      JSON.stringify([R['NH-6 (Guwahati-Shillong)']]), JSON.stringify(roadGeometry['NH-6 (Guwahati-Shillong)']),
      100, 100, 5, 'green'
    ).lastInsertRowid;
    db.prepare('UPDATE vehicles SET current_route_id = ?, route_progress = 0.5 WHERE id = ?').run(route2, V.v2);

    const route5 = insRoute.run(
      guwahati[1], guwahati[0], agartala[1], agartala[0],
      JSON.stringify([R['NH-8 (Guwahati-Agartala)']]), JSON.stringify(roadGeometry['NH-8 (Guwahati-Agartala)']),
      480, 480, 5, 'green'
    ).lastInsertRowid;
    db.prepare('UPDATE vehicles SET current_route_id = ?, route_progress = 0.7 WHERE id = ?').run(route5, V.v5);

    // --- Shipments --------------------------------------------------------
    const insShipment = db.prepare(`
      INSERT INTO shipments (shipment_code, cargo_type, cargo_quantity, priority, origin_location_id,
        destination_location_id, vehicle_id, expected_delivery_at, status, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    insShipment.run('SHIP-0001', 'medicine', '500 kg cold-chain medicine', 'critical',
      L['Guwahati Logistics Hub'], L['Itanagar District Hospital'], V.v1,
      new Date(Date.now() + 8 * 3600 * 1000).toISOString(), 'pending', U.manager);
    insShipment.run('SHIP-0002', 'food', '2 tonnes rice', 'high',
      L['Guwahati Logistics Hub'], L['Shillong Central Warehouse'], V.v2,
      new Date(Date.now() + 3 * 3600 * 1000).toISOString(), 'in_transit', U.manager);
    insShipment.run('SHIP-0003', 'construction_material', '1 tonne cement', 'medium',
      L['Dimapur Transport Hub'], L['Imphal District Hospital'], V.v3,
      new Date(Date.now() + 5 * 3600 * 1000).toISOString(), 'delayed', U.manager);
    insShipment.run('SHIP-0004', 'agricultural_produce', '3 tonnes produce', 'low',
      L['Guwahati Logistics Hub'], L['Dibrugarh Warehouse'], V.v4,
      new Date(Date.now() - 2 * 3600 * 1000).toISOString(), 'delivered', U.manager);
    insShipment.run('SHIP-0005', 'emergency_supplies', '800 kg relief kits', 'critical',
      L['Guwahati Logistics Hub'], L['Agartala Relief Center'], V.v5,
      new Date(Date.now() + 6 * 3600 * 1000).toISOString(), 'in_transit', U.manager);

    // --- Weather (current snapshot per district; Bomdila corridor is wet) --
    const insWeather = db.prepare(`
      INSERT INTO weather_records (district_id, rainfall_mm, condition, forecast_note, source)
      VALUES (?,?,?,?,?)
    `);
    const weatherDefs = [
      ['Kamrup Metropolitan', 8, 'clear', 'No significant rainfall expected in next 24h', 'mock'],
      ['Papum Pare', 46, 'heavy_rain', 'Heavy rainfall likely to continue for 6-12h', 'mock'],
      ['West Kameng', 52, 'heavy_rain', 'Landslide-prone slopes saturated', 'mock'],
      ['Dimapur', 12, 'light_rain', 'Clearing by evening', 'mock'],
      ['Kohima', 18, 'light_rain', 'Clearing by evening', 'mock'],
      ['Imphal West', 30, 'moderate_rain', 'Localized flooding possible', 'mock'],
      ['Churachandpur', 15, 'light_rain', '-', 'mock'],
      ['East Khasi Hills', 10, 'clear', '-', 'mock'],
      ['West Garo Hills', 20, 'light_rain', '-', 'mock'],
      ['Aizawl', 14, 'light_rain', '-', 'mock'],
      ['Lunglei', 22, 'moderate_rain', '-', 'mock'],
      ['West Tripura', 9, 'clear', '-', 'mock'],
      ['Dhalai', 11, 'clear', '-', 'mock'],
      ['East Sikkim', 6, 'clear', '-', 'mock'],
      ['South Sikkim', 7, 'clear', '-', 'mock'],
      ['Dibrugarh', 5, 'clear', '-', 'mock']
    ];
    for (const [distName, mm, cond, note, source] of weatherDefs) {
      insWeather.run(D[distName], mm, cond, note, source);
    }

    // --- Historical incidents (resolved; seeds bottleneck analytics) -----
    const insIncident = db.prepare(`
      INSERT INTO incidents (type, severity, road_id, lat, lng, description, reporter_id,
        source, verification_status, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
    insIncident.run('landslide', 'high', R['NH-415 Mountain Shortcut (Guwahati-Itanagar)'], 27.0, 92.3,
      'Historical: landslide after monsoon rain (resolved)', U.field, 'field_report', 'officially_verified', 'resolved', daysAgo(40));
    insIncident.run('landslide', 'critical', R['NH-415 Mountain Shortcut (Guwahati-Itanagar)'], 27.02, 92.35,
      'Historical: major landslide, 2-day closure (resolved)', U.field, 'field_report', 'officially_verified', 'resolved', daysAgo(120));
    insIncident.run('road_damage', 'medium', R['NH-13 (Itanagar-Bomdila)'], 27.18, 92.9,
      'Historical: road surface damage from heavy vehicles (resolved)', U.field, 'field_report', 'officially_verified', 'resolved', daysAgo(20));
    insIncident.run('flood', 'high', R['SH-3 (Agartala-Dhalai)'], 23.87, 91.6,
      'Historical: monsoon flooding near Gomati bridge (resolved)', U.field, 'field_report', 'officially_verified', 'resolved', daysAgo(60));
    insIncident.run('heavy_traffic', 'medium', R['NH-2 (Dimapur-Imphal)'], 25.3, 94.0,
      'Historical: recurring congestion near Barak bridge (resolved)', U.field, 'field_report', 'officially_verified', 'resolved', daysAgo(5));
    insIncident.run('heavy_traffic', 'medium', R['NH-2 (Dimapur-Imphal)'], 25.32, 93.95,
      'Historical: recurring congestion (resolved)', U.field, 'field_report', 'officially_verified', 'resolved', daysAgo(12));

    console.log('Seed complete:', {
      states: Object.keys(states).length,
      districts: districtDefs.length,
      roads: roadDefs.length,
      locations: locDefs.length,
      users: Object.keys(U).length,
      vehicles: Object.keys(V).length
    });
  });
}

console.log('Fetching real road-snapped geometry from OSRM (one-time, seed-only)...');
const roadGeometry = await fetchRoadGeometries();
seed(roadGeometry);
console.log('Demo login (all roles use password Demo@1234):');
console.log('  admin@sih.gov.in | authority@sih.gov.in | manager@sih.gov.in');
console.log('  field@sih.gov.in | driver1@sih.gov.in | viewer@sih.gov.in');
