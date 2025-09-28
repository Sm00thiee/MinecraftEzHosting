import { Router } from 'express';
import { DatabaseService } from '../services/database.js';
import { FileAccessService } from '../services/file-access.js';
import {
  authenticateToken,
  requireAllowed,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common server files
    const allowedExtensions = [
      '.jar',
      '.yml',
      '.yaml',
      '.properties',
      '.txt',
      '.json',
      '.toml',
    ];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext) || !ext) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

// List files in server directory
router.get(
  '/:serverId',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const directory = (req.query.dir as string) || '';

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

      const files = await FileAccessService.listFiles(
        serverId,
        directory,
        req.user!.id,
        req.user!.role
      );
      res.json({ success: true, data: { files, directory } });
    } catch (error) {
      console.error('Error listing files:', error);
      res.status(500).json({ success: false, error: 'Failed to list files' });
    }
  }
);

// Get file content
router.get(
  '/:serverId/content',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const filePath = req.query.path as string;

      if (!filePath) {
        return res
          .status(400)
          .json({ success: false, error: 'File path is required' });
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

      const content = await FileAccessService.readFile(
        serverId,
        filePath,
        req.user!.id,
        req.user!.role
      );
      res.json({ success: true, data: { content, path: filePath } });
    } catch (error) {
      console.error('Error reading file:', error);
      res.status(500).json({ success: false, error: 'Failed to read file' });
    }
  }
);

// Update file content
router.put(
  '/:serverId/content',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const { path: filePath, content } = req.body;

      if (!filePath || content === undefined) {
        return res.status(400).json({
          success: false,
          error: 'File path and content are required',
        });
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

      const success = await FileAccessService.writeFile(
        serverId,
        filePath,
        content,
        req.user!.id,
        req.user!.role
      );

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to update file' });
      }

      res.json({ success: true, message: 'File updated successfully' });
    } catch (error) {
      console.error('Error updating file:', error);
      res.status(500).json({ success: false, error: 'Failed to update file' });
    }
  }
);

// Upload file
router.post(
  '/:serverId/upload',
  authenticateToken,
  requireAllowed,
  upload.single('file'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const directory = req.body.directory || '';
      const file = req.file;

      if (!file) {
        return res
          .status(400)
          .json({ success: false, error: 'No file provided' });
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

      const filePath = directory
        ? `${directory}/${file.originalname}`
        : file.originalname;
      const success = await FileAccessService.writeFile(
        serverId,
        filePath,
        file.buffer.toString(),
        req.user!.id,
        req.user!.role
      );

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to upload file' });
      }

      res.json({
        success: true,
        message: 'File uploaded successfully',
        data: { filename: file.originalname, path: filePath },
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ success: false, error: 'Failed to upload file' });
    }
  }
);

// Download file
router.get(
  '/:serverId/download',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const filePath = req.query.path as string;

      if (!filePath) {
        return res
          .status(400)
          .json({ success: false, error: 'File path is required' });
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

      // Validate file access and get secure path
      const fileInfo = await FileAccessService.getFileInfo(
        serverId,
        filePath,
        req.user!.id,
        req.user!.role
      );
      if (!fileInfo) {
        return res
          .status(404)
          .json({ success: false, error: 'File not found' });
      }

      const secureFilePath = path.join(
        process.env.MC_DATA_PATH || './data',
        serverId,
        filePath
      );
      const filename = path.basename(filePath);

      res.download(secureFilePath, filename, error => {
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

// Delete file
router.delete(
  '/:serverId/file',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const filePath = req.query.path as string;

      if (!filePath) {
        return res
          .status(400)
          .json({ success: false, error: 'File path is required' });
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

      // Prevent deletion of critical files
      const criticalFiles = ['server.jar', 'eula.txt'];
      const filename = path.basename(filePath);

      if (criticalFiles.includes(filename)) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete critical server files',
        });
      }

      const success = await FileAccessService.deleteFile(
        serverId,
        filePath,
        req.user!.id,
        req.user!.role
      );

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to delete file' });
      }

      res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  }
);

// Create directory
router.post(
  '/:serverId/directory',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const { path: dirPath } = req.body;

      if (!dirPath) {
        return res
          .status(400)
          .json({ success: false, error: 'Directory path is required' });
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

      const success = await FileAccessService.createDirectory(
        serverId,
        dirPath,
        req.user!.id,
        req.user!.role
      );

      if (!success) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to create directory' });
      }

      res.json({ success: true, message: 'Directory created successfully' });
    } catch (error) {
      console.error('Error creating directory:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to create directory' });
    }
  }
);

// Get server properties (server.properties file)
router.get(
  '/:serverId/properties',
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

      try {
        const content = await FileAccessService.readFile(
          serverId,
          'server.properties',
          req.user!.id,
          req.user!.role
        );

        // Parse properties file
        const properties: Record<string, string> = {};
        content.content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
              properties[key.trim()] = valueParts.join('=').trim();
            }
          }
        });

        res.json({ success: true, data: { properties } });
      } catch {
        // If server.properties doesn't exist, return empty properties
        res.json({ success: true, data: { properties: {} } });
      }
    } catch (error) {
      console.error('Error reading server properties:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to read server properties' });
    }
  }
);

// Update server properties
router.put(
  '/:serverId/properties',
  authenticateToken,
  requireAllowed,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { serverId } = req.params;
      const { properties } = req.body;

      if (!properties || typeof properties !== 'object') {
        return res
          .status(400)
          .json({ success: false, error: 'Properties object is required' });
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

      // Convert properties object to properties file format
      const content = Object.entries(properties)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const success = await FileAccessService.writeFile(
        serverId,
        'server.properties',
        content,
        req.user!.id,
        req.user!.role
      );

      if (!success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to update server properties',
        });
      }

      res.json({
        success: true,
        message: 'Server properties updated successfully',
      });
    } catch (error) {
      console.error('Error updating server properties:', error);
      res
        .status(500)
        .json({ success: false, error: 'Failed to update server properties' });
    }
  }
);

export default router;
