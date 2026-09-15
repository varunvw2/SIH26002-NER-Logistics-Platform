# API Reference

Base URL: `http://localhost:3000/api` (configurable via `frontend/.env.local`'s
`VITE_API_URL`). Every endpoint except `/auth/register` and `/auth/login`
requires `Authorization: Bearer <JWT>` (obtained from login). Role
restrictions are enforced server-side (`requireRole(...)` in each route file)
— the table below lists them where they exist.

## Auth
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | Self-registration limited to `field_officer`/`driver`/`viewer` |
| POST | `/auth/login` | public | Returns `{ token, user }` |
| GET | `/auth/me` | any | Current user from the JWT |

## Catalog / GIS (Module 1)
| Method | Path | Roles |
|---|---|---|
| GET | `/states`, `/districts`, `/districts/:id` | any |
| GET | `/roads` (filters: `state_id`, `status`, `risk_level`) | any — risk is computed live on every call |
| GET | `/roads/:id` | any |
| PATCH | `/roads/:id/status` | any (tighten in production) |
| GET | `/bridges`, `/locations` (filter: `type`, `district_id`) | any |

## Fleet / GPS (Module 5)
| Method | Path | Roles |
|---|---|---|
| GET | `/vehicles` (filter `status`), `/vehicles/:id`, `/drivers` | any |
| PATCH | `/vehicles/:id/gps` | driver, logistics_manager, admin |
| POST | `/vehicles/:id/simulate-tick` | any (also runs automatically every 5s server-side) |
| POST | `/vehicles/:id/assign-route` | logistics_manager, admin |

## Shipments (Module 9)
| Method | Path | Roles |
|---|---|---|
| GET | `/shipments` (filters `status`,`priority`,`cargo_type`), `/shipments/:id` | any |
| POST | `/shipments` | logistics_manager, admin |
| PATCH | `/shipments/:id/status` | logistics_manager, admin, driver |

## Incidents & Field Reports (Modules 6, 7, 14)
| Method | Path | Roles |
|---|---|---|
| GET | `/incidents` (filters `type`,`severity`,`road_id`,`status`) | any |
| POST | `/incidents` (multipart, optional `photo`) | field_officer, authority_officer, admin |
| GET | `/incidents/:id/photo` | any |
| PATCH | `/incidents/:id/verify` | authority_officer, admin |
| POST | `/field-reports` (single, online) | field_officer, authority_officer, admin |
| POST | `/field-reports/sync` (batch, idempotent by `client_uuid`) | field_officer, authority_officer, admin |

## Weather (adapter-backed)
| Method | Path |
|---|---|
| GET | `/weather`, `/weather/districts/:id` |

## Planning (Modules 2, 3, 4)
| Method | Path | Notes |
|---|---|---|
| POST | `/routes/optimize` `{origin_district_id, dest_district_id, priority, shipment_id?}` | Returns recommended + alternative(s), persists them |
| GET | `/routes/:id` | |
| GET | `/risk/predictions` | Forward-looking, non-confirmed wording only |

## Alerts (Module 8)
| Method | Path |
|---|---|
| GET | `/alerts` (filters `severity`, `target_role`) |
| GET | `/notifications` (`?unread=true`) |
| PATCH | `/notifications/:id/read` |

## Analytics (Modules 11, 12, 13)
| Method | Path |
|---|---|
| GET | `/analytics/kpis` |
| GET | `/analytics/district-connectivity` |
| GET | `/analytics/bottlenecks?limit=10` |
| GET | `/analytics/incident-trend` |

## Emergency Mode (Module 10)
| Method | Path |
|---|---|
| GET | `/emergency/state` |

## Admin
| Method | Path | Roles |
|---|---|---|
| GET | `/admin/users`, POST `/admin/users`, PATCH `/admin/users/:id/role` | admin |
| GET | `/admin/audit-logs` | admin |

## Error shape
```json
{ "error": "human-readable message", "details": { "...zod flatten output, validation errors only" } }
```

## Rate limiting
General API: 300 req/min per IP. Auth endpoints (`/auth/login`, `/auth/register`): 30 req/15min per IP.
