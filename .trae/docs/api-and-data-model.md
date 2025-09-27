# API and Data Model

## Entities

- Server: id, name, type (fabric|spigot|paper|bukkit), mc_version, build_id, status, created_at, updated_at, owner_id
- ServerSettings: env, ports, resource_limits, rcon_enabled, rcon_port
- Metrics: server_id, ts, cpu, mem, tps, players, custom
- Logs: server_id, ts, level, message, source

## Key Endpoints (Server-side)

- POST /servers (create) -> resolves version and provisions container
- GET /servers, GET /servers/:id
- PATCH /servers/:id (update safe fields)
- DELETE /servers/:id (delete with optional volume retention)
- POST /servers/:id/start|stop|restart
- GET /servers/:id/logs (tail/stream; server-side filtering)
- GET /servers/:id/files (list)
- GET /servers/:id/files/content (read-only; sized)
- GET /servers/:id/metrics (container + MC)
- POST /users/:id/allow (admin-only toggles IsAllowed)

## Authorization

- All endpoints require is_allowed = true.
- Ownership checks for server resources unless admin.

## Additional Endpoints

### Logs

- GET /logs/:serverId — fetch database-backed logs, supports limit and level filters
- GET /logs/:serverId/live — fetch recent live container logs
- GET /logs/:serverId/stream — Server-Sent Events stream of live logs
- GET /logs/:serverId/files — list log files within the server's logs directory
- GET /logs/:serverId/files/:filename — read a specific log file (validated filename)
- GET /logs/:serverId/files/:filename/download — download a log file
- DELETE /logs/:serverId/files/:filename — delete a log file
- DELETE /logs/:serverId — clear database logs and filesystem log files for the server

### Files

- GET /files/:serverId?dir= — list files/directories under a scoped path
- GET /files/:serverId/content?path=&lines= — read a file safely (size/extension checks)
- PUT /files/:serverId/content — update allowed configuration files
- POST /files/:serverId/upload — upload a file (size/type restricted)
- GET /files/:serverId/download?path= — download a file via secure path resolution
- DELETE /files/:serverId/file?path= — delete a file (protect critical files)
- POST /files/:serverId/directory — create a directory
- GET /files/:serverId/properties — read server.properties into a key-value map
- PUT /files/:serverId/properties — write server.properties from provided key-value map

### Metrics

- GET /metrics/:serverId/current — current metrics snapshot
- GET /metrics/:serverId/history?hours=&interval= — historical metrics
- GET /metrics/:serverId/aggregated?period= — aggregated metrics (day/week/month)
- POST /metrics/:serverId/start — start monitoring for a server
- POST /metrics/:serverId/stop — stop monitoring for a server
- GET /metrics/all/current — current metrics for all visible servers
- GET /metrics/system/overview — admin-only system overview and resource averages

### Prometheus Integration

- GET /prometheus/:serverId/metrics — public Prometheus exposition (text/plain; version 0.0.4)
- GET /prometheus/:serverId/endpoint — authenticated metrics endpoint configuration (owner/admin)
- POST /prometheus/:serverId/validate-config — validate monitoring configuration (owner/admin)
- GET /prometheus/:serverId/recommended-config — recommended default monitoring configuration (owner/admin)
- GET /metrics/:serverId/prometheus/metrics — fetch internal metrics derived from Prometheus for a server (auth)
- GET /metrics/:serverId/prometheus/raw — fetch raw Prometheus metrics scrape for a server (auth)
- GET /metrics/prometheus/targets — list configured Prometheus targets (auth)
- GET /metrics/:serverId/prometheus/health — health check of a server's Prometheus endpoint (auth)
- GET /metrics/:serverId/prometheus/alerts — active metric alerts for a server (auth)
- POST /metrics/alerts/:alertId/resolve — resolve a specific alert (auth)

### Machines

- GET /machines/ — list machines for logged-in user
- POST /machines/ — create a machine for the user
- GET /machines/:id — get a machine by id
- GET /machines/:id/servers — list servers attached to a machine

## Authorization Notes

- All endpoints (except the public Prometheus exposition endpoint) require JWT authentication and is_allowed gating.
- Server-scoped actions enforce ownership checks: the requester must be the server owner or an admin.
- Admin-only endpoints are explicitly called out; role checks are enforced server-side.

## Data Persistence & Models (extended)

- Prometheus targets and monitoring configuration are managed server-side and persisted via DatabaseService.
- Metric alerts are created and resolved based on monitoring thresholds and stored for visibility.
