import { Router } from 'express';
import path from 'path';
import { DatabaseService } from '../services/database.js';
import { DockerService } from '../services/docker.js';
import { FileAccessService } from '../services/file-access.js';
import {
  authenticateToken,
  requireAllowed,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

// Get server logs from database
router.get(
  '/:serverId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const level = req.query.level as string;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.user_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const logs = await DatabaseService.getServerLogs(serverId, limit, level);
      res.json({ success: true, data: { logs } });
    } catch (error) {
      console.error('Error fetching logs:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch logs' });
    }
  }
);

// Get live container logs
router.get(
  '/:serverId/live',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const lines = parseInt(req.query.lines as string) || 100;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.user_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const logs = await DockerService.getContainerLogs(serverId, lines);
      res.json({ success: true, data: { logs } });
    } catch (error) {
      console.error('Error fetching live logs:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to fetch live logs' });
    }
  }
);

// Stream live logs via Server-Sent Events
router.get(
  '/:serverId/stream',
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

      if (server.user_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Send initial connection event
      res.write('data: {"type":"connected"}\n\n');

      // Set up log streaming
      const logStream = await DockerService.streamContainerLogs(serverId);

      if (!logStream) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to create log stream' });
      }

      logStream.on('data', (chunk: Buffer) => {
        const logLine = chunk.toString().trim();
        if (logLine) {
          res.write(
            `data: ${JSON.stringify({ type: 'log', message: logLine })}\n\n`
          );
        }
      });

      logStream.on('error', error => {
        console.error('Log stream error:', error);
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: 'Log stream error' })}\n\n`
        );
      });

      // Handle client disconnect
      req.on('close', () => {
        if (
          logStream &&
          'destroy' in logStream &&
          typeof logStream.destroy === 'function'
        ) {
          logStream.destroy();
        }
      });
    } catch (error) {
      console.error('Error setting up log stream:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to set up log stream' });
    }
  }
);

// Get log files list
router.get(
  '/:serverId/files',
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

      if (server.user_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const logFiles = await FileAccessService.listFiles(
        serverId,
        'logs',
        req.user!.id,
        req.user!.role
      );
      res.json({ success: true, data: { files: logFiles } });
    } catch (error) {
      console.error('Error listing log files:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to list log files' });
    }
  }
);

// Get specific log file content
router.get(
  '/:serverId/files/:filename',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId, filename } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.user_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Validate filename to prevent path traversal
      if (
        filename.includes('..') ||
        filename.includes('/') ||
        filename.includes('\\')
      ) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid filename' });
      }

      const content = await FileAccessService.readFile(
        serverId,
        `logs/${filename}`,
        req.user!.id,
        req.user!.role
      );
      res.json({ success: true, data: { content, filename } });
    } catch (error) {
      console.error('Error reading log file:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to read log file' });
    }
  }
);

// Download log file
router.get(
  '/:serverId/files/:filename/download',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId, filename } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.user_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Validate filename to prevent path traversal
      if (
        filename.includes('..') ||
        filename.includes('/') ||
        filename.includes('\\')
      ) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid filename' });
      }

      // Validate access before download
      await FileAccessService.getFileInfo(
        serverId,
        `logs/${filename}`,
        req.user!.id,
        req.user!.role
      );

      // For download, we need to construct the full path manually since getSecureFilePath doesn't exist
      const MC_DATA_PATH = process.env.MC_DATA_PATH || '/opt/minecraft-servers';
      const filePath = path.join(MC_DATA_PATH, serverId, 'logs', filename);

      res.download(filePath, filename, error => {
        if (error) {
          console.error('Error downloading file:', error);
          if (!res.headersSent) {
            res
              .status(500)
              .json({ success: false, error: 'Failed to download file' });
          }
        }
      });
    } catch (error) {
      console.error('Error preparing file download:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to prepare file download' });
    }
  }
);

// Delete log file
router.delete(
  '/:serverId/files/:filename',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId, filename } = req.params;

      // Verify server ownership
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return res
          .status(404)
          .json({ success: false, error: 'Server not found' });
      }

      if (server.user_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Validate filename to prevent path traversal
      if (
        filename.includes('..') ||
        filename.includes('/') ||
        filename.includes('\\')
      ) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid filename' });
      }

      const success = await FileAccessService.deleteFile(
        serverId,
        `logs/${filename}`,
        req.user!.id,
        req.user!.role
      );

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to delete log file' });
      }

      res.json({ success: true, message: 'Log file deleted successfully' });
    } catch (error) {
      console.error('Error deleting log file:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to delete log file' });
    }
  }
);

// Clear all logs for a server
router.delete(
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

      if (server.user_id !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Clear database logs
      const success = await DatabaseService.clearLogsByServerId(serverId);

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to clear logs' });
      }

      res.json({ success: true, message: 'All logs cleared successfully' });
    } catch (error) {
      console.error('Error clearing logs:', error);
      res.status(500).json({ success: false, error: 'Failed to clear logs' });
    }
  }
);

export default router;
