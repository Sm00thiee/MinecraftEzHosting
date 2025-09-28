import { Router } from 'express';
import { DatabaseService } from '../services/database.js';
import { MonitoringService } from '../services/monitoring.js';
import {
  authenticateToken,
  requireAllowed,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

// Get current metrics for a server
router.get(
  '/:serverId/current',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const metrics = await MonitoringService.getCurrentMetrics(serverId);
      res.json({ success: true, data: { metrics } });
    } catch (error) {
      console.error('Error fetching current metrics:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch current metrics' });
    }
  }
);

// Get historical metrics for a server
router.get(
  '/:serverId/history',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const hours = parseInt(req.query.hours as string) || 24;
      const interval = (req.query.interval as string) || '5m';

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const metrics = await MonitoringService.getHistoricalMetrics(
        serverId,
        hours
      );
      res.json({ success: true, data: { metrics, hours, interval } });
    } catch (error) {
      console.error('Error fetching historical metrics:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch historical metrics' });
    }
  }
);

// Get aggregated metrics for a server
router.get(
  '/:serverId/aggregated',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const period = (req.query.period as string) || 'day';

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const metrics = await MonitoringService.getAggregatedMetrics(serverId);
      res.json({ success: true, data: { metrics, period } });
    } catch (error) {
      console.error('Error fetching aggregated metrics:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch aggregated metrics' });
    }
  }
);

// Get metrics for all servers (admin only)
router.get(
  '/all/current',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      // Only allow admins or return user's own servers
      let servers;
      if (req.user!.role === 'admin') {
        servers = await DatabaseService.getAllServers();
      } else {
        const allServers = await DatabaseService.getAllServers();
        servers = allServers.filter(server => server.owner_id === req.user!.id);
      }

      const allMetrics = await Promise.all(
        servers.map(async server => {
          try {
            const metrics = await MonitoringService.getCurrentMetrics(
              server.id
            );
            return {
              server_id: server.id,
              server_name: server.name,
              metrics,
            };
          } catch (error) {
            console.warn(
              `Failed to get metrics for server ${server.id}:`,
              error
            );
            return {
              server_id: server.id,
              server_name: server.name,
              metrics: null,
              error: 'Failed to fetch metrics',
            };
          }
        })
      );

      res.json({ success: true, data: { servers: allMetrics } });
    } catch (error) {
      console.error('Error fetching all current metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch metrics for all servers',
      });
    }
  }
);

// Start monitoring for a server
router.post(
  '/:serverId/start',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const success = await MonitoringService.startMonitoring(serverId);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to start monitoring' });
      }

      res.json({ success: true, message: 'Monitoring started successfully' });
    } catch (error) {
      console.error('Error starting monitoring:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to start monitoring' });
    }
  }
);

// Stop monitoring for a server
router.post(
  '/:serverId/stop',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const success = await MonitoringService.stopMonitoring(serverId);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to stop monitoring' });
      }

      res.json({ success: true, message: 'Monitoring stopped successfully' });
    } catch (error) {
      console.error('Error stopping monitoring:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to stop monitoring' });
    }
  }
);

// Get system-wide metrics (admin only)
router.get(
  '/system/overview',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user!.role !== 'admin') {
        return res
          .status(403)
          .json({ success: false, error: 'Admin access required' });
      }

      // Get total servers count
      const allServers = await DatabaseService.getAllServers();
      const runningServers = allServers.filter(s => s.status === 'running');

      // Get total users count
      const allUsers = await DatabaseService.getAllUsers();
      const allowedUsers = allUsers.filter(u => u.is_allowed);

      // Get recent metrics for system overview
      const systemMetrics = {
        total_servers: allServers.length,
        running_servers: runningServers.length,
        stopped_servers: allServers.length - runningServers.length,
        total_users: allUsers.length,
        allowed_users: allowedUsers.length,
        pending_users: allUsers.length - allowedUsers.length,
      };

      // Get aggregated resource usage
      let totalCpuUsage = 0;
      let totalMemoryUsage = 0;
      let totalDiskUsage = 0;
      let metricsCount = 0;

      for (const server of runningServers) {
        try {
          const metrics = await MonitoringService.getCurrentMetrics(server.id);
          if (metrics) {
            totalCpuUsage += metrics.cpu_usage || 0;
            totalMemoryUsage += metrics.memory_usage || 0;
            totalDiskUsage += metrics.disk_usage || 0;
            metricsCount++;
          }
        } catch (error) {
          console.warn(`Failed to get metrics for server ${server.id}:`, error);
        }
      }

      const resourceMetrics = {
        average_cpu_usage: metricsCount > 0 ? totalCpuUsage / metricsCount : 0,
        average_memory_usage:
          metricsCount > 0 ? totalMemoryUsage / metricsCount : 0,
        average_disk_usage:
          metricsCount > 0 ? totalDiskUsage / metricsCount : 0,
      };

      res.json({
        success: true,
        data: {
          system: systemMetrics,
          resources: resourceMetrics,
        },
      });
    } catch (error) {
      console.error('Error fetching system overview:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch system overview' });
    }
  }
);

// Get performance alerts for a server
router.get(
  '/:serverId/alerts',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const currentMetrics =
        await MonitoringService.getCurrentMetrics(serverId);
      const alerts = [];

      if (currentMetrics) {
        // Check for high CPU usage
        if (currentMetrics.cpu_usage && currentMetrics.cpu_usage > 80) {
          alerts.push({
            type: 'warning',
            metric: 'cpu_usage',
            value: currentMetrics.cpu_usage,
            threshold: 80,
            message: 'High CPU usage detected',
          });
        }

        // Check for high memory usage
        if (currentMetrics.memory_usage && currentMetrics.memory_usage > 85) {
          alerts.push({
            type: 'warning',
            metric: 'memory_usage',
            value: currentMetrics.memory_usage,
            threshold: 85,
            message: 'High memory usage detected',
          });
        }

        // Check for high disk usage
        if (currentMetrics.disk_usage && currentMetrics.disk_usage > 90) {
          alerts.push({
            type: 'critical',
            metric: 'disk_usage',
            value: currentMetrics.disk_usage,
            threshold: 90,
            message: 'Critical disk usage detected',
          });
        }

        // Check for low TPS (if available)
        if (currentMetrics.tps && currentMetrics.tps < 15) {
          alerts.push({
            type: 'warning',
            metric: 'tps',
            value: currentMetrics.tps,
            threshold: 15,
            message: 'Low server TPS detected',
          });
        }
      }

      res.json({ success: true, data: { alerts } });
    } catch (error) {
      console.error('Error fetching performance alerts:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch performance alerts' });
    }
  }
);

// === PROMETHEUS INTEGRATION ENDPOINTS ===

// Get monitoring configuration for a server
router.get(
  '/:serverId/monitoring/config',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const config = await MonitoringService.getMonitoringConfig(serverId);
      res.json({ success: true, data: { config } });
    } catch (error) {
      console.error('Error fetching monitoring config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch monitoring configuration',
      });
    }
  }
);

// Update monitoring configuration for a server
router.put(
  '/:serverId/monitoring/config',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const configUpdate = req.body;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Validate required fields
      if (configUpdate.prometheus_enabled && !configUpdate.prometheus_port) {
        return res.status(400).json({
          success: false,
          error: 'Prometheus port is required when enabling prometheus',
        });
      }

      const updatedConfig = await MonitoringService.updateMonitoringConfig(
        serverId,
        configUpdate
      );

      if (!updatedConfig) {
        return res.status(500).json({
          success: false,
          error: 'Failed to update monitoring configuration',
        });
      }

      res.json({ success: true, data: { config: updatedConfig } });
    } catch (error) {
      console.error('Error updating monitoring config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update monitoring configuration',
      });
    }
  }
);

// Get prometheus metrics for a server
router.get(
  '/:serverId/prometheus/metrics',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const prometheusData =
        await MonitoringService.getPrometheusMetrics(serverId);

      if (!prometheusData) {
        return res.status(404).json({
          success: false,
          error:
            'Prometheus metrics not available. Ensure prometheus is enabled for this server.',
        });
      }

      res.json({ success: true, data: prometheusData });
    } catch (error) {
      console.error('Error fetching prometheus metrics:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch prometheus metrics' });
    }
  }
);

// Proxy prometheus metrics (returns raw prometheus format)
router.get(
  '/:serverId/prometheus/raw',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res.status(404).send('Server not found');
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).send('Access denied');
      }

      const prometheusData =
        await MonitoringService.getPrometheusMetrics(serverId);

      if (!prometheusData) {
        return res.status(404).send('Prometheus metrics not available');
      }

      // Return raw prometheus metrics with proper content type
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(prometheusData.metrics);
    } catch (error) {
      console.error('Error proxying prometheus metrics:', error);
      res.status(500).send('Failed to fetch prometheus metrics');
    }
  }
);

// Get all prometheus targets (admin only)
router.get(
  '/prometheus/targets',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user!.role !== 'admin') {
        return res
          .status(403)
          .json({ success: false, error: 'Admin access required' });
      }

      const targets = await MonitoringService.getAllPrometheusTargets();
      res.json({ success: true, data: { targets } });
    } catch (error) {
      console.error('Error fetching prometheus targets:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch prometheus targets' });
    }
  }
);

// Check prometheus endpoint health
router.get(
  '/:serverId/prometheus/health',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const health = await MonitoringService.checkPrometheusHealth(serverId);
      res.json({ success: true, data: health });
    } catch (error) {
      console.error('Error checking prometheus health:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to check prometheus health' });
    }
  }
);

// Get active alerts for a server (enhanced with prometheus alerts)
router.get(
  '/:serverId/prometheus/alerts',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const alerts = await MonitoringService.getActiveAlerts(serverId);
      res.json({ success: true, data: { alerts } });
    } catch (error) {
      console.error('Error fetching prometheus alerts:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch prometheus alerts' });
    }
  }
);

// Resolve a metric alert
router.post(
  '/alerts/:alertId/resolve',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { alertId } = req.params;

      // For now, we'll allow users to resolve their own alerts
      // In a production system, you might want to add additional authorization checks

      await MonitoringService.resolveAlert(alertId);
      res.json({ success: true, message: 'Alert resolved successfully' });
    } catch (error) {
      console.error('Error resolving alert:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to resolve alert' });
    }
  }
);

export default router;
