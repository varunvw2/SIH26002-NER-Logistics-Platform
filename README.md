# SIH26002 — NER Logistics Intelligence Platform

**AI-Based Smart Logistics and Accessibility Intelligence Platform for the North Eastern Region**,
built for MDoNER's problem statement SIH26002. A working prototype covering all 14 spec modules —
GIS map, rule-based risk engine, priority-weighted route optimization, GPS tracking (simulated),
incident reporting with AI-suggested classification/NLP extraction, alerts, offline-first field
reporting, emergency mode, district connectivity + bottleneck analytics, RBAC, and audit logging.

> **This is a hackathon prototype, not a production system.** Every place it substitutes a
> simplified/simulated component for what the full spec calls for is disclosed below, in
> `docs/`, and in the running app itself (badges like "Simulated / demo data" and
> "Platform-generated analytical metric").

## Quick start

```bash
# Terminal 1 - backend
cd backend
npm install
npm run setup    # creates SQLite schema + seeds 8-state demo dataset
npm run dev      # http://localhost:3000

# Terminal 2 - frontend
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Open **http://localhost:5173** and sign in with any seeded demo account (password `Demo@1234`
for all): `admin@sih.gov.in`, `authority@sih.gov.in`, `manager@sih.gov.in`, `field@sih.gov.in`,
`driver1@sih.gov.in`, `viewer@sih.gov.in` — each sees a different nav/permission set (RBAC).

Copy `backend/.env.example` → `backend/.env` if you want to change the port, JWT secret, or plug
in a real `OPENWEATHER_API_KEY` / `HUGGINGFACE_API_KEY` (both optional — see below).

## The demo scenario (MONITOR → PREDICT → RECOMMEND → ALERT → ADAPT)

1. Log in as `manager@sih.gov.in`, go to **Route Planner**, pick Kamrup Metropolitan (Guwahati) →
   Papum Pare (Itanagar), priority **Critical**, click **Calculate Routes**. Three real candidate
   roads exist between them — the engine picks the lowest-*risk* one for critical cargo even
   though it's not the shortest, and explains why.
2. Assign the recommended route to vehicle `AS-01-AB-1001` — it starts moving automatically
   (server-side simulation ticks every ~5s; **Vehicle Tracking** shows it live on the map).
3. Log in as `field@sih.gov.in` (or `authority@sih.gov.in`), go to **Incidents → Report Incident**,
   report a critical landslide on the road the vehicle is using. The road flips to red immediately,
   the risk engine recalculates, and authority/logistics-manager accounts get an alert.
4. Back in **Route Planner**, recalculate — the previously-blocked road now scores much worse and
   a different route is recommended. **Emergency Mode** shows the blocked road, the safest
   available alternatives, nearby hospitals/relief centers, and every active alert in one view.
5. Try **Field Reporting** as `field@sih.gov.in`: type "Bridge near village X is partially damaged
   because of flooding" — the NLP extractor returns `Bridge Damage / Flood / High / Pending
   Verification` automatically (matches the spec's own worked example). Turn off your network and
   submit again — it queues in IndexedDB and shows **OFFLINE**; reconnect and it syncs itself
   (top-bar status pill: ONLINE → SYNCING → SYNCED).

## What's real vs. simplified

| Area | This build | Full spec | Why |
|---|---|---|---|
| Database | SQLite (`node:sqlite`, built into Node) | PostgreSQL + PostGIS | Zero native-compilation install; see [docs/DATABASE.md](docs/DATABASE.md) for the migration path — the schema/queries are written to make it a small diff, not a rewrite |
| Risk & route scoring | Real rule-based engine (weighted factors, Dijkstra + k-alternatives over a real seeded road graph) | ML models (scikit-learn/XGBoost) | Spec explicitly allows/recommends "rule-based intelligence where ML is unnecessary" for a prototype with no labeled training data yet; genuinely computed, not hardcoded — change the inputs and the output changes |
| Weather | `MockWeatherProvider`, seeded then drifted by a background loop every ~30s (random walk, occasional larger swings) — risk scores and route rankings genuinely shift over time, not just in response to incidents | IMD / live feed | No public self-serve IMD API; an `OpenWeatherProvider` adapter exists and activates automatically (disabling the drift loop) if you set `OPENWEATHER_API_KEY` |
| GPS | Server-side simulation along real road polylines | Live phone/device GPS | Architecture supports it today — a phone just needs to `PATCH /api/vehicles/:id/gps`, same endpoint the simulator uses |
| AI image classification | `MockAIImageProvider` (deterministic per-photo, clearly labeled "AI Suggested", never "verified") | Trained vision model | A real `HuggingFaceImageProvider` adapter exists (activates with `HUGGINGFACE_API_KEY`) but maps a *generic* model's labels onto our taxonomy — no hazard-specific model is freely available |
| NLP field-report extraction | Keyword/rule-based heuristic | Trained NLP/LLM extractor | Same swappable-adapter pattern; heuristic is transparent and testable, matches the spec's own example exactly |
| Mobile app | Responsive PWA (installable, offline queue via IndexedDB + service worker) | Native / React Native app | Spec explicitly allows PWA "depending on development speed" |
| Roles | 6 fixed roles, `CHECK`-constrained column | Full dynamic role/permission system | No need for dynamic roles in a 6-role prototype |

Full detail: [docs/DATABASE.md](docs/DATABASE.md) (schema, ER overview, simplifications) and
[docs/API.md](docs/API.md) (every endpoint, roles required).

## Architecture

```
backend/
  src/
    db/                 schema.sql, migrate.js, seed.js
    providers/           adapters: weather/, ai/ (image + NLP), gps/ — each Mock-by-default,
                          real-by-config, per the spec's "modular ingestion + mock fallback" rule
    services/             riskEngine, routeOptimizer, etaPredictor, connectivityScore,
                           bottleneckAnalysis, alertEngine (bilingual), authService, vehicleSimulator
    middleware/            auth (JWT), roles (RBAC), validate (zod), errorHandler
    routes/                one file per resource group (auth, catalog, fleet, shipments,
                            incidents, weather, planning, alerts, analytics, emergency, admin)
    i18n/                  en.json / hi.json alert message templates
  tests/                  node:test — risk engine, ETA, NLP extraction, route optimizer
                          (16 tests, all passing: `npm test`)
frontend/
  src/
    pages/                 15 screens (Login, Dashboard, NER Map, Route Planner, Vehicle
                            Tracking, Shipments, Incidents, Field Reporting, Alerts,
                            Emergency Mode, District Analytics, Bottleneck Analytics,
                            Weather/Risk, Administration, Profile)
    components/            MapView (shared Leaflet + real OpenStreetMap tiles wrapper), Layout, Badge, StatCard
    context/                AuthContext (JWT + language), SyncContext (offline queue status)
    offline/                IndexedDB queue + sync (Module 14)
    i18n/                   UI chrome strings (en/hi)
  public/sw.js            offline app-shell caching (Module 14)
docs/
  DATABASE.md             ER overview, schema simplifications, Postgres migration path
  API.md                  full endpoint reference
```

Everything is a **modular monolith**, per the spec's own guidance ("a modular monolith is
preferable to unnecessary microservices unless there is a strong reason") — provider adapters
give the modularity that actually matters (swap a data source without touching business logic)
without the operational overhead of separate services for a ~16-node demo graph.

## Testing

```bash
cd backend && npm test
```
16 tests covering the risk engine, ETA/delay prediction, NLP extraction, and the route optimizer
(including a synthetic-graph test proving cargo priority actually changes which route wins, not
just cosmetically).

## Security

JWT auth + bcrypt password hashing, role-based route guards on every write endpoint, zod input
validation, `helmet`, rate limiting (general API + a stricter one on `/auth/*`), upload
allowlisting (JPEG/PNG/WebP, 8MB cap, randomized filenames), audit log on sensitive actions, no
API keys in frontend code (`.env.example` provided, real `.env` files are never committed).

## Known limitations (disclosed, not hidden)

- SQLite is single-writer; fine for a demo, not for concurrent production load.
- The road graph is a small, deliberately curated demo network (17 roads, 16 districts) — not
  full OSM/Bhuvan coverage. The data-ingestion layer (`src/providers/`) is where a real OSM/Bhuvan
  adapter would plug in.
- Weather, GPS and AI-vision data are simulated by default and labeled as such in the UI; nothing
  claims to be live government data.
