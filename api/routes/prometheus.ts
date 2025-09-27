import { Router } from 'express';
import { PrometheusExporterService } from '../services/prometheus-exporter.js';
import { DatabaseService } from '../services/database.js';
import {
  authenticateToken,
  requireAllowed,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

// Get Prometheus metrics for a server
router.get('/:serverId/metrics', async (req, res) => {
  try {
    const { serverId } = req.params;

    // Check if server exists and has Prometheus enabled
    const server = await DatabaseService.getServerById(serverId);
    if (!server) {
      return res.status(404).send('# Server not found\n');
    }

    // Generate Prometheus metrics
    const metrics = await PrometheusExporterService.generateMetrics(serverId);

    // Set proper content type for Prometheus
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    console.error(
      `Error generating Prometheus metrics for server ${req.params.serverId}:`,
      error
    );

    // Return error in Prometheus comment format
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res
      .status(500)
      .send(
        `# Error generating metrics: ${error instanceof Error ? error.message : 'Unknown error'}\n`
      );
  }
});

// Get metrics endpoint configuration for a server (authenticated)
router.get(
  '/:serverId/endpoint',
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

      const endpoint =
        await PrometheusExporterService.getMetricsEndpoint(serverId);

      if (!endpoint) {
        return res.status(404).json({
          success: false,
          error: 'Prometheus not enabled for this server',
        });
      }

      res.json({
        success: true,
        data: {
          endpoint: endpoint.endpoint,
          port: endpoint.port,
          full_url: `http://localhost:${endpoint.port}${endpoint.endpoint}`,
        },
      });
    } catch (error) {
      console.error('Error getting metrics endpoint:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to get metrics endpoint' });
    }
  }
);

// Validate monitoring configuration (authenticated)
router.post(
  '/:serverId/validate-config',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const config = req.body;

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

      const validation =
        await PrometheusExporterService.validateConfiguration(config);

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      console.error('Error validating configuration:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to validate configuration' });
    }
  }
);

// Get recommended configuration (authenticated)
router.get(
  '/:serverId/recommended-config',
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

      const recommendedConfig =
        PrometheusExporterService.getRecommendedConfiguration();

      res.json({
        success: true,
        data: recommendedConfig,
      });
    } catch (error) {
      console.error('Error getting recommended configuration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get recommended configuration',
      });
    }
  }
);

export default router;
