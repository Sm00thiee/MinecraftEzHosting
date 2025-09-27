# Monitoring & Observability

## Goals

- Precisely track container and in-game server health with minimal overhead and no memory leaks.
- Provide industry-standard prometheus metrics for integration with monitoring stacks.

## Container Monitoring

- Collect CPU, memory, restart count, disk usage, and uptime via Docker APIs/exporters.
- Sampling and retention policies: low footprint, configurable intervals, and bounded memory usage.

## Minecraft Server Monitoring

### Primary Options

1. **minecraft-prometheus-exporter Plugin/Mod** (Recommended for production)
   - Industry-standard prometheus metrics format
   - Compatible with Grafana, Prometheus, and alerting systems
   - Exposes comprehensive server metrics via HTTP endpoint
   - Minimal performance impact with configurable scraping intervals

2. **Custom Lightweight Plugin/Mod** (Fallback option)
   - Optional lightweight plugin/mod that exposes metrics (TPS, tick timings, player counts, world stats)
   - Design to be opt-in with minimal allocations and asynchronous I/O

### Secondary Options

- RCON or query protocol for compatible metrics when plugin/mod is not installed
- Log parsing for basic metrics extraction

### Plugin/Mod Design Principles

- Opt-in; minimal allocations; no reflection-heavy loops; asynchronous I/O; bounded queues; safe shutdown hooks
- Configurable sampling; ability to disable specific probes
- Support for both custom format and prometheus format output

## Prometheus Integration

### Metrics Endpoint

- Expose `/metrics` endpoint on configurable port (default: 9225)
- Standard prometheus text format with proper labels and help text
- Automatic service discovery support via Docker labels

### Exposed Metrics

```
# Server Performance
minecraft_tps_gauge{server_id="xxx"} 20.0
minecraft_tick_duration_seconds{server_id="xxx",quantile="0.5"} 0.045
minecraft_memory_used_bytes{server_id="xxx",type="heap"} 1073741824
minecraft_memory_max_bytes{server_id="xxx",type="heap"} 2147483648

# Player Metrics
minecraft_players_online{server_id="xxx"} 5
minecraft_players_max{server_id="xxx"} 20
minecraft_player_joins_total{server_id="xxx"} 150
minecraft_player_leaves_total{server_id="xxx"} 145

# World Statistics
minecraft_world_size_bytes{server_id="xxx",world="world"} 52428800
minecraft_chunks_loaded{server_id="xxx",world="world"} 256
minecraft_entities_total{server_id="xxx",world="world",type="mob"} 45

# Server Status
minecraft_uptime_seconds{server_id="xxx"} 3600
minecraft_server_info{server_id="xxx",version="1.21.8",type="paper"} 1
```

### Configuration

```yaml
# minecraft-prometheus-exporter config
metrics:
  enabled: true
  port: 9225
  interval: 30s
  include:
    - server_performance
    - player_stats
    - world_stats
  exclude:
    - detailed_chunk_stats
```

## Data Pipeline

### Dual Mode Support

1. **Custom API Mode**: Push or pull modes supported (agent emits or API scrapes)
2. **Prometheus Mode**: Standard prometheus scraping via `/metrics` endpoint

### Integration Architecture

```
Minecraft Server
├── minecraft-prometheus-exporter (port 9225)
│   └── /metrics endpoint
├── Custom Monitoring Service
│   └── Internal metrics collection
└── Container Stats (Docker API)
    └── CPU, Memory, Network, Disk I/O
```

### Scraping Configuration

```yaml
# Prometheus scrape config
scrape_configs:
  - job_name: 'minecraft-servers'
    static_configs:
      - targets: ['server1:9225', 'server2:9225']
    scrape_interval: 30s
    metrics_path: /metrics
```

### Backpressure and Rate Limiting

- Apply backpressure, rate limits, and per-user quotas to protect the system
- Prometheus endpoint respects standard HTTP rate limiting
- Configurable scraping intervals to balance accuracy vs. performance

## Logs

- Stream/tail logs via Docker or filesystem; implement size/time-based windows; server-side filtering; redact secrets
- Log-based metrics extraction as fallback when prometheus exporter unavailable

## Alerting

### Prometheus Alerting Rules

```yaml
groups:
  - name: minecraft-server-alerts
    rules:
      - alert: MinecraftServerDown
        expr: up{job="minecraft-servers"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: 'Minecraft server {{ $labels.instance }} is down'

      - alert: MinecraftLowTPS
        expr: minecraft_tps_gauge < 15
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: 'Minecraft server {{ $labels.server_id }} has low TPS: {{ $value }}'

      - alert: MinecraftHighMemoryUsage
        expr: (minecraft_memory_used_bytes / minecraft_memory_max_bytes) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Minecraft server {{ $labels.server_id }} memory usage is high: {{ $value | humanizePercentage }}'
```

### Legacy Alerting (Custom System)

- Threshold-based alerts for crashes, high memory, no players, etc.
- Maintained for backward compatibility and non-prometheus deployments
