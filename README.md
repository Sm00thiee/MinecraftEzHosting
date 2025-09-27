# MC Server Management

A full‑stack web application to provision, manage, and monitor Minecraft servers. It provides a React + Vite dashboard, an Express/TypeScript API that orchestrates Docker containers, secure file/log access, and first‑class observability via a Prometheus pipeline. Authentication and data storage are backed by Supabase.

## Features

- Server lifecycle: create, start/stop/restart, delete with optional volume retention
- Version resolver: resolves latest or specific upstream versions/builds (Paper/Fabric/Spigot/Bukkit)
- Secure file browser: scoped read/write with safe path normalization and allow‑listed edits
- Logs: live container logs, historical log files, and server‑side filtering
- Metrics & monitoring: container + Minecraft metrics, alerts, Prometheus exposition and scraping
- AuthZ: Google sign‑in via Supabase, “is_allowed” gate, ownership and admin role enforcement
- Multi‑machine ready: model for machines/hosts and servers assigned to them
- Production‑ready Docker setup for frontend and backend

## Architecture (at a glance)

- Frontend: React + TypeScript + Vite + Tailwind
- Backend API: Node.js + Express + TypeScript
- Auth/DB: Supabase (Postgres + Auth)
- Orchestration: Docker (one container per MC server)
- Observability: Prometheus exporter + scraper and internal metrics pipeline

For deeper details, see the in‑repo design docs:

- .trae/docs/architecture.md
- .trae/docs/api-and-data-model.md
- .trae/docs/monitoring-and-observability.md
- .trae/docs/docker-and-orchestration.md
- .trae/docs/security-and-privacy.md

## Project Structure

- api/ … Express server, routes, and services (Docker, Monitoring, Prometheus, RCON, File Access, DB)
- src/ … React app (pages, components, contexts, hooks)
- supabase/migrations/ … SQL migrations (schema, Prometheus integration, machines table)
- tests/ … Playwright end‑to‑end and integration tests
- docker-compose.yml … local dev services
- docker-compose.prod.yml … production deployment (frontend + backend)
- Dockerfile.frontend, api/Dockerfile, Dockerfile.minecraft … build images

## Prerequisites

- Node.js 20+ and npm (or pnpm)
- Docker Engine
  - Windows: Docker Desktop (named pipe support) is required for local dev
- A Supabase project (URL + anon key + service role; Postgres connection URL)

## Environment Variables

Copy .env.example to .env and fill the values:

- Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
- Frontend (Vite requires VITE\_ prefix): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- JWT: JWT_SECRET
- Server: PORT (default 3001), NODE_ENV
- Docker & MC server orchestration:
  - MC_BASE_PORT, RCON_BASE_PORT, QUERY_BASE_PORT
  - MC_SERVERS_BASE_PATH, MC_PORT_RANGE_START, MC_PORT_RANGE_END
- Admin bootstrap (first‑run only): ADMIN_EMAIL, ADMIN_BOOTSTRAP_TOKEN

Notes:

- On Windows local dev, the backend talks to Docker via named pipe. docker-compose.yml mounts \\./pipe/docker_engine and sets DOCKER_HOST accordingly. In Linux/macOS, the prod compose mounts /var/run/docker.sock.
- Keep JWT_SECRET and Supabase keys secure and never commit real values.

## Install

- npm ci

If you use pnpm or yarn, adapt commands accordingly.

## Running Locally (dev)

Two processes run concurrently: the Vite dev server (frontend) and the backend with Nodemon (which can build/update the Docker image used for MC servers).

- npm run dev

This starts:

- Frontend at http://localhost:5173
- Backend at http://localhost:3001

Ensure Docker is running. On first run, the backend may build the Minecraft base image as needed.

## Building

- Frontend + types check + build: npm run build
- Backend only types build: npm run build:server

## Docker (production)

Use the production compose to run Nginx‑served frontend and the backend API.

1. Prepare environment variables in .env (same file used by compose)
2. Build and run:

- npm run docker:prod

This is equivalent to:

- npm run docker:build:prod
- npm run docker:run:prod

After startup:

- Frontend: http://localhost:80
- Backend: http://localhost:3001

## Database & Supabase

- DATABASE_URL should point to your Supabase Postgres instance
- Apply the SQL migrations under supabase/migrations using your preferred method (Supabase SQL editor, psql, or Supabase CLI)
- The application expects “is_allowed” gating and user entries to be present; the ADMIN_BOOTSTRAP_TOKEN flow is intended to provision the first admin safely and should be changed/disabled afterward.

## API Overview

The API exposes endpoints for servers, files, logs, metrics, Prometheus, auth, and machines. Highlights:

- POST /servers — create and provision (version resolution + container)
- POST /servers/:id/start|stop|restart
- GET /servers/:id/logs; /files; /metrics
- Prometheus exposition per server and internal scraping endpoints

See .trae/docs/api-and-data-model.md for the full list and data model.

## Testing

Playwright is configured with an HTML reporter.

- Run tests: npx playwright test
- Open last report: npx playwright show-report

Notes:

- The config points baseURL to http://localhost:80. For a green run, ensure the frontend is reachable at that URL (e.g., via docker-compose.prod) or adjust the baseURL for your environment.

## Quality & Security

- Lint: npm run lint
- Lint (fix): npm run lint:fix
- Format: npm run format
- Format (check): npm run format:check
- Type check: npm run type-check
- Security scans: npm run security:scan | npm run security:audit | npm run security:full
- Git hooks: Husky is configured (pre‑commit) to help maintain code quality

Additional guidance:

- docs/CREDENTIAL_MANAGEMENT.md
- SECURITY.md and SECURITY_AUDIT.md

## Troubleshooting

- Docker socket/pipe access
  - Windows dev: ensure Docker Desktop is running; the named pipe \\./pipe/docker_engine must be accessible
  - Linux/macOS prod: ensure /var/run/docker.sock is mounted and DOCKER_HOST=unix:///var/run/docker.sock
- Ports already in use
  - Adjust MC_BASE_PORT/RCON_BASE_PORT/QUERY_BASE_PORT or service ports in compose files
- Supabase auth/login issues
  - Verify VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY in the frontend build and SUPABASE_URL/SUPABASE_ANON_KEY on the backend
- Missing admin rights
  - Use ADMIN_BOOTSTRAP_TOKEN once to seed the first admin and rotate/remove the token after

## Roadmap

See .trae/docs/roadmap.md for planned features and improvements.

## License

Add your license of choice in a LICENSE file (not yet provided).
