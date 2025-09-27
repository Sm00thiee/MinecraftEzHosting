# Docker and Orchestration

## Container Model

- One container per Minecraft server.
- Container naming: mc-{serverId}.
- Volumes: per-server persistent directory servers/{serverId} mounted at /data (or equivalent image path).
- Network: bridge network with explicit published ports per server (game port, query, RCON if enabled).

## Resource Management

- Enforce CPU and memory limits per container.
- Optional I/O constraints; monitor disk usage of world data.

## Lifecycle

- Create: allocate volume, resolve version, create container with env, labels, and limits; start.
- Start/Stop/Restart: idempotent with retries.
- Update: allow changing server properties that are safe at runtime; otherwise require restart.
- Delete: stop container, optionally retain or purge volume; record audit log.

## Port Management

- Avoid collisions; allocate from a configured pool or allow custom if free.
- Validate and reserve on create; release on delete.

## Labels & Metadata

- Label containers and volumes with serverId, type, version, and owner for discoverability and cleanup.

## Scripts and Deployment Configurations

### Docker Image (Dockerfile.minecraft)

- Base image: itzg/minecraft-server:java21-alpine (Java 21, Alpine) for performance and compatibility.
- Default environment variables (can be overridden per server):
  - EULA=TRUE, TYPE=PAPER, VERSION=LATEST, MEMORY=2G
  - ENABLE_RCON=true, RCON_PASSWORD=minecraft
  - ENABLE_QUERY=true, ONLINE_MODE=true
  - DIFFICULTY=normal, MAX_PLAYERS=20
  - MOTD="A Minecraft Server managed by MC Server Management"
  - SPAWN_PROTECTION=16, VIEW_DISTANCE=10, SIMULATION_DISTANCE=10
- Data directories created inside the image: /data/world, /data/plugins, /data/logs, /data/backups
- Exposed ports: 25565/tcp (game), 25575/tcp (RCON), 25585/udp (query)
- Healthcheck: mc-monitor against SERVER_PORT for container liveness

### Docker Compose (docker-compose.yml)

- Compose version: 3.8
- Template service: minecraft-template
  - build: Dockerfile.minecraft
  - volume: minecraft-data mapped to /data
  - environment: EULA set to true
  - network: minecraft-network (bridge)
- Declared network: minecraft-network (bridge)
- Declared volume: minecraft-data (local)
- Note: Real server containers are created programmatically by the backend; the compose file is provided for local development, demonstration, and shared network/volume definitions.

### Build Scripts

- Windows (PowerShell/CMD): scripts\\build-docker-image.bat
- macOS/Linux: scripts/build-docker-image.sh
- Both scripts build the image mc-server-management:latest using Dockerfile.minecraft
- Backend behavior: If the image is missing at runtime, the backend automatically builds it to ensure server provisioning can proceed.

### System Integration Requirements

- Docker Engine running and accessible:
  - Windows: Docker Desktop with WSL2 backend recommended
- Host directory access for volumes:
  - Data path uses a Docker-accessible directory relative to project root (e.g., ./minecraft-servers/) to avoid OS-level mount restrictions
  - Ensure your Docker Desktop/File Sharing settings allow access to the project directory
- Port availability:
  - Game, RCON, and query ports must be free on the host; the backend allocates and validates the next available ports to avoid collisions
- Resource limits:
  - CPU and memory limits are set per server container; choose values appropriate to your machine capacity
- Security:
  - RCON is enabled by default in the image; override the default RCON_PASSWORD and manage per-server credentials securely
  - Containers and volumes are labeled with server metadata for traceability and cleanup

### Operational Notes

- Image management: The system ensures the mc-server-management:latest image exists; builds on demand if absent
- Container lifecycle: Create, Start, Stop, Restart, Delete operations are idempotent with retries
- Data persistence: Per-server directories are mounted to /data in the container to persist world, plugins, logs, and backups
- Monitoring and health: The built-in healthcheck feeds into orchestration status; metrics are collected separately via monitoring services
