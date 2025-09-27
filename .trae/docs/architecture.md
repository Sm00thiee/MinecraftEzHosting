# Architecture Overview

## Components

- Web Dashboard (UI): Create/manage servers, view logs, metrics, and file browser.
- API Service: Orchestrates Docker lifecycle, brokers file/log access, exposes metrics APIs, and enforces authorization.
- Supabase (Auth + Postgres): Google-only auth; DB stores users, IsAllowed, servers, metrics, and audit logs.
- Docker Host: Runs one container per Minecraft server; volumes for persistent worlds and configs.
- Version Resolver: Fetches latest supported versions/builds for each server type at runtime (no hardcoded lists).
- Monitoring Subsystem:
  - Container metrics via Docker API/exporters.
  - Minecraft metrics via a lightweight plugin/mod agent (for supported types) and/or RCON/query.
- File/Log Access Layer: Read-only, path-confined access to each server directory and container logs.

## High-Level Flows

1. Authentication & Access Gating

- User logs in with Google via Supabase.
- API checks DB IsAllowed = true; if false, deny access and log audit event.

2. Create Server

- User selects type (fabric/spigot/paper/bukkit) and optionally target MC version or “latest”.
- Version Resolver determines the precise upstream version/build at request time.
- API provisions: persistent volume, container name, ports, env, resource limits; then starts container.
- Initial health checks and server bootstrap complete; status recorded.

3. Manage Server

- Start/stop/restart; update env; backup/restore; safe delete (with volume retention option).

4. Monitoring & Logs

- API collects/scrapes Docker/container metrics.
- If plugin/mod is installed, API pulls Minecraft metrics; otherwise, fall back to query/RCON where possible.
- Logs are tailed via Docker logs and/or filesystem log files; exposed read-only with strict scoping.

## Security Boundaries

- Frontend has zero trust; all actions authorized server-side.
- API runs with least-privilege Docker access; containers run as non-root where possible.
- File access is restricted to a per-server root; symlinks and path traversal are denied.
- Database uses RLS/policies to ensure users must have IsAllowed and appropriate ownership/roles.

## Performance & Reliability

- Resource quotas per container (CPU/memory) to prevent noisy-neighbor.
- Backpressure and rate limiting on metrics/log streaming.
- Idempotent operations and retries for Docker actions.

## Backend Services Implementation

This section documents the primary backend services: responsibilities, key methods, dependencies, I/O, and interactions.

### Database Service

- File: <mcfile name="database.ts" path="api/services/database.ts"></mcfile>
- Responsibilities:
  - Central data access layer for Supabase/Postgres: users, servers, settings, metrics, logs, audit logs, Prometheus targets, metric alerts, and monitoring configs.
- Key Operations (selected):
  - Users: get by ID/email, update IsAllowed, list all.
  - Servers: create, get by id/owner/all, update, delete.
  - ServerSettings: create, update.
  - Metrics: insert metrics, fetch latest and historical metrics per server.
  - Logs: insert log entries, fetch server logs with optional level filtering.
  - Audit Logs: insert audit events, list recent audits.
  - Prometheus Targets: create/upsert/deactivate/get/list, update last scrape timestamp.
  - Monitoring Config: get/update per server.
- Dependencies: Supabase Admin client.
- I/O:
  - Input: typed request payloads (CreateServerRequest, UpdateServerRequest, Metrics, Log, etc.).
  - Output: typed records or booleans; errors logged server-side.
- Interactions:
  - Called by Docker, Monitoring, Prometheus services, routes, and FileAccess for persistence and authorization checks.

### Docker Service

- File: <mcfile name="docker.ts" path="api/services/docker.ts"></mcfile>
- Responsibilities:
  - Full lifecycle management of Minecraft server containers, volumes, and ports.
- Key Operations:
  - ensureDockerImage: builds custom image mc-server-management:latest from Dockerfile.minecraft if missing.
  - createServer: create a dedicated volume, allocate ports (game/RCON/query), set env, resource limits, labels; persist container info and ports.
  - startServer/stopServer/restartServer: control container state with status updates and post-start checks.
  - getContainerInfo/getContainerLogs: inspect container metadata and fetch recent logs.
  - Prometheus exporter management: install/remove/check/update exporter configuration inside the server container.
- Dependencies: dockerode, filesystem for image context, DatabaseService for persistence.
- I/O:
  - Input: Server and settings from DB.
  - Output: boolean success, updated server records, logs text.
- Interactions:
  - Persists container_id and port allocations via DatabaseService.
  - Coordinates with Monitoring/Prometheus by installing exporters, exposing metrics ports.

### File Access Service

- File: <mcfile name="file-access.ts" path="api/services/file-access.ts"></mcfile>
- Responsibilities:
  - Secure, scoped file operations within per-server directories.
- Key Operations:
  - validatePath: normalize and prevent traversal; enforce forbidden paths.
  - checkServerAccess: ownership/admin role checks via DatabaseService.
  - listFiles: enumerate directories/files with metadata and readability criteria.
  - readFile: gate by extension and size; return content + metadata.
  - writeFile: restrict to known config files; create path; write contents; audit log the operation.
  - deleteFile: restrict deletions via regex patterns to non-core assets.
  - getFileInfo: file/directory metadata plus computed permissions (readable/writable/deletable).
- Dependencies: fs/promises, path, DatabaseService.
- I/O:
  - Input: serverId, relativePath, userId, userRole.
  - Output: metadata-rich listings or content; throws on access violations.
- Interactions:
  - Emits audit logs via DatabaseService for write operations.

### RCON Service

- File: <mcfile name="rcon.ts" path="api/services/rcon.ts"></mcfile>
- Responsibilities:
  - Manage RCON connectivity and execute commands to retrieve server-side metrics.
- Key Operations:
  - connect/disconnect: establish and tear down RCON connections.
  - execute: send arbitrary RCON commands and return responses.
  - Metrics helpers: player count, TPS, memory usage, world/entity info (subject to server type/plugin support).
- Dependencies: RCON protocol implementation.
- I/O:
  - Input: host/port/password, command strings.
  - Output: parsed values or raw responses; errors handled and surfaced to monitoring.
- Interactions:
  - Used by Monitoring service for Minecraft-specific metrics collection.

### Version Resolver Service

- File: <mcfile name="version-resolver.ts" path="api/services/version-resolver.ts"></mcfile>
- Responsibilities:
  - Resolve supported Minecraft versions/builds per server type from upstream APIs with caching.
- Key Operations:
  - getAvailableVersions(type): fetch lists from Mojang/Paper/Fabric/Spigot.
  - getLatest/getRecommended: compute latest/recommended per type.
  - resolveVersion: normalize user-provided version spec to a concrete upstream build.
  - Cache management and sensible fallbacks when upstream is unavailable.
- Dependencies: HTTP clients to upstream APIs; internal cache store.
- I/O:
  - Input: type and optional version preferences.
  - Output: normalized version identifiers and lists usable by Docker provisioning.
- Interactions:
  - Called from server routes during creation/update to determine container env.

### Monitoring Service

- File: <mcfile name="monitoring.ts" path="api/services/monitoring.ts"></mcfile>
- Responsibilities:
  - Periodic metrics collection (cron ~30s) and orchestration across running servers.
- Key Operations:
  - start/stop monitoring: begin/terminate scheduler; stop per-server including RCON cleanup.
  - collectAllServers/collectServer: gather container stats (CPU/mem/disk/net) and Minecraft metrics via RCON/log parsing.
  - getCurrentMetrics: fetch latest metrics from DB for a server.
  - Integrate with Prometheus targets: create/update active targets and health markers.
- Dependencies: DatabaseService, Docker API, RconService, timers/cron.
- I/O:
  - Input: server IDs and configuration.
  - Output: persisted Metrics records and logs; updates to Prometheus targets.
- Interactions:
  - Feeds Prometheus exporter and Prometheus scraping by ensuring target presence.

### Prometheus Exporter Service

- File: <mcfile name="prometheus-exporter.ts" path="api/services/prometheus-exporter.ts"></mcfile>
- Responsibilities:
  - Define and format Prometheus metrics for servers (status, players, performance, memory, world, container, RCON).
- Key Operations:
  - generateMetricsForServer: emit Prometheus text format with labels (server_id, owner_id, type) and timestamps.
  - endpoint helpers: expose consistent metric endpoints and conventions.
  - validate/recommend configuration: port, scrape interval, labels.
- Dependencies: Prometheus metrics model; server metrics data.
- I/O:
  - Input: collected metrics snapshot.
  - Output: Prometheus-compatible text exposition.
- Interactions:
  - Consumed by Prometheus scraping service and external Prometheus instances.

### Prometheus Scraping/Processing Service

- File: <mcfile name="prometheus.ts" path="api/services/prometheus.ts"></mcfile>
- Responsibilities:
  - Scrape active exporter targets; parse, filter, and transform metrics into internal formats.
- Key Operations:
  - scrapeWithRetry/scrapeAllTargets/scrapeServer: resilient HTTP scraping with retry and per-server orchestration.
  - parseRawMetrics: parse Prometheus text into structured metrics.
  - filterByName/getByType/aggregateByName: querying and aggregations.
  - toInternalFormat: convert Prometheus samples into internal Metrics schema for storage.
- Dependencies: HTTP client, DatabaseService for target discovery, metrics parsers.
- I/O:
  - Input: target endpoints and patterns.
  - Output: structured metrics, persisted via DatabaseService or returned to routes.
- Interactions:
  - Works alongside Monitoring and Exporter services to complete the observability pipeline.

## Service Interaction & Data Flow (Overview)

- Server Provisioning:
  - Routes -> Version Resolver -> Docker Service -> DatabaseService (persist) -> Monitoring service registers target.
- Metrics Pipeline:
  - Monitoring Service collects container + Minecraft metrics -> DatabaseService persists -> Prometheus Exporter exposes metrics -> Prometheus Scraper ingests/normalizes.
- File/Log Access:
  - FileAccess enforces scoped reads/writes/deletes -> Audit logs via DatabaseService.
- Authorization:
  - All service operations gate by ownership/admin roles when reading/writing sensitive resources.

## Frontend Architecture

This section documents the client-side structure of the application, including libraries, contexts, hooks, UI primitives, higher-level components, and pages, and how they collaborate to deliver server management, monitoring, and authentication flows.

### Libraries

- supabase client and shared types (<mcfile name="supabase.ts" path="src/lib/supabase.ts"></mcfile>)
  - Responsibilities: initialize Supabase client for auth and data access; define TypeScript interfaces (User, Server, ServerSettings, Metrics, LogEntry, AuditLog) used across the frontend for strong typing.
  - Dependencies: @supabase/supabase-js; uses browser fetch for app APIs when needed.
  - I/O: reads/writes auth session via Supabase; types shape interactions with backend REST APIs under /api/\*.

- utility helpers (<mcfile name="utils.ts" path="src/lib/utils.ts"></mcfile>)
  - Responsibilities: `cn` helper to compose Tailwind classNames with `clsx` and `tailwind-merge` for predictable style override semantics.
  - Dependencies: clsx, tailwind-merge.
  - I/O: pure function, no side effects.

### Contexts

- authentication context provider (<mcfile name="AuthContext.tsx" path="src/contexts/AuthContext.tsx"></mcfile>)
  - Responsibilities: expose `user`, `session`, and `loading` state, and auth actions `signInWithGoogle`, `signOut`, `refreshUser` to the app.
  - Dependencies: Supabase client; app API `/api/auth/me` for enriching user profile and authorization flags; React state/effects.
  - I/O: performs network calls to Supabase and app API; stores runtime session in memory; drives route protection and conditional UI.
  - Interactions: consumed by route protection and pages to gate access and include Bearer token in API requests.

### Hooks

- theme management hook (<mcfile name="useTheme.ts" path="src/hooks/useTheme.ts"></mcfile>)
  - Responsibilities: toggle dark/light theme; persist preference in localStorage; apply to `document.documentElement` class for Tailwind `dark:` styles.
  - Dependencies: browser DOM APIs, localStorage.
  - I/O: reads/writes `theme` key; side-effect on document class list.

### UI Primitives

Reusable components under <mcfolder name="ui" path="src/components/ui"></mcfolder> provide consistent styling and accessibility:

- Button (<mcfile name="button.tsx" path="src/components/ui/button.tsx"></mcfile>): variants (default, destructive, outline, secondary, ghost, link) and sizes (default, sm, lg, icon) via class-variance-authority; integrates with `cn`.
- Card, Alert, Badge, Progress, Tabs, Dialog, Input, Label (<mcfolder name="ui" path="src/components/ui"></mcfolder>) used across pages for structure, status, and data entry.

### Routing and App Shell

- App routes and providers (<mcfile name="App.tsx" path="src/App.tsx"></mcfile>)
  - Responsibilities: set up Router, protect routes, mount Toaster, and structure top-level routes: Home, Login, AuthCallback, Dashboard, ServerDetails, ServerMetrics, PrometheusMonitoring, AdminPanel.
  - Interactions: wraps everything in <AuthProvider> to supply auth state; uses <ProtectedRoute> for authorization checks.
- App bootstrap (<mcfile name="main.tsx" path="src/main.tsx"></mcfile>): render root with React StrictMode.

### Route Protection and Helpers

- Protected route component (<mcfile name="ProtectedRoute.tsx" path="src/components/ProtectedRoute.tsx"></mcfile>)
  - Responsibilities: gate routes by `user` presence and `is_allowed` flag; optionally require admin via `requireAdmin` prop; show loading spinner; render friendly messages for pending approval or access denied.
  - Props: `requireAdmin?: boolean`.
  - Interactions: reads auth context; redirects unauthenticated users to `/login` preserving `location` for return.

- Empty placeholder (<mcfile name="Empty.tsx" path="src/components/Empty.tsx"></mcfile>)
  - Responsibilities: simple centered stub component for future content.

### Feature Components and Pages

- Dashboard (<mcfile name="Dashboard.tsx" path="src/pages/Dashboard.tsx"></mcfile>)
  - Scope: list servers; create servers (type, version, memory); manage lifecycle actions (start/stop/restart/delete).
  - State/Props: local state for servers list, new server form, versions; uses `useAuth` to get session for API calls.
  - Data Flow: fetch servers via `/api/servers`; fetch available versions via `/api/versions`; POST to create; POST actions for lifecycle.
  - Interactions: uses UI primitives and toast notifications.

- Server Details (<mcfile name="ServerDetails.tsx" path="src/pages/ServerDetails.tsx"></mcfile>)
  - Scope: view server metadata (status, version, type, port, memory), and control lifecycle.
  - State/Props: reads `serverId` param; maintains loading, status; consumes auth session.
  - Data Flow: GET `/api/servers/:id` for details; polling or event-based status updates; POST lifecycle endpoints.

- Server Metrics (<mcfile name="ServerMetrics.tsx" path="src/pages/ServerMetrics.tsx"></mcfile>)
  - Scope: visualize current and historical metrics (CPU, memory, TPS, players, disk) and alerts; manage Prometheus monitoring config for the server.
  - State/Props: `serverId` from route; `currentMetrics`, `historicalMetrics`, `alerts`, `prometheusConfig`, `loading`, `error`, `refreshing`.
  - Data Flow:
    - GET `/api/metrics/:id/current` for latest metrics;
    - GET `/api/metrics/:id/history?hours=24&interval=5m` for time series;
    - GET `/api/metrics/:id/alerts`;
    - GET/PUT `/api/metrics/:id/monitoring/config` to toggle Prometheus exposure.
  - Interactions: uses `useAuth` to attach Bearer token; polls every 5s for current metrics and alerts; leverages `<PrometheusMetrics />` for charting.

- Prometheus Monitoring (<mcfile name="PrometheusMonitoring.tsx" path="src/pages/PrometheusMonitoring.tsx"></mcfile>)
  - Scope: server selection and display of Prometheus metrics via `<PrometheusMetrics />`; filters servers with monitoring enabled.
  - Data Flow: fetch servers list; selects target; reads metrics endpoint; fallback behavior if API unavailable.

- Prometheus Metrics component (<mcfile name="PrometheusMetrics.tsx" path="src/components/PrometheusMetrics.tsx"></mcfile>)
  - Responsibilities: fetch, parse, and render Prometheus metrics for a server; configure monitoring (enable/disable, port, RCON settings) and validate configuration.
  - Interactions: used by pages to present metrics; encapsulates charting and parsing logic.

- Auth flows
  - Login (<mcfile name="Login.tsx" path="src/pages/Login.tsx"></mcfile>): Google sign-in; redirects allowed users to dashboard; shows pending approval for authenticated but unapproved users.
  - Auth Callback (<mcfile name="AuthCallback.tsx" path="src/pages/AuthCallback.tsx"></mcfile>): post-auth redirect handler to `/dashboard` or `/login`.
  - Home (<mcfile name="Home.tsx" path="src/pages/Home.tsx"></mcfile>): initial routing based on auth/allow state.

- Admin
  - Admin Panel (<mcfile name="AdminPanel.tsx" path="src/pages/AdminPanel.tsx"></mcfile>): manage users (roles, is_allowed) and view audit logs; gated by admin role.

- Machines
  - Machines (<mcfile name="Machines.tsx" path="src/pages/Machines.tsx"></mcfile>): placeholder for future machine/host management UI.

### Cross-Cutting Concerns

- Styling: Tailwind CSS with dark mode via `useTheme`; utility `cn` ensures variant merging consistency.
- Icons and charts: lucide-react for icons; recharts for charts in metrics views.
- Notifications: sonner Toaster mounted in App; used across pages for success/error feedback.
- Authorization and tokens: all backend API requests made by protected pages include `Authorization: Bearer <session.access_token>` and `credentials: 'include'` when required by the backend.
- Polling/real-time: metrics pages set up 5s polling for freshness; other pages perform on-demand fetches.
