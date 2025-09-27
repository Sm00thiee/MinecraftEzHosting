import { DatabaseService } from './database.js';
import { MonitoringService } from './monitoring.js';
import type { Server, Metrics } from '../../shared/types.js';

export interface Alert {
  id: string;
  server_id: string;
  type:
    | 'server_crash'
    | 'high_memory'
    | 'high_cpu'
    | 'disk_full'
    | 'player_count_high'
    | 'custom';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  threshold?: number;
  current_value?: number;
  triggered_at: string;
  resolved_at?: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  server_id: string;
  type: Alert['type'];
  enabled: boolean;
  threshold: number;
  duration_minutes: number; // How long condition must persist before alerting
  cooldown_minutes: number; // Minimum time between alerts of same type
  severity: Alert['severity'];
  created_at: string;
  updated_at: string;
}

export class AlertingService {
  private static isRunning = false;
  private static checkInterval: NodeJS.Timeout | null = null;
  private static readonly CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
  private static lastAlerts: Map<string, number> = new Map(); // Track last alert times

  // Default alert rules
  private static readonly DEFAULT_RULES: Omit<
    AlertRule,
    'id' | 'server_id' | 'created_at' | 'updated_at'
  >[] = [
    {
      type: 'high_memory',
      enabled: true,
      threshold: 90, // 90% memory usage
      duration_minutes: 5,
      cooldown_minutes: 30,
      severity: 'warning',
    },
    {
      type: 'high_cpu',
      enabled: true,
      threshold: 95, // 95% CPU usage
      duration_minutes: 10,
      cooldown_minutes: 15,
      severity: 'warning',
    },
    {
      type: 'disk_full',
      enabled: true,
      threshold: 95, // 95% disk usage
      duration_minutes: 1,
      cooldown_minutes: 60,
      severity: 'critical',
    },
  ];

  // Start alerting service
  static start(): void {
    if (this.isRunning) {
      console.log('Alerting service is already running');
      return;
    }

    console.log('Starting alerting service...');

    this.checkInterval = setInterval(async () => {
      await this.checkAlerts();
    }, this.CHECK_INTERVAL_MS);

    this.isRunning = true;
    console.log('Alerting service started - checking alerts every minute');
  }

  // Stop alerting service
  static stop(): void {
    if (!this.isRunning) {
      console.log('Alerting service is not running');
      return;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;
    console.log('Alerting service stopped');
  }

  // Create alert rule for a server
  static async createAlertRule(
    serverId: string,
    rule: Omit<AlertRule, 'id' | 'server_id' | 'created_at' | 'updated_at'>,
    actorUserId: string
  ): Promise<AlertRule> {
    try {
      const ruleId = `rule_${serverId}_${rule.type}_${Date.now()}`;
      const alertRule: AlertRule = {
        id: ruleId,
        server_id: serverId,
        ...rule,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Save to database (placeholder - would use actual DB table)
      await this.saveAlertRule(alertRule);

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: actorUserId,
        action: 'alert_rule_created',
        target_type: 'server',
        target_id: serverId,
        metadata: {
          rule_id: ruleId,
          rule_type: rule.type,
          threshold: rule.threshold,
        },
      });

      console.log(`Alert rule created for server ${serverId}: ${rule.type}`);
      return alertRule;
    } catch (error) {
      console.error('Error creating alert rule:', error);
      throw error;
    }
  }

  // Create default alert rules for a new server
  static async createDefaultRules(
    serverId: string,
    actorUserId: string
  ): Promise<AlertRule[]> {
    try {
      const rules: AlertRule[] = [];

      for (const defaultRule of this.DEFAULT_RULES) {
        const rule = await this.createAlertRule(
          serverId,
          defaultRule,
          actorUserId
        );
        rules.push(rule);
      }

      return rules;
    } catch (error) {
      console.error('Error creating default alert rules:', error);
      throw error;
    }
  }

  // Get alert rules for a server
  static async getServerAlertRules(serverId: string): Promise<AlertRule[]> {
    try {
      // In a real implementation, this would query a database table
      return await this.loadAlertRulesFromStorage(serverId);
    } catch (error) {
      console.error('Error getting server alert rules:', error);
      return [];
    }
  }

  // Get active alerts for a server
  static async getServerAlerts(serverId: string): Promise<Alert[]> {
    try {
      // In a real implementation, this would query a database table
      return await this.loadAlertsFromStorage(serverId);
    } catch (error) {
      console.error('Error getting server alerts:', error);
      return [];
    }
  }

  // Trigger an alert
  static async triggerAlert(
    serverId: string,
    type: Alert['type'],
    severity: Alert['severity'],
    title: string,
    message: string,
    currentValue?: number,
    threshold?: number,
    metadata?: Record<string, any>
  ): Promise<Alert> {
    try {
      // Check cooldown
      const cooldownKey = `${serverId}_${type}`;
      const lastAlert = this.lastAlerts.get(cooldownKey);
      const now = Date.now();

      if (lastAlert && now - lastAlert < 15 * 60 * 1000) {
        // 15 minute default cooldown
        console.log(
          `Alert ${type} for server ${serverId} is in cooldown, skipping`
        );
        throw new Error('Alert is in cooldown period');
      }

      const alertId = `alert_${serverId}_${type}_${Date.now()}`;
      const alert: Alert = {
        id: alertId,
        server_id: serverId,
        type,
        severity,
        title,
        message,
        threshold,
        current_value: currentValue,
        triggered_at: new Date().toISOString(),
        metadata,
      };

      // Save alert
      await this.saveAlert(alert);

      // Update last alert time
      this.lastAlerts.set(cooldownKey, now);

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: 'system',
        action: 'alert_triggered',
        target_type: 'server',
        target_id: serverId,
        metadata: {
          alert_id: alertId,
          alert_type: type,
          severity,
          current_value: currentValue,
          threshold,
        },
      });

      console.log(`Alert triggered for server ${serverId}: ${title}`);
      return alert;
    } catch (error) {
      console.error('Error triggering alert:', error);
      throw error;
    }
  }

  // Resolve an alert
  static async resolveAlert(
    alertId: string,
    actorUserId?: string
  ): Promise<boolean> {
    try {
      const alert = await this.getAlertById(alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      if (alert.resolved_at) {
        console.log(`Alert ${alertId} is already resolved`);
        return true;
      }

      // Update alert
      alert.resolved_at = new Date().toISOString();
      await this.saveAlert(alert);

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: actorUserId || 'system',
        action: 'alert_resolved',
        target_type: 'server',
        target_id: alert.server_id,
        metadata: {
          alert_id: alertId,
          alert_type: alert.type,
        },
      });

      console.log(`Alert resolved: ${alertId}`);
      return true;
    } catch (error) {
      console.error('Error resolving alert:', error);
      return false;
    }
  }

  // Check for alerts
  private static async checkAlerts(): Promise<void> {
    try {
      // Get all running servers
      const servers = await DatabaseService.getAllServers();
      const runningServers = servers.filter(s => s.status === 'running');

      for (const server of runningServers) {
        await this.checkServerAlerts(server.id);
      }
    } catch (error) {
      console.error('Error checking alerts:', error);
    }
  }

  // Check alerts for a specific server
  private static async checkServerAlerts(serverId: string): Promise<void> {
    try {
      // Get current metrics
      const metrics = await MonitoringService.getCurrentMetrics(serverId);
      if (!metrics) {
        // Check if server crashed
        await this.checkServerCrash(serverId);
        return;
      }

      // Get alert rules for this server
      const rules = await this.getServerAlertRules(serverId);

      for (const rule of rules) {
        if (!rule.enabled) continue;

        await this.evaluateRule(rule, metrics);
      }
    } catch (error) {
      console.error(`Error checking alerts for server ${serverId}:`, error);
    }
  }

  // Evaluate a specific alert rule
  private static async evaluateRule(
    rule: AlertRule,
    metrics: Metrics
  ): Promise<void> {
    try {
      let shouldAlert = false;
      let currentValue: number | undefined;
      let message = '';

      switch (rule.type) {
        case 'high_memory':
          if (metrics.memory_usage && metrics.memory_limit) {
            currentValue = (metrics.memory_usage / metrics.memory_limit) * 100;
            shouldAlert = currentValue > rule.threshold;
            message = `Memory usage is ${currentValue.toFixed(1)}% (threshold: ${rule.threshold}%)`;
          }
          break;

        case 'high_cpu':
          if (metrics.cpu_usage) {
            currentValue = metrics.cpu_usage;
            shouldAlert = currentValue > rule.threshold;
            message = `CPU usage is ${currentValue.toFixed(1)}% (threshold: ${rule.threshold}%)`;
          }
          break;

        case 'disk_full':
          if (metrics.disk_usage) {
            currentValue = metrics.disk_usage;
            shouldAlert = currentValue > rule.threshold;
            message = `Disk usage is ${currentValue.toFixed(1)}% (threshold: ${rule.threshold}%)`;
          }
          break;

        case 'player_count_high':
          if (metrics.player_count !== undefined) {
            currentValue = metrics.player_count;
            shouldAlert = currentValue > rule.threshold;
            message = `Player count is ${currentValue} (threshold: ${rule.threshold})`;
          }
          break;
      }

      if (shouldAlert) {
        await this.triggerAlert(
          rule.server_id,
          rule.type,
          rule.severity,
          `${rule.type.replace('_', ' ').toUpperCase()} Alert`,
          message,
          currentValue,
          rule.threshold,
          { rule_id: rule.id }
        );
      }
    } catch (error) {
      console.error('Error evaluating alert rule:', error);
    }
  }

  // Check if server has crashed
  private static async checkServerCrash(serverId: string): Promise<void> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) return;

      // If server status is 'error' or container is not running, it might have crashed
      if (server.status === 'error') {
        await this.triggerAlert(
          serverId,
          'server_crash',
          'critical',
          'Server Crash Detected',
          `Server ${server.name} has crashed and is in error state`,
          undefined,
          undefined,
          { server_name: server.name }
        );
      }
    } catch (error) {
      console.error('Error checking server crash:', error);
    }
  }

  // Private helper methods
  private static async saveAlertRule(rule: AlertRule): Promise<void> {
    // In a real implementation, this would save to database
    console.log(`Saving alert rule: ${rule.id}`);
  }

  private static async saveAlert(alert: Alert): Promise<void> {
    // In a real implementation, this would save to database
    console.log(`Saving alert: ${alert.id}`);
  }

  private static async loadAlertRulesFromStorage(
    serverId: string
  ): Promise<AlertRule[]> {
    // Placeholder implementation - would load from database
    return [];
  }

  private static async loadAlertsFromStorage(
    serverId: string
  ): Promise<Alert[]> {
    // Placeholder implementation - would load from database
    return [];
  }

  private static async getAlertById(alertId: string): Promise<Alert | null> {
    // Placeholder implementation - would load from database
    return null;
  }

  // Get alerting service status
  static getStatus(): {
    running: boolean;
    last_check?: string;
    active_alerts: number;
    alert_rules: number;
  } {
    return {
      running: this.isRunning,
      last_check: new Date().toISOString(),
      active_alerts: 0, // Would count from database
      alert_rules: 0, // Would count from database
    };
  }
}
