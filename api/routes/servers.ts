import { Router } from 'express';
import { DatabaseService } from '../services/database.js';
import { DockerService } from '../services/docker.js';
import { VersionResolver } from '../services/version-resolver.js';
import {
  authenticateToken,
  requireAllowed,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import type {
  CreateServerRequest,
  UpdateServerRequest,
  Server,
} from '../../shared/types.js';

const router = Router();

// Get available versions for a server type
router.get(
  '/versions/:serverType',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverType } = req.params;

      // Validate server type
      const validTypes = ['fabric', 'spigot', 'paper', 'bukkit'];
      if (!validTypes.includes(serverType)) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid server type. Must be one of: ' + validTypes.join(', '),
        });
      }

      const versionInfo = await VersionResolver.getVersions(
        serverType as Server['type']
      );
      res.json({ success: true, data: versionInfo });
    } catch (error) {
      console.error('Error fetching versions:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch versions' });
    }
  }
);

// Get all servers for the authenticated user
router.get(
  '/',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const servers = await DatabaseService.getServersByOwner(req.user!.id);
      res.json({ success: true, data: { servers } });
    } catch (error) {
      console.error('Error fetching servers:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch servers' });
    }
  }
);

// Get server by ID
router.get(
  '/:serverId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const server = await DatabaseService.getServerById(serverId);

      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      // Check ownership
      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      res.json({ success: true, data: { server } });
    } catch (error) {
      console.error('Error fetching server:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch server' });
    }
  }
);

// Create new server
router.post(
  '/',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const createRequest: CreateServerRequest = req.body;

      // Validate required fields
      if (
        !createRequest.name ||
        !createRequest.version ||
        !createRequest.server_type
      ) {
        return res.status(400).json({
          success: false,
          error: 'Name, version, and server_type are required',
        });
      }

      // Validate version
      const versionInfo = await VersionResolver.resolveVersion(
        createRequest.server_type,
        createRequest.version
      );

      if (!versionInfo) {
        return res.status(400).json({
          success: false,
          error: 'Invalid server type or version',
        });
      }

      // Create server in database
      const server = await DatabaseService.createServer({
        name: createRequest.name,
        type: createRequest.server_type,
        server_type: createRequest.server_type,
        mc_version: createRequest.version,
        owner_id: req.user!.id,
        machine_id: createRequest.machine_id,
        env_vars: createRequest.env_vars || {},
        resource_limits: createRequest.resource_limits || {},
        rcon_enabled: createRequest.rcon_enabled || false,
      });
      if (!server) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to create server' });
      }

      // Create Docker container
      const success = await DockerService.createServer(server);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to create Docker container' });
      }

      const updatedServer = await DatabaseService.getServerById(server.id);
      res.status(201).json({ success: true, data: { server: updatedServer } });
    } catch (error) {
      console.error('Error creating server:', error);
      console.error(
        'Error stack:',
        error instanceof Error ? error.stack : 'No stack trace'
      );
      console.error(
        'Error message:',
        error instanceof Error ? error.message : String(error)
      );
      res.status(500).json({
        success: false,
        error: 'Failed to create server',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Update server
router.patch(
  '/:serverId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const updateRequest: UpdateServerRequest = req.body;

      const server = await DatabaseService.getServerById(serverId);

      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      // Check ownership
      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const success = await DatabaseService.updateServer(
        serverId,
        updateRequest
      );

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to update server' });
      }

      const updatedServer = await DatabaseService.getServerById(serverId);
      res.json({ success: true, data: { server: updatedServer } });
    } catch (error) {
      console.error('Error updating server:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to update server' });
    }
  }
);

// Delete server
router.delete(
  '/:serverId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const server = await DatabaseService.getServerById(serverId);

      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      // Check ownership
      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Stop and remove container if it exists
      if (server.container_id) {
        try {
          await DockerService.stopServer(serverId);
          await DockerService.deleteServer(serverId);
        } catch (error) {
          console.warn('Error cleaning up container:', error);
        }
      }

      const success = await DatabaseService.deleteServer(serverId);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to delete server' });
      }

      res.json({ success: true, message: 'Server deleted successfully' });
    } catch (error) {
      console.error('Error deleting server:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to delete server' });
    }
  }
);

// Start server
router.post(
  '/:serverId/start',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const server = await DatabaseService.getServerById(serverId);

      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      // Check ownership
      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const success = await DockerService.startServer(serverId);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to start server' });
      }

      // Update status
      await DatabaseService.updateServer(serverId, { status: 'running' });

      res.json({ success: true, message: 'Server started successfully' });
    } catch (error) {
      console.error('Error starting server:', error);
      res.status(500).json({ success: false, error: 'Failed to start server' });
    }
  }
);

// Stop server
router.post(
  '/:serverId/stop',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const server = await DatabaseService.getServerById(serverId);

      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      // Check ownership
      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const success = await DockerService.stopServer(serverId);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to stop server' });
      }

      // Update status
      await DatabaseService.updateServer(serverId, { status: 'stopped' });

      res.json({ success: true, message: 'Server stopped successfully' });
    } catch (error) {
      console.error('Error stopping server:', error);
      res.status(500).json({ success: false, error: 'Failed to stop server' });
    }
  }
);

// Restart server
router.post(
  '/:serverId/restart',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const server = await DatabaseService.getServerById(serverId);

      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      // Check ownership
      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const success = await DockerService.restartServer(serverId);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to restart server' });
      }

      // Update status
      await DatabaseService.updateServer(serverId, { status: 'running' });

      res.json({ success: true, message: 'Server restarted successfully' });
    } catch (error) {
      console.error('Error restarting server:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to restart server' });
    }
  }
);

// Get server status
router.get(
  '/:serverId/status',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const server = await DatabaseService.getServerById(serverId);

      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      // Check ownership
      if (server.owner_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const containerInfo = await DockerService.getContainerInfo(serverId);

      res.json({
        success: true,
        data: {
          status: server.status,
          container: containerInfo,
        },
      });
    } catch (error) {
      console.error('Error getting server status:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to get server status' });
    }
  }
);

export default router;
