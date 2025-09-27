import { Router } from 'express';
import { SchedulerService } from '../services/scheduler.js';
import { DatabaseService } from '../services/database.js';
import {
  authenticateToken,
  requireAllowed,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

// Get all scheduled tasks for a server
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

      const tasks = await SchedulerService.getServerTasks(serverId);
      res.json({ success: true, data: { tasks } });
    } catch (error) {
      console.error('Error fetching scheduled tasks:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch scheduled tasks' });
    }
  }
);

// Schedule a server restart
router.post(
  '/:serverId/restart',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const { cron_expression, warning_minutes = 5 } = req.body;

      if (!cron_expression) {
        return res
          .status(400)
          .json({ success: false, error: 'Cron expression is required' });
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

      const task = await SchedulerService.scheduleRestart(
        serverId,
        cron_expression,
        warning_minutes,
        req.user!.id
      );

      res.json({ success: true, data: { task } });
    } catch (error) {
      console.error('Error scheduling restart:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to schedule restart',
      });
    }
  }
);

// Schedule a server backup
router.post(
  '/:serverId/backup',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const { cron_expression, name_template = 'Scheduled backup {date}' } =
        req.body;

      if (!cron_expression) {
        return res
          .status(400)
          .json({ success: false, error: 'Cron expression is required' });
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

      const task = await SchedulerService.scheduleBackup(
        serverId,
        cron_expression,
        name_template,
        req.user!.id
      );

      res.json({ success: true, data: { task } });
    } catch (error) {
      console.error('Error scheduling backup:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to schedule backup',
      });
    }
  }
);

// Update a scheduled task
router.patch(
  '/:serverId/tasks/:taskId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId, taskId } = req.params;
      const updates = req.body;

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

      const success = await SchedulerService.updateTask(
        taskId,
        updates,
        req.user!.id
      );

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to update scheduled task' });
      }

      res.json({
        success: true,
        message: 'Scheduled task updated successfully',
      });
    } catch (error) {
      console.error('Error updating scheduled task:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update scheduled task',
      });
    }
  }
);

// Delete a scheduled task
router.delete(
  '/:serverId/tasks/:taskId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId, taskId } = req.params;

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

      const success = await SchedulerService.deleteTask(taskId, req.user!.id);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to delete scheduled task' });
      }

      res.json({
        success: true,
        message: 'Scheduled task deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting scheduled task:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to delete scheduled task' });
    }
  }
);

// Get scheduler status (admin only)
router.get(
  '/status',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user!.role !== 'admin') {
        return res
          .status(403)
          .json({ success: false, error: 'Admin access required' });
      }

      const status = SchedulerService.getStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      console.error('Error getting scheduler status:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to get scheduler status' });
    }
  }
);

export default router;
