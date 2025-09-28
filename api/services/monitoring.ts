import * as cron from 'node-cron';
import { DockerService } from './docker.js';
import { DatabaseService } from './database.js';
import { RconService } from './rcon.js';
import type {
  Metrics,
  MonitoringConfig,
  PrometheusTarget,
  MetricAlert,
  PrometheusResponse,
  UpdateMonitoringConfigRequest,
} from '../../shared/types.js';

export class MonitoringService {
  private static isRunning = false;
  private static cronJob: cron.ScheduledTask | null = null;

  // Start monitoring service
  static start(): void {
    if (this.isRunning) {
      console.log('Monitoring service is already running');
      return;
    }

    console.log('Starting monitoring service...');

    // Run every 30 seconds
    this.cronJob = cron.schedule(
      '*/30 * * * * *',
      async () => {
        await this.collectMetrics();
      },
      {
        scheduled: false,
      } as cron.ScheduleOptions
    );

    this.cronJob.start();
    this.isRunning = true;

    console.log(
      'Monitoring service started - collecting metrics every 30 seconds'
    );
  }

  // Stop monitoring service
  static stop(): void {
    if (!this.isRunning) {
      console.log('Monitoring service is not running');
      return;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob.destroy();
      this.cronJob = null;
    }

    // Disconnect all RCON connections
    RconService.disconnectAll().catch(_error => {
      console.error('Error disconnecting RCON connections:', _error);
    });

    this.isRunning = false;
    console.log('Monitoring service stopped');
  }

  // Stop monitoring for a specific server
  static async stopMonitoring(serverId: string): Promise<boolean> {
    try {
      // Disconnect RCON if connected
      await RconService.disconnect(serverId);
      console.log(`Monitoring stopped for server ${serverId}`);
      return true;
    } catch (error) {
      console.error(`Error stopping monitoring for server ${serverId}:`, error);
      return false;
    }
  }

  // Get current metrics for a server
  static async getCurrentMetrics(serverId: string): Promise<Metrics | null> {
    try {
      // Get the latest metrics from database
      const metrics = await DatabaseService.getLatestMetrics(serverId);
      return metrics;
    } catch (error) {
      console.error(
        `Error getting current metrics for server ${serverId}:`,
        error
      );
      return null;
    }
  }

  // Collect metrics for all running servers
  private static async collectMetrics(): Promise<void> {
    try {
      const servers = await DatabaseService.getAllServers();
      const runningServers = servers.filter(
        server => server.status === 'running' && server.container_id
      );

      for (const server of runningServers) {
        try {
          await this.collectServerMetrics(server.id);
        } catch (error) {
          console.error(
            `Error collecting metrics for server ${server.id}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error('Error in metrics collection cycle:', error);
    }
  }

  // Collect metrics for a specific server
  static async collectServerMetrics(serverId: string): Promise<Metrics | null> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server || !server.container_id || server.status !== 'running') {
        return null;
      }

      // Get container stats
      const containerStats = await this.getContainerStats(server.container_id);
      if (!containerStats) {
        return null;
      }

      // Get Minecraft-specific metrics
      const mcMetrics = await this.getMinecraftMetrics(serverId);

      const metrics: Omit<Metrics, 'id' | 'timestamp'> = {
        server_id: serverId,
        cpu_usage: containerStats.cpu_usage,
        memory_usage: containerStats.memory_usage,
        memory_limit: containerStats.memory_limit,
        disk_usage: containerStats.disk_usage
          ? Math.round((containerStats.disk_usage / 1024 / 1024) * 100) / 100
          : undefined, // Convert bytes to MB
        tps: mcMetrics.tps,
        player_count: mcMetrics.player_count,
        custom_metrics: {
          network_rx:
            Math.round((containerStats.network_rx / 1024 / 1024) * 100) / 100, // Convert bytes to MB
          network_tx:
            Math.round((containerStats.network_tx / 1024 / 1024) * 100) / 100, // Convert bytes to MB
          block_io_read:
            Math.round((containerStats.block_io_read / 1024 / 1024) * 100) /
            100, // Convert bytes to MB
          block_io_write:
            Math.round((containerStats.block_io_write / 1024 / 1024) * 100) /
            100, // Convert bytes to MB
          ...mcMetrics.custom,
        },
      };

      // Store metrics in database
      await DatabaseService.createMetrics(metrics);

      return {
        id: '', // Will be set by database
        timestamp: new Date().toISOString(),
        ...metrics,
      };
    } catch (error) {
      console.error(`Error collecting metrics for server ${serverId}:`, error);
      return null;
    }
  }

  // Get Docker container statistics
  private static async getContainerStats(containerId: string): Promise<{
    cpu_usage: number;
    memory_usage: number;
    memory_limit: number;
    disk_usage?: number;
    network_rx: number;
    network_tx: number;
    block_io_read: number;
    block_io_write: number;
  } | null> {
    try {
      const Docker = (await import('dockerode')).default;
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      const container = docker.getContainer(containerId);

      const stats = await container.stats({ stream: false });

      // Calculate CPU usage percentage
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        (stats.precpu_stats?.cpu_usage?.total_usage || 0);
      const systemDelta =
        stats.cpu_stats.system_cpu_usage -
        (stats.precpu_stats?.system_cpu_usage || 0);
      const cpuUsage = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

      // Memory usage
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;

      // Network I/O
      let networkRx = 0;
      let networkTx = 0;
      if (stats.networks) {
        Object.values(stats.networks).forEach((network: unknown) => {
          const net = network as { rx_bytes?: number; tx_bytes?: number };
          networkRx += net.rx_bytes || 0;
          networkTx += net.tx_bytes || 0;
        });
      }

      // Block I/O
      let blockIoRead = 0;
      let blockIoWrite = 0;
      if (stats.blkio_stats?.io_service_bytes_recursive) {
        stats.blkio_stats.io_service_bytes_recursive.forEach((io: unknown) => {
          const ioStat = io as { op?: string; value?: number };
          if (ioStat.op === 'Read') blockIoRead += ioStat.value || 0;
          if (ioStat.op === 'Write') blockIoWrite += ioStat.value || 0;
        });
      }

      return {
        cpu_usage: Math.round(cpuUsage * 100) / 100,
        memory_usage: Math.round((memoryUsage / 1024 / 1024) * 100) / 100, // Convert bytes to MB
        memory_limit: Math.round((memoryLimit / 1024 / 1024) * 100) / 100, // Convert bytes to MB
        network_rx: networkRx,
        network_tx: networkTx,
        block_io_read: blockIoRead,
        block_io_write: blockIoWrite,
      };
    } catch (_error) {
      console.error('Error getting container stats:', _error);
      return null;
    }
  }

  // Get Minecraft-specific metrics via RCON or log parsing
  private static async getMinecraftMetrics(serverId: string): Promise<{
    tps?: number;
    player_count: number;
    custom: Record<string, unknown>;
  }> {
    try {
      // First try RCON if available
      if (RconService.isConnected(serverId)) {
        const rconMetrics = await RconService.getMinecraftMetrics(serverId);
        return {
          tps: rconMetrics.tps,
          player_count: rconMetrics.player_count,
          custom: {
            ...rconMetrics.custom,
            max_players: rconMetrics.max_players,
            entities: rconMetrics.entities,
            chunks_loaded: rconMetrics.chunks_loaded,
            memory_used: rconMetrics.memory_used,
            memory_max: rconMetrics.memory_max,
            uptime: rconMetrics.uptime,
            source: 'rcon',
          },
        };
      }

      // Fallback to log parsing
      return await this.parseLogMetrics(serverId);
    } catch (_error) {
      console.error(
        `Error getting Minecraft metrics for server ${serverId}:`,
        _error
      );
      return {
        player_count: 0,
        custom: { error: (_error as Error).message, source: 'error' },
      };
    }
  }

  // Get metrics via RCON
  // Parse metrics from server logs (fallback when RCON is not available)
  private static async parseLogMetrics(serverId: string): Promise<{
    tps?: number;
    player_count: number;
    custom: Record<string, unknown>;
  }> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server || !server.container_id) {
        return {
          player_count: 0,
          custom: { source: 'log_parse', error: 'No server or container' },
        };
      }

      // Get recent logs from container
      const Docker = (await import('dockerode')).default;
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      const container = docker.getContainer(server.container_id);

      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        tail: 100,
        timestamps: false,
      });

      const logs = logStream.toString();
      const metrics = {
        player_count: 0,
        custom: { source: 'log_parse' },
      };

      // Parse player join/leave messages
      const playerJoinPattern = /(\w+) joined the game/g;
      const playerLeavePattern = /(\w+) left the game/g;
      const playerListPattern = /There are (\d+)\/(\d+) players online/;

      const joinMatches = [...logs.matchAll(playerJoinPattern)];
      const leaveMatches = [...logs.matchAll(playerLeavePattern)];

      // Simple player count estimation (not perfect, but better than nothing)
      const recentJoins = joinMatches.slice(-10).length;
      const recentLeaves = leaveMatches.slice(-10).length;
      metrics.player_count = Math.max(0, recentJoins - recentLeaves);

      // Look for explicit player count in logs
      const playerListMatch = logs.match(playerListPattern);
      if (playerListMatch) {
        metrics.player_count = parseInt(playerListMatch[1]);
        (metrics.custom as Record<string, unknown>).max_players = parseInt(
          playerListMatch[2]
        );
      }

      // Parse TPS from logs (if server outputs TPS info)
      const tpsPattern = /TPS.*?([0-9.]+)/i;
      const tpsMatch = logs.match(tpsPattern);
      if (tpsMatch) {
        (
          metrics as {
            tps?: number;
            player_count: number;
            custom: Record<string, unknown>;
          }
        ).tps = parseFloat(tpsMatch[1]);
      }

      // Parse memory usage from logs
      const memoryPattern = /Memory.*?(\d+).*?MB.*?(\d+).*?MB/i;
      const memoryMatch = logs.match(memoryPattern);
      if (memoryMatch) {
        (metrics.custom as Record<string, unknown>).memory_used = parseInt(
          memoryMatch[1]
        );
        (metrics.custom as Record<string, unknown>).memory_max = parseInt(
          memoryMatch[2]
        );
      }

      // Parse world info
      const worldPattern = /Loading.*?world.*?(\w+)/i;
      const worldMatch = logs.match(worldPattern);
      if (worldMatch) {
        (metrics.custom as Record<string, unknown>).world_name = worldMatch[1];
      }

      // Parse startup time
      const startupPattern = /Done.*?([0-9.]+)s/i;
      const startupMatch = logs.match(startupPattern);
      if (startupMatch) {
        (metrics.custom as Record<string, unknown>).startup_time = parseFloat(
          startupMatch[1]
        );
      }

      return metrics;
    } catch (_error) {
      console.error(
        `Error parsing log metrics for server ${serverId}:`,
        _error
      );
      return {
        player_count: 0,
        custom: {
          source: 'log_parse',
          error: (_error as Error).message,
        },
      };
    }
  }

  // Start monitoring for a specific server with RCON connection
  static async startMonitoring(serverId: string): Promise<boolean> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        console.error(`Server ${serverId} not found`);
        return false;
      }

      // Try to establish RCON connection if enabled
      if (server.rcon_port) {
        const settings = await DatabaseService.getServerSettings(serverId);
        const rconPassword = settings?.env_vars?.RCON_PASSWORD;

        if (rconPassword) {
          const rconConfig = {
            host: 'localhost', // Assuming server runs locally
            port: server.rcon_port,
            password: rconPassword,
            timeout: 5000,
          };

          const connected = await RconService.connect(serverId, rconConfig);
          if (connected) {
            console.log(`RCON monitoring started for server ${serverId}`);
          } else {
            console.warn(
              `Failed to connect RCON for server ${serverId}, will use log parsing`
            );
          }
        }
      }

      console.log(`Monitoring started for server ${serverId}`);
      return true;
    } catch (_error) {
      console.error(
        `Error starting monitoring for server ${serverId}:`,
        _error
      );
      return false;
    }
  }

  // Get historical metrics for a server
  static async getHistoricalMetrics(
    serverId: string,
    hours: number = 24
  ): Promise<Metrics[]> {
    try {
      const limit = Math.min(hours * 120, 10000); // 120 data points per hour (every 30s), max 10k
      return await DatabaseService.getServerMetrics(serverId, limit);
    } catch (_error) {
      console.error('Error getting historical metrics:', _error);
      return [];
    }
  }

  // Get aggregated metrics for dashboard
  static async getAggregatedMetrics(serverId: string): Promise<{
    current: Metrics | null;
    averages: {
      cpu_usage_1h: number;
      memory_usage_1h: number;
      tps_1h: number;
      player_count_max_24h: number;
    };
  }> {
    try {
      const current = await this.getCurrentMetrics(serverId);
      const metrics24h = await this.getHistoricalMetrics(serverId, 24);
      const metrics1h = metrics24h.slice(0, 120); // Last hour

      const averages = {
        cpu_usage_1h: this.calculateAverage(metrics1h, 'cpu_usage'),
        memory_usage_1h: this.calculateAverage(metrics1h, 'memory_usage'),
        tps_1h: this.calculateAverage(metrics1h, 'tps'),
        player_count_max_24h: Math.max(
          ...metrics24h.map(m => m.player_count),
          0
        ),
      };

      return { current, averages };
    } catch (_error) {
      console.error('Error getting aggregated metrics:', _error);
      return {
        current: null,
        averages: {
          cpu_usage_1h: 0,
          memory_usage_1h: 0,
          tps_1h: 0,
          player_count_max_24h: 0,
        },
      };
    }
  }

  // Calculate average for a metric field
  private static calculateAverage(
    metrics: Metrics[],
    field: keyof Metrics
  ): number {
    const values = metrics
      .map(m => m[field])
      .filter(v => typeof v === 'number' && !isNaN(v)) as number[];

    if (values.length === 0) return 0;

    return (
      Math.round(
        (values.reduce((sum, val) => sum + val, 0) / values.length) * 100
      ) / 100
    );
  }

  // Get service status
  static getStatus(): { running: boolean; uptime?: number } {
    return {
      running: this.isRunning,
      uptime: this.isRunning ? Date.now() : undefined,
    };
  }

  // === PROMETHEUS INTEGRATION METHODS ===

  // Get monitoring configuration for a server
  static async getMonitoringConfig(
    serverId: string
  ): Promise<MonitoringConfig | null> {
    try {
      return await DatabaseService.getMonitoringConfig(serverId);
    } catch (_error) {
      console.error('Error getting monitoring config:', _error);
      return null;
    }
  }

  // Update monitoring configuration for a server
  static async updateMonitoringConfig(
    serverId: string,
    config: UpdateMonitoringConfigRequest
  ): Promise<MonitoringConfig | null> {
    try {
      console.log(
        'Updating monitoring config for server:',
        serverId,
        'with config:',
        config
      );
      const updated = await DatabaseService.updateMonitoringConfig(
        serverId,
        config
      );
      console.log('Database update result:', updated);

      // If prometheus was enabled, create/update prometheus target
      if (config.prometheus_enabled && updated) {
        console.log('Creating/updating prometheus target...');
        const fullConfig = await DatabaseService.getMonitoringConfig(serverId);
        if (fullConfig) {
          await this.createOrUpdatePrometheusTarget(serverId, fullConfig);
        }
      }

      // If prometheus was disabled, deactivate target
      if (config.prometheus_enabled === false) {
        console.log('Deactivating prometheus target...');
        await this.deactivatePrometheusTarget(serverId);
      }

      // Return the updated config from database
      const updatedConfig = await DatabaseService.getMonitoringConfig(serverId);
      console.log('Final updated config:', updatedConfig);
      return updatedConfig;
    } catch (_error) {
      console.error('Error updating monitoring config:', _error);
      throw _error; // Re-throw to see the full error in the API response
    }
  }

  // Create or update prometheus target for a server
  private static async createOrUpdatePrometheusTarget(
    serverId: string,
    config: MonitoringConfig
  ): Promise<void> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server || !server.container_id) {
        throw new Error('Server not found or not running');
      }

      // Get container info to determine the endpoint URL
      const containerInfo = await DockerService.getContainerInfo(
        server.container_id
      );
      if (!containerInfo) {
        throw new Error('Container info not available');
      }

      // Find the prometheus port mapping
      const prometheusPort = containerInfo.ports.find(
        p => p.private === config.prometheus_port
      )?.public;

      if (!prometheusPort) {
        throw new Error(
          `Prometheus port ${config.prometheus_port} not exposed`
        );
      }

      const endpointUrl = `http://localhost:${prometheusPort}/metrics`;

      const targetData = {
        server_id: serverId,
        endpoint_url: endpointUrl,
        job_name: 'minecraft-servers',
        labels: {
          server_id: serverId,
          server_name: server.name,
          server_type: server.type,
          mc_version: server.mc_version,
        },
        active: true,
      };

      await DatabaseService.createOrUpdatePrometheusTarget(targetData);
    } catch (_error) {
      console.error('Error creating prometheus target:', _error);
      throw _error;
    }
  }

  // Deactivate prometheus target for a server
  private static async deactivatePrometheusTarget(
    serverId: string
  ): Promise<void> {
    try {
      await DatabaseService.deactivatePrometheusTarget(serverId);
    } catch (_error) {
      console.error('Error deactivating prometheus target:', _error);
    }
  }

  // Get prometheus metrics for a server
  static async getPrometheusMetrics(
    serverId: string
  ): Promise<PrometheusResponse | null> {
    try {
      const config = await this.getMonitoringConfig(serverId);
      if (!config || !config.prometheus_enabled) {
        throw new Error('Prometheus not enabled for this server');
      }

      const target = await DatabaseService.getPrometheusTarget(serverId);
      if (!target || !target.active) {
        throw new Error('No active prometheus target found');
      }

      // Fetch metrics from prometheus endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(target.endpoint_url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const metrics = await response.text();

      // Update last scrape time
      await DatabaseService.updatePrometheusTargetLastScrape(target.id);

      return {
        metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting prometheus metrics:', error);
      return null;
    }
  }

  // Get all prometheus targets
  static async getAllPrometheusTargets(): Promise<PrometheusTarget[]> {
    try {
      return await DatabaseService.getAllPrometheusTargets();
    } catch (_error) {
      console.error('Error getting prometheus targets:', _error);
      return [];
    }
  }

  // Check prometheus endpoint health
  static async checkPrometheusHealth(serverId: string): Promise<{
    healthy: boolean;
    endpoint?: string;
    error?: string;
    response_time?: number;
  }> {
    try {
      const target = await DatabaseService.getPrometheusTarget(serverId);
      if (!target || !target.active) {
        return {
          healthy: false,
          error: 'No active prometheus target found',
        };
      }

      const startTime = Date.now();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(target.endpoint_url, {
          method: 'HEAD',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseTime = Date.now() - startTime;

        return {
          healthy: response.ok,
          endpoint: target.endpoint_url,
          response_time: responseTime,
          error: response.ok ? undefined : `HTTP ${response.status}`,
        };
      } catch (_fetchError) {
        return {
          healthy: false,
          endpoint: target.endpoint_url,
          response_time: Date.now() - startTime,
          error:
            _fetchError instanceof Error
              ? _fetchError.message
              : 'Unknown error',
        };
      }
    } catch (_error) {
      console.error('Error checking prometheus health:', _error);
      return {
        healthy: false,
        error: _error instanceof Error ? _error.message : 'Unknown error',
      };
    }
  }

  // Create metric alert
  static async createMetricAlert(
    serverId: string,
    alertType: string,
    metricName: string,
    threshold: number,
    currentValue: number,
    severity: 'info' | 'warning' | 'critical'
  ): Promise<void> {
    try {
      const alertData = {
        server_id: serverId,
        alert_type: alertType,
        metric_name: metricName,
        threshold,
        current_value: currentValue,
        severity,
        resolved: false,
      };

      await DatabaseService.createMetricAlert(alertData);
    } catch (_error) {
      console.error('Error creating metric alert:', _error);
    }
  }

  // Get active alerts for a server
  static async getActiveAlerts(serverId: string): Promise<MetricAlert[]> {
    try {
      return await DatabaseService.getActiveAlerts(serverId);
    } catch (_error) {
      console.error('Error getting active alerts:', _error);
      return [];
    }
  }

  // Resolve metric alert
  static async resolveAlert(alertId: string): Promise<void> {
    try {
      await DatabaseService.resolveAlert(alertId);
    } catch (_error) {
      console.error('Error resolving alert:', _error);
    }
  }
}
