# Prometheus Integration Technical Architecture

## 1. Architecture Design

```mermaid
graph TD
    A[User Browser] --> B[React Frontend Application]
    B --> C[Express.js Backend API]
    C --> D[Supabase Database]
    C --> E[Docker Engine]
    E --> F[Minecraft Server Container]
    F --> G[minecraft-prometheus-exporter Plugin]
    G --> H[Prometheus Metrics Endpoint :9225]
    I[Prometheus Server] --> H
    I --> J[Grafana Dashboard]
    C --> K[Custom Monitoring Service]
    K --> D
    K --> E

    subgraph "Frontend Layer"
        B
    end

    subgraph "Backend Layer"
        C
        K
    end

    subgraph "Container Layer"
        E
        F
        G
    end

    subgraph "Monitoring Stack"
        H
        I
        J
    end

    subgraph "Data Layer"
        D
    end
```

## 2. Technology Description

- Frontend: React@18 + tailwindcss@3 + vite
- Backend: Express@4 + TypeScript
- Database: Supabase (PostgreSQL)
- Container Runtime: Docker + dockerode
- Monitoring: minecraft-prometheus-exporter + Custom monitoring service
- Metrics Format: Prometheus text format
- Optional Stack: Prometheus + Grafana

## 3. Route Definitions

| Route                               | Purpose                                    |
| ----------------------------------- | ------------------------------------------ |
| /api/servers/:id/metrics/current    | Get current server metrics (custom format) |
| /api/servers/:id/metrics/historical | Get historical metrics from database       |
| /api/servers/:id/metrics/prometheus | Proxy to prometheus metrics endpoint       |
| /api/servers/:id/monitoring/start   | Start monitoring for a server              |
| /api/servers/:id/monitoring/stop    | Stop monitoring for a server               |
| /api/monitoring/alerts              | Get current alerts and thresholds          |

## 4. API Definitions

### 4.1 Core API

Prometheus metrics proxy

```
GET /api/servers/:serverId/metrics/prometheus
```

Response: Raw prometheus metrics in text format

```
# HELP minecraft_tps_gauge Current server TPS
# TYPE minecraft_tps_gauge gauge
minecraft_tps_gauge{server_id="abc123"} 20.0

# HELP minecraft_players_online Current online players
# TYPE minecraft_players_online gauge
minecraft_players_online{server_id="abc123"} 5
```

Monitoring configuration

```
POST /api/servers/:serverId/monitoring/configure
```

Request:
| Param Name | Param Type | isRequired | Description |
|------------|------------|------------|-------------|
| prometheus_enabled | boolean | false | Enable prometheus exporter |
| prometheus_port | number | false | Port for prometheus endpoint |
| custom_monitoring | boolean | false | Enable custom monitoring |
| scrape_interval | number | false | Metrics collection interval in seconds |

Response:
| Param Name | Param Type | Description |
|------------|------------|-------------|
| success | boolean | Configuration update status |
| config | object | Updated monitoring configuration |

Example Request:

```json
{
  "prometheus_enabled": true,
  "prometheus_port": 9225,
  "custom_monitoring": true,
  "scrape_interval": 30
}
```

## 5. Server Architecture Diagram

```mermaid
graph TD
    A[HTTP Request] --> B[Express Router]
    B --> C[Authentication Middleware]
    C --> D[Monitoring Controller]
    D --> E[Monitoring Service]
    E --> F[Docker Service]
    E --> G[Prometheus Client]
    F --> H[Container Management]
    G --> I[Metrics Endpoint Proxy]
    E --> J[Database Service]
    J --> K[(Supabase Database)]

    subgraph "API Layer"
        B
        C
        D
    end

    subgraph "Service Layer"
        E
        F
        G
        J
    end

    subgraph "Data Layer"
        H
        I
        K
    end
```

## 6. Data Model

### 6.1 Data Model Definition

```mermaid
erDiagram
    SERVERS ||--o{ METRICS : generates
    SERVERS ||--o{ MONITORING_CONFIG : has
    SERVERS ||--o{ PROMETHEUS_TARGETS : exposes
    METRICS ||--o{ METRIC_ALERTS : triggers

    SERVERS {
        uuid id PK
        string name
        string status
        string container_id
        jsonb settings
        timestamp created_at
    }

    MONITORING_CONFIG {
        uuid id PK
        uuid server_id FK
        boolean prometheus_enabled
        integer prometheus_port
        boolean custom_monitoring
        integer scrape_interval
        jsonb exporter_config
        timestamp updated_at
    }

    PROMETHEUS_TARGETS {
        uuid id PK
        uuid server_id FK
        string endpoint_url
        string job_name
        jsonb labels
        boolean active
        timestamp last_scrape
    }

    METRICS {
        uuid id PK
        uuid server_id FK
        float cpu_usage
        bigint memory_usage
        bigint memory_limit
        float tps
        integer player_count
        jsonb custom_metrics
        timestamp timestamp
    }

    METRIC_ALERTS {
        uuid id PK
        uuid server_id FK
        string alert_type
        string metric_name
        float threshold
        float current_value
        string severity
        boolean resolved
        timestamp created_at
    }
```

### 6.2 Data Definition Language

Monitoring Configuration Table

```sql
-- Create monitoring_config table
CREATE TABLE monitoring_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    prometheus_enabled BOOLEAN DEFAULT false,
    prometheus_port INTEGER DEFAULT 9225,
    custom_monitoring BOOLEAN DEFAULT true,
    scrape_interval INTEGER DEFAULT 30,
    exporter_config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(server_id)
);

-- Create prometheus_targets table
CREATE TABLE prometheus_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    endpoint_url VARCHAR(255) NOT NULL,
    job_name VARCHAR(100) DEFAULT 'minecraft-servers',
    labels JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    last_scrape TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(server_id)
);

-- Create metric_alerts table
CREATE TABLE metric_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    threshold FLOAT NOT NULL,
    current_value FLOAT NOT NULL,
    severity VARCHAR(20) DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_monitoring_config_server_id ON monitoring_config(server_id);
CREATE INDEX idx_prometheus_targets_server_id ON prometheus_targets(server_id);
CREATE INDEX idx_prometheus_targets_active ON prometheus_targets(active);
CREATE INDEX idx_metric_alerts_server_id ON metric_alerts(server_id);
CREATE INDEX idx_metric_alerts_resolved ON metric_alerts(resolved);
CREATE INDEX idx_metric_alerts_severity ON metric_alerts(severity);

-- Grant permissions
GRANT SELECT ON monitoring_config TO anon;
GRANT ALL PRIVILEGES ON monitoring_config TO authenticated;
GRANT SELECT ON prometheus_targets TO anon;
GRANT ALL PRIVILEGES ON prometheus_targets TO authenticated;
GRANT SELECT ON metric_alerts TO anon;
GRANT ALL PRIVILEGES ON metric_alerts TO authenticated;

-- Insert default monitoring configurations
INSERT INTO monitoring_config (server_id, prometheus_enabled, custom_monitoring)
SELECT id, false, true FROM servers
WHERE id NOT IN (SELECT server_id FROM monitoring_config);
```

## 7. Integration Workflow

### 7.1 Server Creation with Prometheus Support

1. User creates new Minecraft server
2. System creates Docker container with minecraft-prometheus-exporter plugin
3. Plugin exposes metrics on port 9225 inside container
4. Container port is mapped to host (e.g., 9225:9225)
5. Prometheus target is registered in database
6. Custom monitoring service continues parallel data collection

### 7.2 Metrics Collection Flow

```mermaid
sequenceDiagram
    participant P as Prometheus Server
    participant API as Management API
    participant MS as Monitoring Service
    participant MC as Minecraft Container
    participant PE as Prometheus Exporter
    participant DB as Database

    Note over P,DB: Dual Collection System

    P->>+API: GET /api/servers/123/metrics/prometheus
    API->>+MC: HTTP GET :9225/metrics
    MC->>+PE: Request metrics
    PE-->>-MC: Prometheus format metrics
    MC-->>-API: Raw prometheus data
    API-->>-P: Proxy response

    par Custom Monitoring
        MS->>+MC: Docker stats API
        MC-->>-MS: Container metrics
        MS->>+MC: RCON/logs parsing
        MC-->>-MS: Game metrics
        MS->>DB: Store custom format
    end
```

### 7.3 Configuration Management

- Monitoring configuration stored per server in database
- Dynamic enable/disable of prometheus exporter
- Port configuration and conflict resolution
- Graceful fallback to custom monitoring when prometheus unavailable
