# Monitoring & Observability

## Goals

- Precisely track container and in-game server health with minimal overhead and no memory leaks.

## Container Monitoring

- Collect CPU, memory, restart count, disk usage, and uptime via Docker APIs/exporters.
- Sampling and retention policies: low footprint, configurable intervals, and bounded memory usage.

## Minecraft Server Monitoring

- Primary: optional lightweight plugin/mod that exposes metrics (TPS, tick timings, player counts, world stats).
- Secondary: RCON or query protocol for compatible metrics when plugin/mod is not installed.
- Design plugin/mod to be:
  - Opt-in; minimal allocations; no reflection-heavy loops; asynchronous I/O; bounded queues; safe shutdown hooks.
  - Configurable sampling; ability to disable specific probes.

## Data Pipeline

- Push or pull modes supported (agent emits or API scrapes).
- Apply backpressure, rate limits, and per-user quotas to protect the system.

## Logs

- Stream/tail logs via Docker or filesystem; implement size/time-based windows; server-side filtering; redact secrets.

## Alerting (Future)

- Threshold-based alerts for crashes, high memory, no players, etc.
