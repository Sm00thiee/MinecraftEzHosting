import { RconService } from './rcon.js';
import { DatabaseService } from './database.js';
import { MonitoringService } from './monitoring.js';
import type { Server, MonitoringConfig } from '../../shared/types.js';

export interface PrometheusMetricDefinition {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labels?: string[];
}

export class PrometheusExporterService {
  private static readonly METRIC_PREFIX = 'minecraft_';

  // Define all available metrics based on minecraft-prometheus-exporter patterns
  private static readonly METRIC_DEFINITIONS: PrometheusMetricDefinition[] = [
    // Server status metrics
    { name: 'server_up', help: 'Whether the server is up', type: 'gauge' },
    {
      name: 'server_uptime_seconds',
      help: 'Server uptime in seconds',
      type: 'counter',
    },

    // Player metrics
    {
      name: 'players_online',
      help: 'Number of players currently online',
      type: 'gauge',
    },
    {
      name: 'players_max',
      help: 'Maximum number of players allowed',
      type: 'gauge',
    },
    {
      name: 'players_total',
      help: 'Total number of unique players that have joined',
      type: 'counter',
    },

    // Performance metrics
    { name: 'tps', help: 'Server ticks per second', type: 'gauge' },
    { name: 'mspt', help: 'Milliseconds per tick', type: 'gauge' },

    // Memory metrics
    {
      name: 'memory_used_bytes',
      help: 'Memory used by the server in bytes',
      type: 'gauge',
    },
    {
      name: 'memory_max_bytes',
      help: 'Maximum memory available to the server in bytes',
      type: 'gauge',
    },
    {
      name: 'memory_free_bytes',
      help: 'Free memory available to the server in bytes',
      type: 'gauge',
    },

    // World metrics
    {
      name: 'world_size_bytes',
      help: 'World size in bytes',
      type: 'gauge',
      labels: ['world'],
    },
    {
      name: 'entities_total',
      help: 'Total number of entities in the world',
      type: 'gauge',
      labels: ['world', 'type'],
    },
    {
      name: 'chunks_loaded',
      help: 'Number of loaded chunks',
      type: 'gauge',
      labels: ['world'],
    },

    // Container metrics (Docker)
    {
      name: 'container_cpu_usage_percent',
      help: 'Container CPU usage percentage',
      type: 'gauge',
    },
    {
      name: 'container_memory_usage_bytes',
      help: 'Container memory usage in bytes',
      type: 'gauge',
    },
    {
      name: 'container_memory_limit_bytes',
      help: 'Container memory limit in bytes',
      type: 'gauge',
    },
    {
      name: 'container_network_rx_bytes',
      help: 'Container network bytes received',
      type: 'counter',
    },
    {
      name: 'container_network_tx_bytes',
      help: 'Container network bytes transmitted',
      type: 'counter',
    },
    {
      name: 'container_disk_io_read_bytes',
      help: 'Container disk bytes read',
      type: 'counter',
    },
    {
      name: 'container_disk_io_write_bytes',
      help: 'Container disk bytes written',
      type: 'counter',
    },

    // RCON metrics
    {
      name: 'rcon_connected',
      help: 'Whether RCON is connected',
      type: 'gauge',
    },
    {
      name: 'rcon_commands_total',
      help: 'Total number of RCON commands executed',
      type: 'counter',
    },
    {
      name: 'rcon_command_duration_seconds',
      help: 'Duration of RCON commands',
      type: 'histogram',
    },
  ];

  static async generateMetrics(serverId: string): Promise<string> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        throw new Error(`Server ${serverId} not found`);
      }

      const config = await MonitoringService.getMonitoringConfig(serverId);
      if (!config?.prometheus_enabled) {
        throw new Error(`Prometheus not enabled for server ${serverId}`);
      }

      // Get current metrics
      const metrics = await MonitoringService.getCurrentMetrics(serverId);
      const rconConnected = RconService.isConnected(serverId);

      let output = '';

      // Add metric definitions (HELP and TYPE)
      for (const def of this.METRIC_DEFINITIONS) {
        const metricName = `${this.METRIC_PREFIX}${def.name}`;
        output += `# HELP ${metricName} ${def.help}\n`;
        output += `# TYPE ${metricName} ${def.type}\n`;
      }

      output += '\n';

      // Generate metric values
      const labels = this.getServerLabels(server);
      const timestamp = Date.now();

      // Server status
      output += this.formatMetric(
        'server_up',
        server.status === 'running' ? 1 : 0,
        labels,
        timestamp
      );

      if (metrics) {
        // Player metrics
        output += this.formatMetric(
          'players_online',
          metrics.player_count,
          labels,
          timestamp
        );
        if (metrics.custom_metrics.max_players) {
          output += this.formatMetric(
            'players_max',
            metrics.custom_metrics.max_players,
            labels,
            timestamp
          );
        }

        // Performance metrics
        if (metrics.tps !== undefined) {
          output += this.formatMetric('tps', metrics.tps, labels, timestamp);
          // Calculate MSPT from TPS (1000ms / TPS)
          const mspt = metrics.tps > 0 ? 1000 / metrics.tps : 0;
          output += this.formatMetric('mspt', mspt, labels, timestamp);
        }

        // Memory metrics (convert MB to bytes)
        if (metrics.memory_usage !== undefined) {
          output += this.formatMetric(
            'memory_used_bytes',
            metrics.memory_usage * 1024 * 1024,
            labels,
            timestamp
          );
        }
        if (metrics.memory_limit !== undefined) {
          output += this.formatMetric(
            'memory_max_bytes',
            metrics.memory_limit * 1024 * 1024,
            labels,
            timestamp
          );
          if (metrics.memory_usage !== undefined) {
            const freeMemory =
              (metrics.memory_limit - metrics.memory_usage) * 1024 * 1024;
            output += this.formatMetric(
              'memory_free_bytes',
              Math.max(0, freeMemory),
              labels,
              timestamp
            );
          }
        }

        // Container metrics
        if (metrics.cpu_usage !== undefined) {
          output += this.formatMetric(
            'container_cpu_usage_percent',
            metrics.cpu_usage,
            labels,
            timestamp
          );
        }
        if (metrics.memory_usage !== undefined) {
          output += this.formatMetric(
            'container_memory_usage_bytes',
            metrics.memory_usage * 1024 * 1024,
            labels,
            timestamp
          );
        }
        if (metrics.memory_limit !== undefined) {
          output += this.formatMetric(
            'container_memory_limit_bytes',
            metrics.memory_limit * 1024 * 1024,
            labels,
            timestamp
          );
        }

        // Network and disk I/O (from custom metrics)
        if (metrics.custom_metrics.network_rx !== undefined) {
          output += this.formatMetric(
            'container_network_rx_bytes',
            metrics.custom_metrics.network_rx * 1024 * 1024,
            labels,
            timestamp
          );
        }
        if (metrics.custom_metrics.network_tx !== undefined) {
          output += this.formatMetric(
            'container_network_tx_bytes',
            metrics.custom_metrics.network_tx * 1024 * 1024,
            labels,
            timestamp
          );
        }
        if (metrics.custom_metrics.block_io_read !== undefined) {
          output += this.formatMetric(
            'container_disk_io_read_bytes',
            metrics.custom_metrics.block_io_read * 1024 * 1024,
            labels,
            timestamp
          );
        }
        if (metrics.custom_metrics.block_io_write !== undefined) {
          output += this.formatMetric(
            'container_disk_io_write_bytes',
            metrics.custom_metrics.block_io_write * 1024 * 1024,
            labels,
            timestamp
          );
        }

        // World metrics
        if (metrics.custom_metrics.entities !== undefined) {
          const worldLabels = { ...labels, world: 'overworld' };
          output += this.formatMetric(
            'entities_total',
            metrics.custom_metrics.entities,
            worldLabels,
            timestamp
          );
        }
        if (metrics.custom_metrics.chunks_loaded !== undefined) {
          const worldLabels = { ...labels, world: 'overworld' };
          output += this.formatMetric(
            'chunks_loaded',
            metrics.custom_metrics.chunks_loaded,
            worldLabels,
            timestamp
          );
        }
      }

      // RCON metrics
      output += this.formatMetric(
        'rcon_connected',
        rconConnected ? 1 : 0,
        labels,
        timestamp
      );

      return output;
    } catch (error) {
      console.error(
        `Error generating Prometheus metrics for server ${serverId}:`,
        error
      );
      throw error;
    }
  }

  private static getServerLabels(server: Server): Record<string, string> {
    return {
      server_id: server.id,
      server_name: server.name,
      server_type: server.type,
      mc_version: server.mc_version,
      instance: `${server.name}:${server.game_port || 25565}`,
    };
  }

  private static formatMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    timestamp?: number
  ): string {
    const metricName = `${this.METRIC_PREFIX}${name}`;
    const labelString =
      Object.keys(labels).length > 0
        ? `{${Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',')}}`
        : '';

    const timestampString = timestamp ? ` ${timestamp}` : '';
    return `${metricName}${labelString} ${value}${timestampString}\n`;
  }

  static async getMetricsEndpoint(
    serverId: string
  ): Promise<{ endpoint: string; port: number } | null> {
    try {
      const config = await MonitoringService.getMonitoringConfig(serverId);
      if (!config?.prometheus_enabled) {
        return null;
      }

      return {
        endpoint: `/metrics`,
        port: config.prometheus_port,
      };
    } catch (error) {
      console.error(
        `Error getting metrics endpoint for server ${serverId}:`,
        error
      );
      return null;
    }
  }

  static async validateConfiguration(config: MonitoringConfig): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate port
    if (config.prometheus_port < 1024 || config.prometheus_port > 65535) {
      errors.push('Prometheus port must be between 1024 and 65535');
    }

    // Check if port is commonly used
    const commonPorts = [3000, 8080, 8081, 9090, 9091];
    if (commonPorts.includes(config.prometheus_port)) {
      warnings.push(
        `Port ${config.prometheus_port} is commonly used by other services`
      );
    }

    // Validate scrape interval
    if (config.scrape_interval < 5) {
      warnings.push(
        'Scrape interval less than 5 seconds may impact server performance'
      );
    }
    if (config.scrape_interval > 300) {
      warnings.push(
        'Scrape interval greater than 5 minutes may result in stale metrics'
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static getRecommendedConfiguration(): Partial<MonitoringConfig> {
    return {
      prometheus_enabled: true,
      prometheus_port: 9225, // Following minecraft-prometheus-exporter default
      scrape_interval: 15, // 15 seconds is a good balance
      custom_monitoring: true,
      exporter_config: {
        enable_world_stats: true,
        enable_player_stats: true,
        enable_performance_stats: true,
        enable_container_stats: true,
        rcon_timeout: 5000,
        log_level: 'info',
      },
    };
  }
}
