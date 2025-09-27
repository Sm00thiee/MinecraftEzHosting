import fs from 'fs/promises';
import path from 'path';
import { DatabaseService } from './database.js';

export class FileAccessService {
  private static readonly MC_DATA_PATH =
    process.env.MC_DATA_PATH || '/opt/minecraft-servers';
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private static readonly ALLOWED_EXTENSIONS = [
    '.txt',
    '.log',
    '.yml',
    '.yaml',
    '.json',
    '.properties',
    '.conf',
  ];
  private static readonly FORBIDDEN_PATHS = [
    '..',
    '.ssh',
    '.env',
    'passwd',
    'shadow',
  ];

  // Validate and normalize path to prevent directory traversal
  private static validatePath(serverId: string, relativePath: string): string {
    // Remove any forbidden path components
    const pathComponents = relativePath.split(path.sep).filter(component => {
      return (
        component &&
        component !== '.' &&
        !this.FORBIDDEN_PATHS.some(forbidden => component.includes(forbidden))
      );
    });

    // Construct safe path
    const safePath = path.join(this.MC_DATA_PATH, serverId, ...pathComponents);
    const serverBasePath = path.join(this.MC_DATA_PATH, serverId);

    // Ensure the resolved path is within the server directory
    const resolvedPath = path.resolve(safePath);
    const resolvedBasePath = path.resolve(serverBasePath);

    if (!resolvedPath.startsWith(resolvedBasePath)) {
      throw new Error('Path traversal attempt detected');
    }

    return resolvedPath;
  }

  // Check if user has access to server files
  private static async checkServerAccess(
    serverId: string,
    userId: string,
    userRole: string
  ): Promise<boolean> {
    if (userRole === 'admin') {
      return true;
    }

    const server = await DatabaseService.getServerById(serverId);
    return server?.owner_id === userId;
  }

  // Create directory
  static async createDirectory(
    serverId: string,
    dirPath: string,
    userId: string,
    userRole: string
  ): Promise<boolean> {
    try {
      // Check access
      if (!(await this.checkServerAccess(serverId, userId, userRole))) {
        throw new Error('Access denied');
      }

      const fullPath = this.validatePath(serverId, dirPath);

      // Create directory recursively
      await fs.mkdir(fullPath, { recursive: true });

      // Log the directory creation
      await DatabaseService.createAuditLog({
        actor_user_id: userId,
        action: 'directory_create',
        target_type: 'server_file',
        target_id: serverId,
        metadata: {
          directory_path: dirPath,
        },
      });

      return true;
    } catch (error) {
      console.error('Error creating directory:', error);
      throw error;
    }
  }

  // List files and directories in a server path
  static async listFiles(
    serverId: string,
    relativePath: string = '',
    userId: string,
    userRole: string
  ): Promise<{
    files: Array<{
      name: string;
      type: 'file' | 'directory';
      size?: number;
      modified?: string;
      readable: boolean;
    }>;
  }> {
    try {
      // Check access
      if (!(await this.checkServerAccess(serverId, userId, userRole))) {
        throw new Error('Access denied');
      }

      const fullPath = this.validatePath(serverId, relativePath);

      // Check if path exists
      try {
        await fs.access(fullPath);
      } catch {
        throw new Error('Path not found');
      }

      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      const files = await Promise.all(
        entries.map(async entry => {
          const entryPath = path.join(fullPath, entry.name);
          let size: number | undefined;
          let modified: string | undefined;
          let readable = true;

          try {
            const stats = await fs.stat(entryPath);
            size = entry.isFile() ? stats.size : undefined;
            modified = stats.mtime.toISOString();

            // Check if file is readable (for files only)
            if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              readable =
                this.ALLOWED_EXTENSIONS.includes(ext) &&
                stats.size <= this.MAX_FILE_SIZE;
            }
          } catch {
            readable = false;
          }

          return {
            name: entry.name,
            type: entry.isDirectory()
              ? ('directory' as const)
              : ('file' as const),
            size,
            modified,
            readable,
          };
        })
      );

      // Sort: directories first, then files, both alphabetically
      files.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return { files };
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  // Read file content
  static async readFile(
    serverId: string,
    relativePath: string,
    userId: string,
    userRole: string
  ): Promise<{
    content: string;
    size: number;
    modified: string;
  }> {
    try {
      // Check access
      if (!(await this.checkServerAccess(serverId, userId, userRole))) {
        throw new Error('Access denied');
      }

      const fullPath = this.validatePath(serverId, relativePath);

      // Check file extension
      const ext = path.extname(fullPath).toLowerCase();
      if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
        throw new Error('File type not allowed');
      }

      // Check file size
      const stats = await fs.stat(fullPath);
      if (stats.size > this.MAX_FILE_SIZE) {
        throw new Error('File too large to read');
      }

      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      const content = await fs.readFile(fullPath, 'utf-8');

      return {
        content,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  }

  // Write file content (limited to certain files)
  static async writeFile(
    serverId: string,
    relativePath: string,
    content: string,
    userId: string,
    userRole: string
  ): Promise<boolean> {
    try {
      // Check access
      if (!(await this.checkServerAccess(serverId, userId, userRole))) {
        throw new Error('Access denied');
      }

      const fullPath = this.validatePath(serverId, relativePath);

      // Only allow writing to certain configuration files
      const allowedWriteFiles = [
        'server.properties',
        'bukkit.yml',
        'spigot.yml',
        'paper.yml',
        'config.yml',
        'whitelist.json',
        'ops.json',
        'banned-players.json',
        'banned-ips.json',
      ];

      const fileName = path.basename(fullPath);
      const ext = path.extname(fileName).toLowerCase();

      if (
        !allowedWriteFiles.includes(fileName) &&
        !this.ALLOWED_EXTENSIONS.includes(ext)
      ) {
        throw new Error('File not allowed for writing');
      }

      // Check content size
      if (Buffer.byteLength(content, 'utf-8') > this.MAX_FILE_SIZE) {
        throw new Error('Content too large');
      }

      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content, 'utf-8');

      // Log the file write operation
      await DatabaseService.createAuditLog({
        actor_user_id: userId,
        action: 'file_write',
        target_type: 'server_file',
        target_id: serverId,
        metadata: {
          file_path: relativePath,
          file_size: Buffer.byteLength(content, 'utf-8'),
        },
      });

      return true;
    } catch (error) {
      console.error('Error writing file:', error);
      throw error;
    }
  }

  // Delete file (limited to certain files)
  static async deleteFile(
    serverId: string,
    relativePath: string,
    userId: string,
    userRole: string
  ): Promise<boolean> {
    try {
      // Check access
      if (!(await this.checkServerAccess(serverId, userId, userRole))) {
        throw new Error('Access denied');
      }

      const fullPath = this.validatePath(serverId, relativePath);

      // Only allow deleting certain files (not core server files)
      const allowedDeletePatterns = [
        /^logs\/.+\.log$/,
        /^plugins\/.+\.(jar|yml|yaml|json|txt)$/,
        /^world\/.*\.(dat|json|txt)$/,
        /^config\/.+\.(yml|yaml|json|properties|conf)$/,
      ];

      const isAllowed = allowedDeletePatterns.some(pattern =>
        pattern.test(relativePath)
      );

      if (!isAllowed) {
        throw new Error('File not allowed for deletion');
      }

      // Check if file exists and is a file
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      // Delete file
      await fs.unlink(fullPath);

      // Log the file deletion
      await DatabaseService.createAuditLog({
        actor_user_id: userId,
        action: 'file_delete',
        target_type: 'server_file',
        target_id: serverId,
        metadata: {
          file_path: relativePath,
          file_size: stats.size,
        },
      });

      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  // Get file/directory info
  static async getFileInfo(
    serverId: string,
    relativePath: string,
    userId: string,
    userRole: string
  ): Promise<{
    name: string;
    type: 'file' | 'directory';
    size: number;
    modified: string;
    readable: boolean;
    writable: boolean;
    deletable: boolean;
  }> {
    try {
      // Check access
      if (!(await this.checkServerAccess(serverId, userId, userRole))) {
        throw new Error('Access denied');
      }

      const fullPath = this.validatePath(serverId, relativePath);
      const stats = await fs.stat(fullPath);
      const fileName = path.basename(fullPath);
      const ext = path.extname(fileName).toLowerCase();

      const readable =
        stats.isFile() &&
        this.ALLOWED_EXTENSIONS.includes(ext) &&
        stats.size <= this.MAX_FILE_SIZE;

      const allowedWriteFiles = [
        'server.properties',
        'bukkit.yml',
        'spigot.yml',
        'paper.yml',
        'config.yml',
        'whitelist.json',
        'ops.json',
        'banned-players.json',
        'banned-ips.json',
      ];

      const writable =
        stats.isFile() &&
        (allowedWriteFiles.includes(fileName) ||
          this.ALLOWED_EXTENSIONS.includes(ext));

      const allowedDeletePatterns = [
        /^logs\/.+\.log$/,
        /^plugins\/.+\.(jar|yml|yaml|json|txt)$/,
        /^world\/.*\.(dat|json|txt)$/,
        /^config\/.+\.(yml|yaml|json|properties|conf)$/,
      ];

      const deletable =
        stats.isFile() &&
        allowedDeletePatterns.some(pattern => pattern.test(relativePath));

      return {
        name: fileName,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modified: stats.mtime.toISOString(),
        readable,
        writable,
        deletable,
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      throw error;
    }
  }
}
