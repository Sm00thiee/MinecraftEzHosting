# Prometheus Setup Guide for Minecraft Server Management

This guide provides comprehensive instructions for setting up Prometheus monitoring with your Minecraft servers, based on the enhanced integration with minecraft-prometheus-exporter.

## Overview

The system now provides enhanced Prometheus integration with:

- **RCON-based metrics collection** for real-time server data
- **Fallback to log parsing** when RCON is unavailable
- **Dedicated Prometheus endpoints** for metrics scraping
- **Automatic plugin management** for minecraft-prometheus-exporter
- **Configuration validation** and health checks

## Architecture

### Metrics Collection Flow

1. **Primary**: RCON connection for real-time metrics
2. **Fallback**: Docker log parsing when RCON fails
3. **Export**: Prometheus-formatted metrics via HTTP endpoints
4. **Storage**: Historical data in database for dashboards

### Components

- **RconService**: Direct server communication for metrics
- **PrometheusExporterService**: Metrics formatting and endpoint management
- **MonitoringService**: Orchestrates collection and storage
- **Prometheus Routes**: HTTP endpoints for scraping

## Setup Instructions

### 1. Server Configuration

#### Enable Prometheus for a Server

```bash
# Via API endpoint
POST /api/metrics/{serverId}/config
{
  "prometheus_enabled": true,
  "prometheus_port": 9225,
  "rcon_enabled": true,
  "rcon_port": 25575,
  "rcon_password": "your-secure-password"
}
```

#### Recommended Configuration

```yaml
# Default settings (automatically applied)
prometheus_enabled: true
prometheus_port: 9225 # Standard minecraft-prometheus-exporter port
rcon_enabled: true
rcon_port: 25575 # Standard RCON port
collection_interval: 30 # Seconds between collections
retention_days: 30 # Days to keep historical data
```

### 2. Prometheus Server Setup

#### Prometheus Configuration

Create or update your `prometheus.yml`:

```yaml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  # Minecraft servers - dynamic discovery
  - job_name: 'minecraft-servers'
    static_configs:
      - targets: []

    # Use service discovery or manual target management
    file_sd_configs:
      - files:
          - '/etc/prometheus/minecraft-targets.json'
        refresh_interval: 60s

  # Manual server configuration example
  - job_name: 'minecraft-server-1'
    static_configs:
      - targets: ['localhost:9225']
    scrape_interval: 30s
    metrics_path: '/api/prometheus/{server-id}/metrics'

rule_files:
  - 'minecraft-alerts.yml'

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093
```

#### Dynamic Target Discovery

The system provides endpoints for dynamic target management:

```bash
# Get all active Prometheus targets
GET /api/metrics/prometheus/targets

# Get specific server endpoint
GET /api/prometheus/{serverId}/endpoint

# Response example:
{
  "success": true,
  "data": {
    "endpoint": "/api/prometheus/{serverId}/metrics",
    "port": 9225,
    "full_url": "http://localhost:9225/api/prometheus/{serverId}/metrics"
  }
}
```

### 3. Available Metrics

#### Core Server Metrics

```prometheus
# Player metrics
minecraft_players_online{server="server-name"} 5
minecraft_players_max{server="server-name"} 20

# Performance metrics
minecraft_tps{server="server-name"} 19.8
minecraft_memory_used_bytes{server="server-name"} 2147483648
minecraft_memory_max_bytes{server="server-name"} 4294967296

# World metrics
minecraft_world_size_bytes{server="server-name"} 1073741824
minecraft_entities_total{server="server-name"} 150

# Network metrics
minecraft_network_bytes_in{server="server-name"} 1024000
minecraft_network_bytes_out{server="server-name"} 2048000
```

#### System Metrics

```prometheus
# Container metrics
minecraft_container_cpu_usage{server="server-name"} 0.45
minecraft_container_memory_usage{server="server-name"} 0.75
minecraft_container_disk_usage{server="server-name"} 0.30

# RCON status
minecraft_rcon_connected{server="server-name"} 1
minecraft_rcon_response_time_seconds{server="server-name"} 0.025
```

#### Custom Plugin Metrics

When minecraft-prometheus-exporter plugin is installed:

```prometheus
# Advanced player metrics
minecraft_player_deaths_total{server="server-name"} 42
minecraft_player_joins_total{server="server-name"} 156
minecraft_player_leaves_total{server="server-name"} 134

# World statistics
minecraft_chunks_loaded{server="server-name"} 1250
minecraft_mobs_total{server="server-name",type="hostile"} 45
minecraft_mobs_total{server="server-name",type="passive"} 78
```

### 4. Alerting Rules

Create `minecraft-alerts.yml`:

```yaml
groups:
  - name: minecraft-server-alerts
    rules:
      # Server availability
      - alert: MinecraftServerDown
        expr: up{job=~"minecraft.*"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: 'Minecraft server {{ $labels.instance }} is down'

      # Performance alerts
      - alert: MinecraftLowTPS
        expr: minecraft_tps < 15
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'Minecraft server {{ $labels.server }} has low TPS: {{ $value }}'

      - alert: MinecraftHighMemoryUsage
        expr: (minecraft_memory_used_bytes / minecraft_memory_max_bytes) > 0.9
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: 'Minecraft server {{ $labels.server }} memory usage is high: {{ $value | humanizePercentage }}'

      # Player alerts
      - alert: MinecraftServerFull
        expr: minecraft_players_online >= minecraft_players_max
        for: 1m
        labels:
          severity: info
        annotations:
          summary: 'Minecraft server {{ $labels.server }} is at capacity'
```

### 5. Grafana Dashboard

#### Import Dashboard

Use the provided dashboard JSON or create custom panels:

```json
{
  "dashboard": {
    "title": "Minecraft Server Monitoring",
    "panels": [
      {
        "title": "Players Online",
        "type": "stat",
        "targets": [
          {
            "expr": "minecraft_players_online",
            "legendFormat": "{{ server }}"
          }
        ]
      },
      {
        "title": "Server TPS",
        "type": "graph",
        "targets": [
          {
            "expr": "minecraft_tps",
            "legendFormat": "{{ server }}"
          }
        ]
      }
    ]
  }
}
```

#### Key Panels to Include

1. **Server Status Overview**
   - Online/offline status
   - Player count vs capacity
   - Current TPS

2. **Performance Metrics**
   - Memory usage over time
   - CPU utilization
   - Network I/O

3. **Player Activity**
   - Players online timeline
   - Join/leave events
   - Peak hours analysis

4. **World Statistics**
   - World size growth
   - Entity counts
   - Chunk loading

### 6. Troubleshooting

#### Common Issues

**RCON Connection Failed**

```bash
# Check RCON configuration
GET /api/prometheus/{serverId}/recommended-config

# Validate current config
POST /api/prometheus/{serverId}/validate-config
```

**Metrics Not Available**

```bash
# Check Prometheus health
GET /api/metrics/{serverId}/prometheus/health

# View raw metrics
GET /api/prometheus/{serverId}/metrics
```

**Plugin Installation Issues**

```bash
# Check if plugin is installed
# The system automatically manages minecraft-prometheus-exporter plugin

# Manual verification in server files:
ls minecraft-servers/{server-id}/plugins/minecraft-prometheus-exporter.jar
```

#### Debug Endpoints

```bash
# Get current metrics (JSON format)
GET /api/metrics/{serverId}/current

# Get Prometheus metrics (raw format)
GET /api/prometheus/{serverId}/metrics

# Check endpoint configuration
GET /api/prometheus/{serverId}/endpoint

# Validate configuration
POST /api/prometheus/{serverId}/validate-config
```

### 7. Best Practices

#### Security

- **Use authentication** for Prometheus endpoints in production
- **Restrict network access** to metrics endpoints
- **Rotate RCON passwords** regularly
- **Monitor access logs** for unusual activity

#### Performance

- **Set appropriate scrape intervals** (30s recommended)
- **Limit retention period** based on storage capacity
- **Use recording rules** for complex queries
- **Monitor Prometheus resource usage**

#### Reliability

- **Enable both RCON and log parsing** for redundancy
- **Set up alerting** for critical metrics
- **Regular backup** of Prometheus data
- **Test failover scenarios**

## Integration Examples

### Docker Compose with Prometheus

```yaml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - '9090:9090'
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'

  grafana:
    image: grafana/grafana:latest
    ports:
      - '3001:3000'
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

volumes:
  prometheus-data:
  grafana-data:
```

### Kubernetes Deployment

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
data:
  prometheus.yml: |
    global:
      scrape_interval: 30s
    scrape_configs:
      - job_name: 'minecraft-servers'
        kubernetes_sd_configs:
          - role: endpoints
        relabel_configs:
          - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
            action: keep
            regex: true
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
        - name: prometheus
          image: prom/prometheus:latest
          ports:
            - containerPort: 9090
          volumeMounts:
            - name: config
              mountPath: /etc/prometheus
      volumes:
        - name: config
          configMap:
            name: prometheus-config
```

## Conclusion

This enhanced Prometheus integration provides comprehensive monitoring capabilities for Minecraft servers with:

- **Reliable metrics collection** through RCON and log parsing
- **Standardized Prometheus endpoints** for easy integration
- **Automatic plugin management** for advanced metrics
- **Robust error handling** and fallback mechanisms
- **Production-ready configuration** examples

The system is designed to work out-of-the-box while providing flexibility for custom monitoring setups and advanced use cases.
