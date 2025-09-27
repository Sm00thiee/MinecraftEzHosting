import { Router } from 'express';
import { AlertingService } from '../services/alerting.js';
import { DatabaseService } from '../services/database.js';
import {
  authenticateToken,
  requireAllowed,
  requireAdmin,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

// Get all alerts for a server
router.get(
  '/:serverId',
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

      const alerts = await AlertingService.getServerAlerts(serverId);
      res.json({ success: true, data: { alerts } });
    } catch (error) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
    }
  }
);

// Get alert rules for a server
router.get(
  '/:serverId/rules',
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

      const rules = await AlertingService.getServerAlertRules(serverId);
      res.json({ success: true, data: { rules } });
    } catch (error) {
      console.error('Error fetching alert rules:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch alert rules' });
    }
  }
);

// Create alert rule for a server
router.post(
  '/:serverId/rules',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const {
        type,
        enabled = true,
        threshold,
        duration_minutes = 5,
        cooldown_minutes = 30,
        severity = 'warning',
      } = req.body;

      if (!type || threshold === undefined) {
        return res
          .status(400)
          .json({ success: false, error: 'Type and threshold are required' });
      }

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

      const rule = await AlertingService.createAlertRule(
        serverId,
        {
          type,
          enabled,
          threshold,
          duration_minutes,
          cooldown_minutes,
          severity,
        },
        req.user!.id
      );

      res.json({ success: true, data: { rule } });
    } catch (error) {
      console.error('Error creating alert rule:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create alert rule',
      });
    }
  }
);

// Create default alert rules for a server
router.post(
  '/:serverId/rules/default',
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

      const rules = await AlertingService.createDefaultRules(
        serverId,
        req.user!.id
      );

      res.json({ success: true, data: { rules } });
    } catch (error) {
      console.error('Error creating default alert rules:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create default alert rules',
      });
    }
  }
);

// Trigger a manual alert (admin only)
router.post(
  '/:serverId/trigger',
  authenticateToken,
  requireAllowed,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const {
        type,
        severity,
        title,
        message,
        current_value,
        threshold,
        metadata,
      } = req.body;

      if (!type || !severity || !title || !message) {
        return res.status(400).json({
          success: false,
          error: 'Type, severity, title, and message are required',
        });
      }

      const alert = await AlertingService.triggerAlert(
        serverId,
        type,
        severity,
        title,
        message,
        current_value,
        threshold,
        metadata
      );

      res.json({ success: true, data: { alert } });
    } catch (error) {
      console.error('Error triggering alert:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to trigger alert',
      });
    }
  }
);

// Resolve an alert
router.patch(
  '/:serverId/alerts/:alertId/resolve',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId, alertId } = req.params;

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

      const success = await AlertingService.resolveAlert(alertId, req.user!.id);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to resolve alert' });
      }

      res.json({ success: true, message: 'Alert resolved successfully' });
    } catch (error) {
      console.error('Error resolving alert:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to resolve alert',
      });
    }
  }
);

// Get alerting service status (admin only)
router.get(
  '/system/status',
  authenticateToken,
  requireAllowed,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const status = AlertingService.getStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      console.error('Error getting alerting status:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to get alerting status' });
    }
  }
);

export default router;
