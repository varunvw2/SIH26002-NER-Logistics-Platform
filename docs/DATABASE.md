# Database

## Engine: SQLite now, PostgreSQL + PostGIS later

This prototype uses **SQLite** via Node's built-in `node:sqlite` module (Node
22.5+; see [`backend/src/db/schema.sql`](../backend/src/db/schema.sql)) rather
than a native addon like `better-sqlite3` - this avoids requiring a C++
build toolchain (Visual Studio + Windows SDK on Windows) just to install
dependencies, at the cost of the module still being labeled "experimental" by
Node itself. Zero install beyond `npm install`, a single file
(`backend/data/sih.db`), synchronous queries (simpler code, no connection-pool
concerns for a hackathon demo). The spec's preferred stack is PostgreSQL +
PostGIS; that migration is deliberately kept low-effort:

- Every geometry is stored as plain `lat`/`lng` REAL columns or a
  `..._coordinates_json` TEXT column holding a `[[lng,lat], ...]` array — the
  same shape `ST_GeomFromGeoJSON()` expects, so `roads.coordinates_json` becomes
  `roads.geometry GEOMETRY(LineString, 4326)` via one conversion pass.
- All data access goes through plain SQL in `backend/src/routes/*` and
  `backend/src/services/*` — no SQLite-specific query builder — so swapping the
  driver (`better-sqlite3` → `pg`) and adjusting a handful of syntax differences
  (`datetime('now')` → `now()`, `json_each` → `jsonb_array_elements`) is the
  entire migration; no application logic changes.
- `docker-compose.yml` for Postgres+PostGIS from the earlier 10-hour build is
  still in the repo root as a starting point for that migration.

## Entity-relationship overview

```
states 1──* districts 1──* roads *──1 states
                 │              │
                 │              *── bridges
                 │
                 *── locations (warehouse/hospital/relief_center/transport_hub)
                 *── weather_records
                 *── users (district_id, nullable)

drivers 1──1 users (nullable)     roads 1──* incidents
   │                                  │
   *── vehicles ──* gps_positions     *── risk_predictions

vehicles *──1 locations (destination)     shipments *──1 locations (origin/dest)
vehicles 1──* shipments                   shipments *──1 routes
vehicles 1──1 routes (current_route_id)   routes *──1 shipments (audit trail)

incidents ──* incident photos (photo_path column, not a separate table -
              a hackathon-scale simplification: one photo per incident)
field_reports 1──1 incidents (the incident it produced)
sync_queue: idempotency ledger for offline field-report syncs (client_uuid)

alerts 1──* notifications *──1 users
audit_logs *──1 users
```

Full column-level detail is in `schema.sql` itself (it is the single source of
truth — this file only summarizes relationships and simplifications).

## Deliberate simplifications vs. the full spec entity list

- **Roles** are a `CHECK`-constrained column on `users`, not a separate
  `roles`/`user_roles` join table — six fixed roles, no dynamic role creation
  needed for this prototype.
- **Cargo** fields are columns on `shipments` (`cargo_type`, `cargo_quantity`)
  rather than a separate `cargo` table — a shipment always has exactly one
  cargo record in this system, so normalizing further added a join with no
  benefit.
- **RouteSegments** are folded into `routes.road_ids_json` (an ordered array of
  road IDs) instead of one row per segment — segments are never queried
  independently of their parent route.
- **Warehouses / Hospitals / Relief Centers / Transport Hubs** are one
  `locations` table with a `type` column, not four tables — they share every
  other column and are frequently queried together ("show all locations on
  the map").
- **IncidentPhotos** is a single `photo_path` column on `incidents` (one photo
  per report) instead of a child table, matching the hackathon-scale
  requirement ("allow field officers to upload **a** photograph").

## Migrations & seed data

```bash
npm run migrate   # applies schema.sql (idempotent - CREATE TABLE IF NOT EXISTS)
npm run seed      # wipes and reloads realistic demo data for all 8 NER states
npm run setup     # both, in order
```

Seed data is clearly a **demo dataset** (approximate real-world coordinates,
illustrative road conditions/history) — see the comment at the top of
`backend/src/db/seed.js`. It is not sourced from an official government
survey and the UI must never claim otherwise.

## Indexes

`schema.sql` creates indexes on every foreign-key-heavy lookup path actually
used by the API: district→state, road→state/status, incident→road/created_at,
gps_positions→vehicle+time, weather→district+time, alerts→created_at,
notifications→user+read_at, shipments→status, vehicles→status. In the
PostgreSQL migration, `roads`/`routes` geometry columns should additionally
get a `GIST` spatial index once they become real `GEOMETRY` columns.
