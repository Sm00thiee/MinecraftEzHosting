import { Router } from 'express';
import { DatabaseService } from '../services/database.js';
import {
  authenticateToken,
  requireAllowed,
  requireAdmin,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

// Get all users (admin only)
router.get(
  '/users',
  authenticateToken,
  requireAllowed,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const users = await DatabaseService.getAllUsers();
      res.json({ success: true, data: { users } });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
  }
);

// Update user permissions (admin only)
router.patch(
  '/users/:userId',
  authenticateToken,
  requireAllowed,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const { is_allowed, role } = req.body;

      // Validate input
      if (is_allowed !== undefined && typeof is_allowed !== 'boolean') {
        return res
          .status(400)
          .json({ success: false, error: 'is_allowed must be a boolean' });
      }

      if (role !== undefined && !['admin', 'user'].includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'role must be either "admin" or "user"',
        });
      }

      // Update user permissions
      let success = true;

      if (is_allowed !== undefined) {
        success = await DatabaseService.updateUserAllowedStatus(
          userId,
          is_allowed,
          req.user!.id
        );
      }

      if (success && role !== undefined) {
        success = await DatabaseService.updateUserRole(
          userId,
          role,
          req.user!.id
        );
      }

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to update user permissions' });
      }

      res.json({
        success: true,
        message: 'User permissions updated successfully',
      });
    } catch (error) {
      console.error('Error updating user permissions:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to update user permissions' });
    }
  }
);

// Get audit logs (admin only)
router.get(
  '/audit-logs',
  authenticateToken,
  requireAllowed,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const auditLogs = await DatabaseService.getAuditLogs(limit, offset);
      res.json({ success: true, data: { logs: auditLogs } });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch audit logs' });
    }
  }
);

// Get system statistics (admin only)
router.get(
  '/stats',
  authenticateToken,
  requireAllowed,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await DatabaseService.getSystemStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('Error fetching system stats:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch system stats' });
    }
  }
);

export default router;
