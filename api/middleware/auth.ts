import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { DatabaseService } from '../services/database.js';
import type { User } from '../../shared/types.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

// Verify JWT token and attach user to request
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res
        .status(401)
        .json({ success: false, error: 'Access token required' });
    }

    // Verify the JWT token with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res
        .status(401)
        .json({ success: false, error: 'Invalid or expired token' });
    }

    // Get user from our database
    const dbUser = await DatabaseService.getUserById(user.id);

    if (!dbUser) {
      return res
        .status(401)
        .json({ success: false, error: 'User not found in database' });
    }

    req.user = dbUser;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res
      .status(401)
      .json({ success: false, error: 'Authentication failed' });
  }
};

// Check if user is allowed to access the system
export const requireAllowed = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, error: 'Authentication required' });
  }

  if (!req.user.is_allowed) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Your account is not allowed to use this system.',
    });
  }

  next();
};

// Check if user is admin
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
  }

  next();
};

// Check if user owns the server or is admin
export const requireServerOwnership = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, error: 'Authentication required' });
    }

    const serverId = req.params.serverId || req.params.id;

    if (!serverId) {
      return res
        .status(400)
        .json({ success: false, error: 'Server ID required' });
    }

    // Admin can access any server
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user owns the server
    const server = await DatabaseService.getServerById(serverId);

    if (!server) {
      return res
        .status(404)
        .json({ success: false, error: 'Server not found' });
    }

    if (server.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to access this server',
      });
    }

    next();
  } catch (error) {
    console.error('Server ownership check error:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Authorization check failed' });
  }
};

// Bootstrap admin user if no admin exists
export const bootstrapAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;

    if (!adminEmail) {
      console.log('No admin bootstrap email configured');
      return;
    }

    // Check if any admin exists
    const { data: existingAdmins, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .limit(1);

    if (error) {
      console.error('Error checking for existing admins:', error);
      return;
    }

    if (existingAdmins && existingAdmins.length > 0) {
      console.log('Admin user already exists');
      return;
    }

    // Check if bootstrap user exists
    const bootstrapUser = await DatabaseService.getUserByEmail(adminEmail);

    if (bootstrapUser) {
      // Promote existing user to admin
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          role: 'admin',
          is_allowed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bootstrapUser.id);

      if (updateError) {
        console.error('Error promoting user to admin:', updateError);
      } else {
        console.log(`Promoted user ${adminEmail} to admin`);
      }
    } else {
      console.log(
        `Bootstrap admin user ${adminEmail} not found in database. User must sign in first.`
      );
    }
  } catch (error) {
    console.error('Admin bootstrap error:', error);
  }
};
