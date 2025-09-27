import { Router } from 'express';
import { BackupService } from '../services/backup.js';
import { DatabaseService } from '../services/database.js';
import {
  authenticateToken,
  requireAllowed,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

// Get all backups for a server
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

      const backups = await BackupService.getServerBackups(serverId);
      res.json({ success: true, data: { backups } });
    } catch (error) {
      console.error('Error fetching backups:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch backups' });
    }
  }
);

// Create a new backup
router.post(
  '/:serverId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const {
        name,
        description,
        includePlugins = true,
        includeConfig = true,
      } = req.body;

      if (!name || name.trim().length === 0) {
        return res
          .status(400)
          .json({ success: false, error: 'Backup name is required' });
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

      const backup = await BackupService.createBackup(
        serverId,
        name.trim(),
        description?.trim(),
        includePlugins,
        includeConfig
      );

      res.json({ success: true, data: { backup } });
    } catch (error) {
      console.error('Error creating backup:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to create backup',
      });
    }
  }
);

// Restore from backup
router.post(
  '/:serverId/restore/:backupId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId, backupId } = req.params;
      const {
        restoreWorld = true,
        restorePlugins = true,
        restoreConfig = true,
      } = req.body;

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

      const success = await BackupService.restoreBackup(serverId, backupId, {
        restoreWorld,
        restorePlugins,
        restoreConfig,
      });

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to restore backup' });
      }

      res.json({ success: true, message: 'Backup restored successfully' });
    } catch (error) {
      console.error('Error restoring backup:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to restore backup',
      });
    }
  }
);

// Delete a backup
router.delete(
  '/:serverId/:backupId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId, backupId } = req.params;

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

      const success = await BackupService.deleteBackup(backupId, req.user!.id);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to delete backup' });
      }

      res.json({ success: true, message: 'Backup deleted successfully' });
    } catch (error) {
      console.error('Error deleting backup:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to delete backup' });
    }
  }
);

// Cleanup old backups
router.post(
  '/:serverId/cleanup',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const { keepCount = 10 } = req.body;

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

      const deletedCount = await BackupService.cleanupOldBackups(
        serverId,
        keepCount
      );

      res.json({
        success: true,
        message: `Cleaned up ${deletedCount} old backups`,
        data: { deletedCount },
      });
    } catch (error) {
      console.error('Error cleaning up backups:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to cleanup backups' });
    }
  }
);

export default router;
