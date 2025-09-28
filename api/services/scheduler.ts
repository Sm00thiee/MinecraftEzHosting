import * as cron from 'node-cron';
import { DatabaseService } from './database.js';
import { DockerService } from './docker.js';
import { BackupService } from './backup.js';

export interface ScheduledTask {
  id: string;
  server_id: string;
  type: 'restart' | 'backup' | 'cleanup';
  cron_expression: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  created_at: string;
  updated_at: string;
  config?: {
    backup_name_template?: string;
    cleanup_keep_count?: number;
    restart_warning_minutes?: number;
  };
}

export class SchedulerService {
  private static tasks: Map<string, cron.ScheduledTask> = new Map();
  private static isInitialized = false;

  // Initialize scheduler service
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Scheduler service already initialized');
      return;
    }

    console.log('Initializing scheduler service...');

    try {
      // Load existing scheduled tasks from database
      await this.loadScheduledTasks();
      this.isInitialized = true;
      console.log('Scheduler service initialized successfully');
    } catch (error) {
      console.error('Error initializing scheduler service:', error);
      throw error;
    }
  }

  // Create a scheduled restart for a server
  static async scheduleRestart(
    serverId: string,
    cronExpression: string,
    warningMinutes: number = 5,
    actorUserId: string
  ): Promise<ScheduledTask> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        throw new Error('Server not found');
      }

      const taskId = `restart_${serverId}_${Date.now()}`;
      const scheduledTask: ScheduledTask = {
        id: taskId,
        server_id: serverId,
        type: 'restart',
        cron_expression: cronExpression,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config: {
          restart_warning_minutes: warningMinutes,
        },
      };

      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new Error('Invalid cron expression');
      }

      // Create cron job
      const cronJob = cron.schedule(
        cronExpression,
        async () => {
          await this.executeRestartTask(serverId, warningMinutes);
        },
        {
          scheduled: false,
        }
      );

      // Store task
      this.tasks.set(taskId, cronJob);
      await this.saveScheduledTask(scheduledTask);

      // Start the job
      cronJob.start();

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: actorUserId,
        action: 'scheduled_restart_created',
        target_type: 'server',
        target_id: serverId,
        metadata: {
          task_id: taskId,
          cron_expression: cronExpression,
          warning_minutes: warningMinutes,
        },
      });

      console.log(
        `Scheduled restart created for server ${serverId}: ${cronExpression}`
      );
      return scheduledTask;
    } catch (error) {
      console.error('Error scheduling restart:', error);
      throw error;
    }
  }

  // Create a scheduled backup for a server
  static async scheduleBackup(
    serverId: string,
    cronExpression: string,
    nameTemplate: string = 'Scheduled backup {date}',
    actorUserId: string
  ): Promise<ScheduledTask> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        throw new Error('Server not found');
      }

      const taskId = `backup_${serverId}_${Date.now()}`;
      const scheduledTask: ScheduledTask = {
        id: taskId,
        server_id: serverId,
        type: 'backup',
        cron_expression: cronExpression,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        config: {
          backup_name_template: nameTemplate,
        },
      };

      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new Error('Invalid cron expression');
      }

      // Create cron job
      const cronJob = cron.schedule(
        cronExpression,
        async () => {
          await this.executeBackupTask(serverId, nameTemplate);
        },
        {
          scheduled: false,
        }
      );

      // Store task
      this.tasks.set(taskId, cronJob);
      await this.saveScheduledTask(scheduledTask);

      // Start the job
      cronJob.start();

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: actorUserId,
        action: 'scheduled_backup_created',
        target_type: 'server',
        target_id: serverId,
        metadata: {
          task_id: taskId,
          cron_expression: cronExpression,
          name_template: nameTemplate,
        },
      });

      console.log(
        `Scheduled backup created for server ${serverId}: ${cronExpression}`
      );
      return scheduledTask;
    } catch (error) {
      console.error('Error scheduling backup:', error);
      throw error;
    }
  }

  // Get all scheduled tasks for a server
  static async getServerTasks(serverId: string): Promise<ScheduledTask[]> {
    try {
      // In a real implementation, this would query a database table
      // For now, we'll use a simple file-based approach
      return await this.loadTasksFromStorage(serverId);
    } catch (error) {
      console.error('Error getting server tasks:', error);
      return [];
    }
  }

  // Update a scheduled task
  static async updateTask(
    taskId: string,
    updates: Partial<ScheduledTask>,
    actorUserId: string
  ): Promise<boolean> {
    try {
      const existingTask = await this.getTaskById(taskId);
      if (!existingTask) {
        throw new Error('Task not found');
      }

      // Stop existing cron job
      const cronJob = this.tasks.get(taskId);
      if (cronJob) {
        cronJob.stop();
        cronJob.destroy();
        this.tasks.delete(taskId);
      }

      // Update task
      const updatedTask: ScheduledTask = {
        ...existingTask,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      // If cron expression changed, validate it
      if (updates.cron_expression && !cron.validate(updates.cron_expression)) {
        throw new Error('Invalid cron expression');
      }

      // Create new cron job if enabled
      if (updatedTask.enabled) {
        const newCronJob = cron.schedule(
          updatedTask.cron_expression,
          async () => {
            if (updatedTask.type === 'restart') {
              await this.executeRestartTask(
                updatedTask.server_id,
                updatedTask.config?.restart_warning_minutes || 5
              );
            } else if (updatedTask.type === 'backup') {
              await this.executeBackupTask(
                updatedTask.server_id,
                updatedTask.config?.backup_name_template ||
                  'Scheduled backup {date}'
              );
            }
          },
          {
            scheduled: false,
          }
        );

        this.tasks.set(taskId, newCronJob);
        newCronJob.start();
      }

      // Save updated task
      await this.saveScheduledTask(updatedTask);

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: actorUserId,
        action: 'scheduled_task_updated',
        target_type: 'server',
        target_id: updatedTask.server_id,
        metadata: {
          task_id: taskId,
          updates,
        },
      });

      return true;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  // Delete a scheduled task
  static async deleteTask(
    taskId: string,
    actorUserId: string
  ): Promise<boolean> {
    try {
      const task = await this.getTaskById(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // Stop and remove cron job
      const cronJob = this.tasks.get(taskId);
      if (cronJob) {
        cronJob.stop();
        cronJob.destroy();
        this.tasks.delete(taskId);
      }

      // Remove from storage
      await this.removeTaskFromStorage();

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: actorUserId,
        action: 'scheduled_task_deleted',
        target_type: 'server',
        target_id: task.server_id,
        metadata: {
          task_id: taskId,
          task_type: task.type,
        },
      });

      console.log(`Scheduled task ${taskId} deleted`);
      return true;
    } catch (error) {
      console.error('Error deleting task:', error);
      return false;
    }
  }

  // Execute restart task
  private static async executeRestartTask(
    serverId: string,
    warningMinutes: number
  ): Promise<void> {
    try {
      console.log(`Executing scheduled restart for server ${serverId}`);

      const server = await DatabaseService.getServerById(serverId);
      if (!server || server.status !== 'running') {
        console.log(`Server ${serverId} is not running, skipping restart`);
        return;
      }

      // TODO: Send warning to players via RCON
      // For now, just log the warning
      console.log(
        `Warning: Server ${serverId} will restart in ${warningMinutes} minutes`
      );

      // Wait for warning period
      if (warningMinutes > 0) {
        await new Promise(resolve =>
          setTimeout(resolve, warningMinutes * 60 * 1000)
        );
      }

      // Restart server
      await DockerService.restartServer(serverId);

      // Log audit event
      await DatabaseService.createAuditLog({
        actor_user_id: server.owner_id,
        action: 'scheduled_restart_executed',
        target_type: 'server',
        target_id: serverId,
        metadata: {
          warning_minutes: warningMinutes,
          executed_at: new Date().toISOString(),
        },
      });

      console.log(`Scheduled restart completed for server ${serverId}`);
    } catch (error) {
      console.error(
        `Error executing restart task for server ${serverId}:`,
        error
      );
    }
  }

  // Execute backup task
  private static async executeBackupTask(
    serverId: string,
    nameTemplate: string
  ): Promise<void> {
    try {
      console.log(`Executing scheduled backup for server ${serverId}`);

      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        console.log(`Server ${serverId} not found, skipping backup`);
        return;
      }

      // Generate backup name from template
      const backupName = nameTemplate
        .replace('{date}', new Date().toISOString().split('T')[0])
        .replace('{time}', new Date().toTimeString().split(' ')[0])
        .replace('{server}', server.name);

      // Create backup
      await BackupService.createBackup(
        serverId,
        backupName,
        'Automatically created by scheduled task'
      );

      // Cleanup old backups (keep last 10)
      await BackupService.cleanupOldBackups(serverId, 10);

      console.log(
        `Scheduled backup completed for server ${serverId}: ${backupName}`
      );
    } catch (error) {
      console.error(
        `Error executing backup task for server ${serverId}:`,
        error
      );
    }
  }

  // Private helper methods
  private static async loadScheduledTasks(): Promise<void> {
    // In a real implementation, this would load from database
    // For now, we'll use a simple file-based approach
    console.log('Loading scheduled tasks from storage...');
  }

  private static async saveScheduledTask(task: ScheduledTask): Promise<void> {
    // In a real implementation, this would save to database
    // For now, we'll use a simple file-based approach
    console.log(`Saving scheduled task: ${task.id}`);
  }

  private static async loadTasksFromStorage(
    serverId?: string
  ): Promise<ScheduledTask[]> {
    // Placeholder implementation
    console.log(
      `Loading tasks from storage${serverId ? ` for server ${serverId}` : ''}`
    );
    return [];
  }

  private static async getTaskById(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    taskId: string
  ): Promise<ScheduledTask | null> {
    // Placeholder implementation
    return null;
  }

  private static async removeTaskFromStorage(): Promise<void> {
    // Placeholder implementation
    console.log(`Removing task from storage`);
  }

  // Stop all scheduled tasks
  static stop(): void {
    console.log('Stopping scheduler service...');

    for (const cronJob of this.tasks.values()) {
      cronJob.stop();
      cronJob.destroy();
    }

    this.tasks.clear();
    this.isInitialized = false;
    console.log('Scheduler service stopped');
  }

  // Get scheduler status
  static getStatus(): {
    initialized: boolean;
    active_tasks: number;
    tasks: Array<{ id: string; type: string; enabled: boolean }>;
  } {
    const taskInfo = Array.from(this.tasks.keys()).map(id => ({
      id: id,
      type: id.split('_')[0],
      enabled: true, // We only store enabled tasks in memory
    }));

    return {
      initialized: this.isInitialized,
      active_tasks: this.tasks.size,
      tasks: taskInfo,
    };
  }
}
