import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DatabaseService } from './database.js';
import { DockerService } from './docker.js';

const execAsync = promisify(exec);

export interface BackupInfo {
  id: string;
  server_id: string;
  name: string;
  description?: string;
  size_bytes: number;
  created_at: string;
  file_path: string;
  world_name?: string;
}

export class BackupService {
  private static readonly BACKUP_PATH = process.env.BACKUP_PATH || './backups';
  private static readonly MAX_BACKUP_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
  private static readonly COMPRESSION_LEVEL = 6; // gzip compression level

  // Initialize backup directory
  static async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.BACKUP_PATH, { recursive: true });
      console.log(`Backup directory initialized: ${this.BACKUP_PATH}`);
    } catch (error) {
      console.error('Error initializing backup directory:', error);
      throw error;
    }
  }

  // Create a backup of a server
  static async createBackup(
    serverId: string,
    name: string,
    description?: string,
    includePlugins: boolean = true,
    includeConfig: boolean = true
  ): Promise<BackupInfo> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        throw new Error('Server not found');
      }

      // Stop server if running to ensure consistent backup
      const wasRunning = server.status === 'running';
      if (wasRunning) {
        console.log(`Stopping server ${serverId} for backup...`);
        await DockerService.stopServer(serverId);
        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      const backupId = `backup_${serverId}_${Date.now()}`;
      const backupFileName = `${backupId}.tar.gz`;
      const backupFilePath = path.join(this.BACKUP_PATH, backupFileName);

      // Get server data path
      const serverDataPath = await this.getServerDataPath(serverId);

      // Create backup using tar with compression
      const tarCommand = this.buildTarCommand(serverDataPath, backupFilePath, {
        includePlugins,
        includeConfig,
      });

      console.log(`Creating backup: ${tarCommand}`);
      await execAsync(tarCommand);

      // Get backup file size
      const stats = await fs.stat(backupFilePath);
      const sizeBytes = stats.size;

      if (sizeBytes > this.MAX_BACKUP_SIZE) {
        await fs.unlink(backupFilePath);
        throw new Error(
          `Backup size (${Math.round(sizeBytes / 1024 / 1024)}MB) exceeds maximum allowed size`
        );
      }

      // Restart server if it was running
      if (wasRunning) {
        console.log(`Restarting server ${serverId} after backup...`);
        await DockerService.startServer(serverId);
      }

      // Store backup info in database
      const backupInfo: BackupInfo = {
        id: backupId,
        server_id: serverId,
        name,
        description,
        size_bytes: sizeBytes,
        created_at: new Date().toISOString(),
        file_path: backupFilePath,
        world_name: await this.getWorldName(serverDataPath),
      };

      await this.saveBackupInfo(backupInfo);

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: server.owner_id,
        action: 'backup_created',
        target_type: 'server',
        target_id: serverId,
        metadata: {
          backup_id: backupId,
          backup_name: name,
          size_bytes: sizeBytes,
        },
      });

      return backupInfo;
    } catch (error) {
      console.error('Error creating backup:', error);
      throw error;
    }
  }

  // Restore a server from backup
  static async restoreBackup(
    serverId: string,
    backupId: string,
    restoreOptions: {
      restoreWorld?: boolean;
      restorePlugins?: boolean;
      restoreConfig?: boolean;
    } = { restoreWorld: true, restorePlugins: true, restoreConfig: true }
  ): Promise<boolean> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        throw new Error('Server not found');
      }

      const backupInfo = await this.getBackupInfo(backupId);
      if (!backupInfo) {
        throw new Error('Backup not found');
      }

      // Verify backup file exists
      try {
        await fs.access(backupInfo.file_path);
      } catch {
        throw new Error('Backup file not found on disk');
      }

      // Stop server if running
      const wasRunning = server.status === 'running';
      if (wasRunning) {
        console.log(`Stopping server ${serverId} for restore...`);
        await DockerService.stopServer(serverId);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Get server data path
      const serverDataPath = await this.getServerDataPath(serverId);

      // Create backup of current state before restore
      const preRestoreBackupName = `pre_restore_${Date.now()}`;
      console.log('Creating pre-restore backup...');
      await this.createBackup(
        serverId,
        preRestoreBackupName,
        'Automatic backup before restore'
      );

      // Extract backup
      const extractCommand = this.buildExtractCommand(
        backupInfo.file_path,
        serverDataPath,
        restoreOptions
      );
      console.log(`Restoring backup: ${extractCommand}`);
      await execAsync(extractCommand);

      // Update server status
      await DatabaseService.updateServer(serverId, {
        updated_at: new Date().toISOString(),
      });

      // Restart server if it was running
      if (wasRunning) {
        console.log(`Restarting server ${serverId} after restore...`);
        await DockerService.startServer(serverId);
      }

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: server.owner_id,
        action: 'backup_restored',
        target_type: 'server',
        target_id: serverId,
        metadata: {
          backup_id: backupId,
          restore_options: restoreOptions,
        },
      });

      return true;
    } catch (error) {
      console.error('Error restoring backup:', error);
      throw error;
    }
  }

  // Get all backups for a server
  static async getServerBackups(serverId: string): Promise<BackupInfo[]> {
    try {
      // In a real implementation, this would query a database table
      // For now, we'll scan the backup directory and parse filenames
      const backupFiles = await fs.readdir(this.BACKUP_PATH);
      const serverBackups: BackupInfo[] = [];

      for (const file of backupFiles) {
        if (
          file.startsWith(`backup_${serverId}_`) &&
          file.endsWith('.tar.gz')
        ) {
          const backupInfo = await this.getBackupInfoFromFile(file);
          if (backupInfo) {
            serverBackups.push(backupInfo);
          }
        }
      }

      return serverBackups.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } catch (error) {
      console.error('Error getting server backups:', error);
      return [];
    }
  }

  // Delete a backup
  static async deleteBackup(
    backupId: string,
    actorUserId: string
  ): Promise<boolean> {
    try {
      const backupInfo = await this.getBackupInfo(backupId);
      if (!backupInfo) {
        throw new Error('Backup not found');
      }

      // Delete backup file
      await fs.unlink(backupInfo.file_path);

      // Remove from database (if implemented)
      await this.removeBackupInfo(backupId);

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: actorUserId,
        action: 'backup_deleted',
        target_type: 'server',
        target_id: backupInfo.server_id,
        metadata: {
          backup_id: backupId,
          backup_name: backupInfo.name,
        },
      });

      return true;
    } catch (error) {
      console.error('Error deleting backup:', error);
      return false;
    }
  }

  // Private helper methods
  private static async getServerDataPath(serverId: string): Promise<string> {
    // This would typically get the Docker volume mount path
    // For now, using a simple path structure
    return path.join('./minecraft-servers', serverId);
  }

  private static buildTarCommand(
    sourcePath: string,
    outputPath: string,
    options: { includePlugins: boolean; includeConfig: boolean }
  ): string {
    let excludeArgs = '';

    if (!options.includePlugins) {
      excludeArgs += ' --exclude="plugins" --exclude="mods"';
    }

    if (!options.includeConfig) {
      excludeArgs +=
        ' --exclude="server.properties" --exclude="*.yml" --exclude="*.yaml"';
    }

    // Always exclude logs and cache
    excludeArgs +=
      ' --exclude="logs" --exclude="cache" --exclude="crash-reports"';

    return `tar -czf "${outputPath}" -C "${path.dirname(sourcePath)}" ${excludeArgs} "${path.basename(sourcePath)}"`;
  }

  private static buildExtractCommand(
    backupPath: string,
    targetPath: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: {
      restoreWorld?: boolean;
      restorePlugins?: boolean;
      restoreConfig?: boolean;
    }
  ): string {
    // Create target directory if it doesn't exist
    return `mkdir -p "${targetPath}" && tar -xzf "${backupPath}" -C "${path.dirname(targetPath)}" --overwrite`;
  }

  private static async getWorldName(
    serverDataPath: string
  ): Promise<string | undefined> {
    try {
      const serverPropsPath = path.join(serverDataPath, 'server.properties');
      const content = await fs.readFile(serverPropsPath, 'utf-8');
      const match = content.match(/level-name=(.+)/);
      return match ? match[1].trim() : undefined;
    } catch {
      return undefined;
    }
  }

  private static async saveBackupInfo(backupInfo: BackupInfo): Promise<void> {
    // In a real implementation, this would save to database
    // For now, save as JSON file alongside backup
    const infoPath = backupInfo.file_path.replace('.tar.gz', '.json');
    await fs.writeFile(infoPath, JSON.stringify(backupInfo, null, 2));
  }

  private static async getBackupInfo(
    backupId: string
  ): Promise<BackupInfo | null> {
    try {
      const backupFiles = await fs.readdir(this.BACKUP_PATH);
      const backupFile = backupFiles.find(f => f.startsWith(backupId));

      if (!backupFile) return null;

      const infoPath = path.join(
        this.BACKUP_PATH,
        backupFile.replace('.tar.gz', '.json')
      );
      const content = await fs.readFile(infoPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private static async getBackupInfoFromFile(
    filename: string
  ): Promise<BackupInfo | null> {
    try {
      const infoPath = path.join(
        this.BACKUP_PATH,
        filename.replace('.tar.gz', '.json')
      );
      const content = await fs.readFile(infoPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // Fallback: parse from filename
      const match = filename.match(/backup_(.+)_(\d+)\.tar\.gz/);
      if (!match) return null;

      const [, serverId, timestamp] = match;
      const filePath = path.join(this.BACKUP_PATH, filename);
      const stats = await fs.stat(filePath);

      return {
        id: filename.replace('.tar.gz', ''),
        server_id: serverId,
        name: `Backup ${new Date(parseInt(timestamp)).toLocaleString()}`,
        size_bytes: stats.size,
        created_at: new Date(parseInt(timestamp)).toISOString(),
        file_path: filePath,
      };
    }
  }

  private static async removeBackupInfo(backupId: string): Promise<void> {
    try {
      const backupFiles = await fs.readdir(this.BACKUP_PATH);
      const infoFile = backupFiles.find(
        f => f.startsWith(backupId) && f.endsWith('.json')
      );

      if (infoFile) {
        await fs.unlink(path.join(this.BACKUP_PATH, infoFile));
      }
    } catch (error) {
      console.error('Error removing backup info:', error);
    }
  }

  // Cleanup old backups (keep only N most recent)
  static async cleanupOldBackups(
    serverId: string,
    keepCount: number = 10
  ): Promise<number> {
    try {
      const backups = await this.getServerBackups(serverId);

      if (backups.length <= keepCount) {
        return 0;
      }

      const toDelete = backups.slice(keepCount);
      let deletedCount = 0;

      for (const backup of toDelete) {
        try {
          await fs.unlink(backup.file_path);
          await this.removeBackupInfo(backup.id);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting backup ${backup.id}:`, error);
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old backups:', error);
      return 0;
    }
  }
}
