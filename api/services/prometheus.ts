import axios from 'axios';
import { PrometheusMetric, PrometheusResponse } from '../../shared/types.js';
import { DatabaseService } from './database.js';

export class PrometheusService {
  private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds
  private static readonly RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY = 1000; // 1 second

  /**
   * Scrape metrics from a prometheus exporter endpoint
   */
  static async scrapeMetrics(
    url: string,
    timeout?: number
  ): Promise<PrometheusResponse> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const startTime = Date.now();

    try {
      const response = await axios.get(url, {
        timeout: timeout || this.DEFAULT_TIMEOUT,
        headers: {
          Accept: 'text/plain',
          'User-Agent': 'MC-Server-Management/1.0',
        },
      });

      const metrics = response.data;

      return {
        metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _error
    ) {
      return {
        metrics: '',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Scrape metrics with retry logic
   */
  static async scrapeMetricsWithRetry(
    url: string,
    timeout?: number
  ): Promise<PrometheusResponse> {
    for (let attempt = 1; attempt <= this.RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await this.scrapeMetrics(url, timeout);
        if (result.metrics) {
          return result;
        }
      } catch (error) {
        console.error(`Attempt ${attempt} failed for ${url}:`, error);
      }

      // Don't wait after the last attempt
      if (attempt < this.RETRY_ATTEMPTS) {
        await this.delay(this.RETRY_DELAY * attempt);
      }
    }

    // Return empty response after all attempts failed
    return {
      metrics: '',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Scrape metrics from all active prometheus targets
   */
  static async scrapeAllTargets(): Promise<PrometheusResponse[]> {
    try {
      // Get all active prometheus targets from database
      const targets = await DatabaseService.getPrometheusTargets();

      const scrapePromises = targets.map(target =>
        this.scrapeMetricsWithRetry(target.endpoint, target.scrape_timeout)
      );

      const results = await Promise.allSettled(scrapePromises);

      return results.map(
        (
          result,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          _index
        ) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            return {
              metrics: '',
              timestamp: new Date().toISOString(),
            };
          }
        }
      );
    } catch (error) {
      console.error('Error scraping all targets:', error);
      return [];
    }
  }

  /**
   * Scrape metrics for a specific server
   */
  static async scrapeServerMetrics(
    serverId: string
  ): Promise<PrometheusResponse | null> {
    try {
      // Get prometheus target for this server
      const target =
        await DatabaseService.getPrometheusTargetByServerId(serverId);

      if (!target) {
        return null;
      }

      return await this.scrapeMetricsWithRetry(
        target.endpoint,
        target.scrape_timeout
      );
    } catch (error) {
      console.error(`Error scraping metrics for server ${serverId}:`, error);
      return null;
    }
  }

  /**
   * Parse prometheus metrics format into structured data
   */
  private static parsePrometheusMetrics(data: string): PrometheusMetric[] {
    const metrics: PrometheusMetric[] = [];
    const lines = data.split('\n');

    let currentMetric: Partial<PrometheusMetric> = {};

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) continue;

      // Handle comments (HELP and TYPE)
      if (trimmedLine.startsWith('#')) {
        const parts = trimmedLine.split(' ');
        if (parts.length >= 3) {
          const directive = parts[1];
          const metricName = parts[2];

          if (directive === 'HELP') {
            currentMetric = {
              name: metricName,
              help: parts.slice(3).join(' '),
            };
          } else if (directive === 'TYPE') {
            if (currentMetric.name === metricName) {
              currentMetric.type = parts[3] as
                | 'counter'
                | 'gauge'
                | 'histogram'
                | 'summary';
            }
          }
        }
        continue;
      }

      // Parse metric line
      const metricMatch = trimmedLine.match(
        /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([+-]?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)(?:\s+([0-9]+))?$/
      );

      if (metricMatch) {
        const [, name, labelsStr, value, timestamp] = metricMatch;

        // Parse labels
        const labels: Record<string, string> = {};
        if (labelsStr) {
          const labelMatches = labelsStr
            .slice(1, -1)
            .matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g);
          for (const labelMatch of labelMatches) {
            labels[labelMatch[1]] = labelMatch[2];
          }
        }

        const metric: PrometheusMetric = {
          name,
          value: parseFloat(value),
          labels,
          timestamp: timestamp ? parseInt(timestamp) * 1000 : Date.now(),
          help: currentMetric.name === name ? currentMetric.help : undefined,
          type: currentMetric.name === name ? currentMetric.type : 'gauge',
        };

        metrics.push(metric);
      }
    }

    return metrics;
  }

  /**
   * Filter metrics by name pattern
   */
  static filterMetrics(
    metrics: PrometheusMetric[],
    pattern: string
  ): PrometheusMetric[] {
    const regex = new RegExp(pattern);
    return metrics.filter(metric => regex.test(metric.name));
  }

  /**
   * Get metrics by type
   */
  static getMetricsByType(
    metrics: PrometheusMetric[],
    type: 'counter' | 'gauge' | 'histogram' | 'summary'
  ): PrometheusMetric[] {
    return metrics.filter(metric => metric.type === type);
  }

  /**
   * Aggregate metrics by name (sum values)
   */
  static aggregateMetrics(metrics: PrometheusMetric[]): Map<string, number> {
    const aggregated = new Map<string, number>();

    for (const metric of metrics) {
      const current = aggregated.get(metric.name) || 0;
      aggregated.set(metric.name, current + metric.value);
    }

    return aggregated;
  }

  /**
   * Convert prometheus metrics to our internal metrics format
   */
  static convertToInternalMetrics(
    prometheusMetrics: PrometheusMetric[],
    serverId: string
  ) {
    const metrics = {
      serverId,
      timestamp: new Date().toISOString(),
      cpu: 0,
      memory: 0,
      disk: 0,
      network: { rx: 0, tx: 0 },
      players: { online: 0, max: 0 },
      tps: 20.0,
      mspt: 0,
    };

    // Map prometheus metrics to our internal format
    for (const metric of prometheusMetrics) {
      switch (metric.name) {
        case 'minecraft_players_online':
          metrics.players.online = metric.value;
          break;
        case 'minecraft_players_max':
          metrics.players.max = metric.value;
          break;
        case 'minecraft_tps':
          metrics.tps = metric.value;
          break;
        case 'minecraft_mspt':
          metrics.mspt = metric.value;
          break;
        case 'process_cpu_usage':
          metrics.cpu = metric.value * 100; // Convert to percentage
          break;
        case 'jvm_memory_used_bytes':
          if (metric.labels?.area === 'heap') {
            metrics.memory = metric.value;
          }
          break;
      }
    }

    return metrics;
  }

  /**
   * Health check for prometheus endpoint
   */
  static async healthCheck(
    url: string
  ): Promise<{ healthy: boolean; responseTime: number; error?: string }> {
    const startTime = Date.now();

    try {
      await axios.get(url, {
        timeout: 5000,
        headers: {
          Accept: 'text/plain',
          'User-Agent': 'MC-Server-Management/1.0',
        },
      });

      return {
        healthy: true,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Utility method for delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
