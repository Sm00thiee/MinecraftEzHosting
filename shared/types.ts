export interface User {
  id: string;
  email: string;
  is_allowed: boolean;
  role: 'admin' | 'user';
  created_at: string;
  last_login_at?: string;
  updated_at: string;
}

export interface Machine {
  id: string;
  name: string;
  mac_address: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Server {
  id: string;
  name: string;
  type: 'fabric' | 'spigot' | 'paper' | 'bukkit';
  mc_version: string;
  build_id?: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error';
  container_id?: string;
  game_port?: number;
  rcon_port?: number;
  query_port?: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ServerSettings {
  id: string;
  server_id: string;
  env_vars: Record<string, string>;
  resource_limits: {
    memory?: string;
    cpu?: string;
    disk?: string;
  };
  rcon_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Metrics {
  id: string;
  server_id: string;
  timestamp: string;
  cpu_usage?: number;
  memory_usage?: number;
  memory_limit?: number;
  disk_usage?: number;
  tps?: number;
  player_count: number;
  custom_metrics: Record<string, unknown>;
}

export interface Log {
  id: string;
  server_id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  source: string;
}

export interface AuditLog {
  id: string;
  actor_user_id?: string;
  action: string;
  target_type: string;
  target_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// API Request/Response types
export interface CreateServerRequest {
  name: string;
  type: Server['type'];
  server_type: Server['type'];
  mc_version?: string; // Optional, will use latest if not provided
  version?: string; // Alternative name for mc_version
  env_vars?: Record<string, string>;
  resource_limits?: ServerSettings['resource_limits'];
  rcon_enabled?: boolean;
  machine_id?: string;
}

export interface UpdateServerRequest {
  name?: string;
  env_vars?: Record<string, string>;
  resource_limits?: ServerSettings['resource_limits'];
  rcon_enabled?: boolean;
}

export interface ServerWithSettings extends Server {
  settings?: ServerSettings;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Docker container info
export interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  ports: Array<{
    private: number;
    public?: number;
    type: string;
  }>;
  created: string;
  image: string;
}

// Version resolver types
export interface MinecraftVersion {
  version: string;
  type: Server['type'];
  build_id?: string;
  url: string;
  stable: boolean;
  latest: boolean;
}

export interface VersionInfo {
  versions: MinecraftVersion[];
  latest: MinecraftVersion;
  recommended: MinecraftVersion;
}

// Prometheus Integration Types
export interface MonitoringConfig {
  id: string;
  server_id: string;
  prometheus_enabled: boolean;
  prometheus_port: number;
  custom_monitoring: boolean;
  scrape_interval: number;
  exporter_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PrometheusTarget {
  id: string;
  server_id: string;
  endpoint_url: string;
  job_name: string;
  labels: Record<string, string>;
  active: boolean;
  last_scrape?: string;
  created_at: string;
}

export interface MetricAlert {
  id: string;
  server_id: string;
  alert_type: string;
  metric_name: string;
  threshold: number;
  current_value: number;
  severity: 'info' | 'warning' | 'critical';
  resolved: boolean;
  created_at: string;
  resolved_at?: string;
}

// Prometheus Metrics Types
export interface PrometheusMetric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

export interface PrometheusResponse {
  metrics: string; // Raw prometheus text format
  timestamp: string;
}

// Monitoring Configuration API Types
export interface UpdateMonitoringConfigRequest {
  prometheus_enabled?: boolean;
  prometheus_port?: number;
  custom_monitoring?: boolean;
  scrape_interval?: number;
  exporter_config?: Record<string, unknown>;
}

export type MonitoringConfigResponse = ApiResponse<MonitoringConfig>;

export type PrometheusMetricsResponse = ApiResponse<PrometheusResponse>;

// Enhanced Metrics with Prometheus support
export interface EnhancedMetrics extends Metrics {
  prometheus_available: boolean;
  prometheus_endpoint?: string;
  prometheus_last_scrape?: string;
}

// Alert Configuration
export interface AlertRule {
  id: string;
  name: string;
  metric_name: string;
  condition: 'gt' | 'lt' | 'eq' | 'ne';
  threshold: number;
  duration: number; // seconds
  severity: MetricAlert['severity'];
  enabled: boolean;
  created_at: string;
}

export interface CreateAlertRuleRequest {
  name: string;
  metric_name: string;
  condition: AlertRule['condition'];
  threshold: number;
  duration: number;
  severity: AlertRule['severity'];
}

// Server with monitoring configuration
export interface ServerWithMonitoring extends ServerWithSettings {
  monitoring_config?: MonitoringConfig;
  prometheus_target?: PrometheusTarget;
  active_alerts?: MetricAlert[];
}
