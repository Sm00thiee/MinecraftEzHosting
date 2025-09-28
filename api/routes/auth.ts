import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { DatabaseService } from '../services/database.js';
import {
  authenticateToken,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

// Google OAuth callback - handle user creation/update
router.post('/callback', async (req, res) => {
  try {
    const { access_token, refresh_token } = req.body;

    if (!access_token) {
      return res
        .status(400)
        .json({ success: false, error: 'Access token required' });
    }

    // Get user from Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(access_token);

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // Check if user exists in our database
    let dbUser = await DatabaseService.getUserById(user.id);

    if (!dbUser) {
      // Create new user - not allowed by default
      const { error: insertError } = await supabaseAdmin.from('users').insert({
        id: user.id,
        email: user.email!,
        is_allowed: false,
        role: 'user',
      });

      if (insertError) {
        console.error('Error creating user:', insertError);
        return res
          .status(500)
          .json({ success: false, error: 'Failed to create user' });
      }

      dbUser = await DatabaseService.getUserById(user.id);
    } else {
      // Update last login
      await supabaseAdmin
        .from('users')
        .update({
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    }

    if (!dbUser) {
      return res
        .status(500)
        .json({ success: false, error: 'Failed to retrieve user' });
    }

    res.json({
      success: true,
      data: {
        user: dbUser,
        access_token,
        refresh_token,
      },
    });
  } catch (error) {
    console.error('Auth callback error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: { user: req.user },
  });
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res
        .status(400)
        .json({ success: false, error: 'Refresh token required' });
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      return res
        .status(401)
        .json({ success: false, error: 'Invalid refresh token' });
    }

    res.json({
      success: true,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
});

// Logout
router.post(
  '/logout',
  authenticateToken,
  async (req: AuthenticatedRequest, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (token) {
        // Note: Supabase admin signOut doesn't require token parameter
        // The token invalidation happens on the client side
      }

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ success: false, error: 'Logout failed' });
    }
  }
);

// Get users (moved to admin routes)
// router.get('/users', authenticateToken, requireAllowed, requireAdmin, async (req: AuthenticatedRequest, res) => {
//   try {
//     const users = await DatabaseService.getAllUsers()
//     res.json({ success: true, data: { users } })
//   } catch (error) {
//     console.error('Error fetching users:', error)
//     res.status(500).json({ success: false, error: 'Failed to fetch users' })
//   }
// })

// Update user allowed status (moved to admin routes)
// router.patch('/users/:userId/allowed', authenticateToken, requireAllowed, requireAdmin, async (req: AuthenticatedRequest, res) => {
//   try {
//     const { userId } = req.params
//     const { is_allowed } = req.body

//     if (typeof is_allowed !== 'boolean') {
//       return res.status(400).json({ success: false, error: 'is_allowed must be a boolean' })
//     }

//     const success = await DatabaseService.updateUserAllowedStatus(userId, is_allowed, req.user!.id)

//     if (!success) {
//       return res.status(500).json({ success: false, error: 'Failed to update user status' })
//     }

//     res.json({ success: true, message: 'User status updated successfully' })
//   } catch (error) {
//     console.error('Error updating user status:', error)
//     res.status(500).json({ success: false, error: 'Failed to update user status' })
//   }
// })

// Get audit logs (moved to admin routes)
// router.get('/audit-logs', authenticateToken, requireAllowed, requireAdmin, async (req: AuthenticatedRequest, res) => {
//   try {
//     const limit = parseInt(req.query.limit as string) || 100
//     const auditLogs = await DatabaseService.getAuditLogs(limit)
//     res.json({ success: true, data: { logs: auditLogs } })
//   } catch (error) {
//     console.error('Error fetching audit logs:', error)
//     res.status(500).json({ success: false, error: 'Failed to fetch audit logs' })
//   }
// })

export default router;
