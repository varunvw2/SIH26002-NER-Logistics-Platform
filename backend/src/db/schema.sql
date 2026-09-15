-- SIH26002 schema (SQLite for the hackathon prototype).
--
-- GIS note: PostGIS GEOMETRY types are represented here as plain
-- latitude/longitude REAL columns plus JSON-encoded coordinate arrays
-- (e.g. roads.coordinates_json = '[[lng,lat],[lng,lat],...]'). The column
-- names and shapes were chosen so a future migration to PostgreSQL+PostGIS
-- can convert coordinates_json -> ST_GeomFromGeoJSON(...) directly.
-- See docs/DATABASE.md.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','authority_officer','logistics_manager','field_officer','driver','viewer')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi')),
  district_id INTEGER REFERENCES districts(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state_id INTEGER NOT NULL REFERENCES states(id),
  name TEXT NOT NULL,
  headquarters TEXT,
  lat REAL,
  lng REAL,
  connectivity_score REAL,
  connectivity_updated_at TEXT
);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  license_no TEXT,
  user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS roads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  state_id INTEGER REFERENCES states(id),
  from_district_id INTEGER REFERENCES districts(id),
  to_district_id INTEGER REFERENCES districts(id),
  length_km REAL NOT NULL,
  terrain_slope_deg REAL DEFAULT 0,
  road_condition TEXT NOT NULL DEFAULT 'good' CHECK (road_condition IN ('good','fair','poor')),
  status TEXT NOT NULL DEFAULT 'green' CHECK (status IN ('green','yellow','orange','red')),
  landslide_history_count INTEGER NOT NULL DEFAULT 0,
  coordinates_json TEXT NOT NULL,
  last_incident_at TEXT
);

CREATE TABLE IF NOT EXISTS bridges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  road_id INTEGER REFERENCES roads(id),
  name TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good','fair','poor')),
  status TEXT NOT NULL DEFAULT 'green' CHECK (status IN ('green','yellow','orange','red')),
  lat REAL,
  lng REAL
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('warehouse','hospital','relief_center','transport_hub')),
  name TEXT NOT NULL,
  district_id INTEGER REFERENCES districts(id),
  lat REAL NOT NULL,
  lng REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  driver_id INTEGER REFERENCES drivers(id),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_transit','delayed','rerouted','delivered','emergency')),
  lat REAL,
  lng REAL,
  speed_kmh REAL DEFAULT 0,
  destination_location_id INTEGER REFERENCES locations(id),
  current_route_id INTEGER REFERENCES routes(id),
  route_progress REAL NOT NULL DEFAULT 0,
  eta TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER REFERENCES shipments(id),
  origin_lat REAL, origin_lng REAL,
  dest_lat REAL, dest_lng REAL,
  road_ids_json TEXT NOT NULL DEFAULT '[]',
  coordinates_json TEXT NOT NULL DEFAULT '[]',
  distance_km REAL,
  duration_minutes REAL,
  risk_score INTEGER,
  risk_level TEXT CHECK (risk_level IN ('green','yellow','orange','red')),
  status TEXT CHECK (status IN ('recommended','alternative','emergency')),
  explanation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_code TEXT NOT NULL UNIQUE,
  cargo_type TEXT NOT NULL CHECK (cargo_type IN ('medicine','food','agricultural_produce','construction_material','emergency_supplies','other')),
  cargo_quantity TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  origin_location_id INTEGER REFERENCES locations(id),
  destination_location_id INTEGER REFERENCES locations(id),
  vehicle_id INTEGER REFERENCES vehicles(id),
  route_id INTEGER REFERENCES routes(id),
  expected_delivery_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_transit','delayed','rerouted','delivered','cancelled')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('landslide','flood','road_blocked','bridge_damaged','accident','heavy_traffic','road_damage','weather_hazard','other')),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  road_id INTEGER REFERENCES roads(id),
  bridge_id INTEGER REFERENCES bridges(id),
  lat REAL, lng REAL,
  description TEXT,
  photo_path TEXT,
  ai_classification_json TEXT,
  reporter_id INTEGER REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'field_report' CHECK (source IN ('field_report','ai_suggested','system')),
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('ai_suggested','officially_verified','pending','rejected')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS field_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_uuid TEXT NOT NULL UNIQUE,
  reporter_id INTEGER REFERENCES users(id),
  incident_id INTEGER REFERENCES incidents(id),
  raw_text TEXT,
  extracted_json TEXT,
  created_offline_at TEXT,
  synced_at TEXT,
  status TEXT NOT NULL DEFAULT 'synced' CHECK (status IN ('synced','failed'))
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_uuid TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS weather_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id INTEGER REFERENCES districts(id),
  rainfall_mm REAL NOT NULL DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'clear',
  forecast_note TEXT,
  source TEXT NOT NULL DEFAULT 'mock' CHECK (source IN ('mock','openweather','imd')),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS risk_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  road_id INTEGER REFERENCES roads(id),
  risk_score INTEGER NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('green','yellow','orange','red')),
  disruption_probability REAL,
  factors_json TEXT NOT NULL DEFAULT '[]',
  predicted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gps_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER REFERENCES vehicles(id),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  speed_kmh REAL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  message_en TEXT NOT NULL,
  message_hi TEXT,
  target_role TEXT,
  target_district_id INTEGER REFERENCES districts(id),
  road_id INTEGER REFERENCES roads(id),
  vehicle_id INTEGER REFERENCES vehicles(id),
  is_prediction INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL REFERENCES alerts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_districts_state ON districts(state_id);
CREATE INDEX IF NOT EXISTS idx_roads_state ON roads(state_id);
CREATE INDEX IF NOT EXISTS idx_roads_status ON roads(status);
CREATE INDEX IF NOT EXISTS idx_incidents_road ON incidents(road_id);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_gps_vehicle ON gps_positions(vehicle_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_weather_district ON weather_records(district_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
