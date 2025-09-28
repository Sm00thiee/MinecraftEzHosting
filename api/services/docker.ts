import Docker from 'dockerode';
import crypto from 'crypto';
import { DatabaseService } from './database.js';
import type { Server, ContainerInfo } from '../../shared/types.js';

// Configure Docker connection based on environment
const getDockerConfig = () => {
  // If running in a container, check DOCKER_HOST environment variable
  if (process.env.DOCKER_HOST) {
    const dockerHost = process.env.DOCKER_HOST;

    // Handle Unix socket format
    if (dockerHost.startsWith('unix://')) {
      return { socketPath: dockerHost.replace('unix://', '') };
    }

    // Handle named pipe format for Windows
    if (dockerHost.startsWith('npipe://')) {
      return { socketPath: dockerHost.replace('npipe://', '') };
    }

    // Handle TCP format (for remote Docker hosts)
    if (dockerHost.startsWith('tcp://')) {
      const url = new URL(dockerHost);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 2376,
        protocol: 'http' as const,
      };
    }

    // Fallback: treat as direct socket path
    return { socketPath: dockerHost };
  }

  // If running on Windows host, use named pipe
  if (process.platform === 'win32') {
    return { socketPath: '\\\\.\\pipe\\docker_engine' };
  }

  // Default to Unix socket for Linux/macOS
  return { socketPath: '/var/run/docker.sock' };
};

const docker = new Docker(getDockerConfig());

export class DockerService {
  private static readonly MC_BASE_PORT = parseInt(
    process.env.MC_BASE_PORT || '25565'
  );
  private static readonly RCON_BASE_PORT = parseInt(
    process.env.RCON_BASE_PORT || '25575'
  );
  private static readonly QUERY_BASE_PORT = parseInt(
    process.env.QUERY_BASE_PORT || '25585'
  );

  // Get next available port
  private static async getNextAvailablePort(basePort: number): Promise<number> {
    const servers = await DatabaseService.getAllServers();
    const usedPorts = new Set<number>();

    servers.forEach(server => {
      if (server.game_port) usedPorts.add(server.game_port);
      if (server.rcon_port) usedPorts.add(server.rcon_port);
      if (server.query_port) usedPorts.add(server.query_port);
    });

    let port = basePort;
    while (usedPorts.has(port)) {
      port++;
    }

    return port;
  }

  // Generate secure RCON password
  private static generateSecureRconPassword(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  // Get Docker image for server type and version
  private static getDockerImage(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _type: Server['type'],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _mcVersion: string
  ): string {
    // Use our custom image for better management
    return 'mc-server-management:latest';
  }

  // Build custom Docker image if it doesn't exist
  private static async ensureDockerImage(): Promise<void> {
    try {
      // Check if our custom image exists
      await docker.getImage('mc-server-management:latest').inspect();
    } catch {
      console.log('Custom Docker image not found, building...');
      // Build the image from Dockerfile
      const stream = await docker.buildImage(
        {
          context: process.cwd(),
          src: ['Dockerfile.minecraft'],
        },
        {
          t: 'mc-server-management:latest',
          dockerfile: 'Dockerfile.minecraft',
        }
      );

      // Wait for build to complete
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });

      console.log('Custom Docker image built successfully');
    }
  }

  // Create and start a Minecraft server container
  static async createServer(server: Server): Promise<boolean> {
    try {
      // Ensure our custom Docker image exists
      await this.ensureDockerImage();

      // Create a unique volume for the server
      const volumeName = `mc-data-${server.id}`;
      await docker.createVolume({
        Name: volumeName,
        Labels: {
          'mc-server-management.server-id': server.id,
        },
      });

      // Get available ports
      const gamePort = await this.getNextAvailablePort(this.MC_BASE_PORT);
      const rconPort = await this.getNextAvailablePort(this.RCON_BASE_PORT);
      const queryPort = await this.getNextAvailablePort(this.QUERY_BASE_PORT);

      // Get server settings
      const serverWithSettings = await DatabaseService.getServerById(server.id);
      const settings = serverWithSettings?.settings;

      // Prepare environment variables
      const envVars = {
        EULA: 'TRUE',
        TYPE: server.type.toUpperCase(),
        VERSION: server.mc_version,
        MEMORY: settings?.resource_limits?.memory || '2G',
        ENABLE_RCON: settings?.rcon_enabled ? 'true' : 'false',
        RCON_PORT: rconPort.toString(),
        RCON_PASSWORD: this.generateSecureRconPassword(),
        ENABLE_QUERY: 'true',
        QUERY_PORT: queryPort.toString(),
        SERVER_PORT: gamePort.toString(),
        ONLINE_MODE: 'true',
        ...settings?.env_vars,
      };

      // Create container
      const container = await docker.createContainer({
        Image: this.getDockerImage(server.type, server.mc_version),
        name: `mc-server-${server.id}`,
        Env: Object.entries(envVars).map(([key, value]) => `${key}=${value}`),
        ExposedPorts: {
          [`${gamePort}/tcp`]: {},
          [`${rconPort}/tcp`]: {},
          [`${queryPort}/udp`]: {},
        },
        HostConfig: {
          PortBindings: {
            [`${gamePort}/tcp`]: [{ HostPort: gamePort.toString() }],
            [`${rconPort}/tcp`]: [{ HostPort: rconPort.toString() }],
            [`${queryPort}/udp`]: [{ HostPort: queryPort.toString() }],
          },
          Binds: [`${volumeName}:/data`],
          Memory: this.parseMemoryLimit(
            settings?.resource_limits?.memory || '2G'
          ),
          CpuQuota: this.parseCpuLimit(settings?.resource_limits?.cpu),
          RestartPolicy: {
            Name: 'unless-stopped',
          },
        },
        Labels: {
          'mc-server-management.server-id': server.id,
          'mc-server-management.server-name': server.name,
          'mc-server-management.owner-id': server.owner_id,
        },
      });

      // Update server with container info and ports
      await DatabaseService.updateServer(server.id, {
        container_id: container.id,
        game_port: gamePort,
        rcon_port: rconPort,
        query_port: queryPort,
        status: 'stopped',
      });

      console.log(`Created container for server ${server.name} (${server.id})`);
      return true;
    } catch (error) {
      console.error('Error creating server container:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        serverId: server.id,
        serverName: server.name,
      });
      await DatabaseService.updateServer(server.id, { status: 'error' });
      return false;
    }
  }

  // Start a server container
  static async startServer(serverId: string): Promise<boolean> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server || !server.container_id) {
        return false;
      }

      const container = docker.getContainer(server.container_id);

      await DatabaseService.updateServer(serverId, { status: 'starting' });
      await container.start();

      // Wait a moment and check if container is running
      setTimeout(async () => {
        const containerInfo = await container.inspect();
        const status = containerInfo.State.Running ? 'running' : 'error';
        await DatabaseService.updateServer(serverId, { status });
      }, 5000);

      return true;
    } catch (error) {
      console.error('Error starting server:', error);
      await DatabaseService.updateServer(serverId, { status: 'error' });
      return false;
    }
  }

  // Stop a server container
  static async stopServer(serverId: string): Promise<boolean> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server || !server.container_id) {
        return false;
      }

      const container = docker.getContainer(server.container_id);

      await DatabaseService.updateServer(serverId, { status: 'stopping' });
      await container.stop({ t: 30 }); // 30 second graceful shutdown
      await DatabaseService.updateServer(serverId, { status: 'stopped' });

      return true;
    } catch (error) {
      console.error('Error stopping server:', error);
      return false;
    }
  }

  // Restart a server container
  static async restartServer(serverId: string): Promise<boolean> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server || !server.container_id) {
        return false;
      }

      const container = docker.getContainer(server.container_id);

      await DatabaseService.updateServer(serverId, { status: 'starting' });
      await container.restart({ t: 30 });

      // Wait and check status
      setTimeout(async () => {
        const containerInfo = await container.inspect();
        const status = containerInfo.State.Running ? 'running' : 'error';
        await DatabaseService.updateServer(serverId, { status });
      }, 5000);

      return true;
    } catch (error) {
      console.error('Error restarting server:', error);
      await DatabaseService.updateServer(serverId, { status: 'error' });
      return false;
    }
  }

  // Delete a server container and its data
  static async deleteServer(serverId: string): Promise<boolean> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return false;
      }

      // Stop and remove container if it exists
      if (server.container_id) {
        try {
          const container = docker.getContainer(server.container_id);
          await container.stop({ t: 10 });
          await container.remove();
        } catch (
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          _error
        ) {
          console.log('Container already removed or not found');
        }
      }

      // Remove server volume
      const volumeName = `mc-data-${serverId}`;
      try {
        const volume = docker.getVolume(volumeName);
        await volume.remove();
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _error
      ) {
        console.log(`Volume ${volumeName} not found or could not be removed.`);
      }

      return true;
    } catch (error) {
      console.error('Error deleting server:', error);
      return false;
    }
  }

  // Get container information
  static async getContainerInfo(
    serverId: string
  ): Promise<ContainerInfo | null> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server || !server.container_id) {
        return null;
      }

      const container = docker.getContainer(server.container_id);
      const containerInfo = await container.inspect();

      return {
        id: containerInfo.Id,
        name: containerInfo.Name,
        status: containerInfo.State.Status,
        ports: Object.entries(containerInfo.NetworkSettings.Ports || {}).map(
          ([port, bindings]) => ({
            private: parseInt(port.split('/')[0]),
            public: bindings?.[0]?.HostPort
              ? parseInt(bindings[0].HostPort)
              : undefined,
            type: port.split('/')[1],
          })
        ),
        created: containerInfo.Created,
        image: containerInfo.Config.Image,
      };
    } catch (error) {
      console.error('Error getting container info:', error);
      return null;
    }
  }

  // Get container logs
  static async getContainerLogs(
    serverId: string,
    tail: number = 1000
  ): Promise<string> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server || !server.container_id) {
        return '';
      }

      const container = docker.getContainer(server.container_id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      });

      return logs.toString();
    } catch (error) {
      console.error('Error getting container logs:', error);
      return '';
    }
  }

  // Stream container logs
  static async streamContainerLogs(
    serverId: string
  ): Promise<NodeJS.ReadableStream | null> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server || !server.container_id) {
        return null;
      }

      const container = docker.getContainer(server.container_id);
      const logStream = (await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        timestamps: true,
      })) as NodeJS.ReadableStream; // Type assertion to handle Docker API stream type

      return logStream;
    } catch (error) {
      console.error('Error streaming container logs:', error);
      return null;
    }
  }

  // Install prometheus exporter plugin
  static async installPrometheusExporter(serverId: string): Promise<boolean> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return false;
      }

      const volumeName = `mc-data-${server.id}`;
      const helperImage = 'alpine'; // A small image to perform file operations

      // Ensure the helper image is available
      await docker.pull(helperImage);

      const cmd = [
        '/bin/sh',
        '-c',
        `
          apk add --no-cache wget &&
          mkdir -p /data/plugins &&
          wget -O /data/plugins/minecraft-prometheus-exporter.jar https://github.com/sladkoff/minecraft-prometheus-exporter/releases/latest/download/minecraft-prometheus-exporter.jar &&
          mkdir -p /data/plugins/minecraft-prometheus-exporter &&
          echo "enable_metrics: true
metrics_port: 9225
enable_player_metrics: true
enable_server_metrics: true
enable_world_metrics: true
update_interval: 15" > /data/plugins/minecraft-prometheus-exporter/config.yml
        `,
      ];

      const container = await docker.createContainer({
        Image: helperImage,
        Cmd: cmd,
        HostConfig: {
          Binds: [`${volumeName}:/data`],
        },
      });

      await container.start();
      const result = await container.wait();

      if (result.StatusCode !== 0) {
        const logs = await container.logs({ stdout: true, stderr: true });
        console.error(
          `Error installing prometheus exporter for server ${serverId}:`,
          logs.toString()
        );
        await container.remove();
        return false;
      }

      await container.remove();

      console.log(
        `Prometheus exporter plugin installed for server ${serverId}`
      );
      return true;
    } catch (_error) {
      console.error('Error installing prometheus exporter plugin:', _error);
      return false;
    }
  }

  // Remove prometheus exporter plugin
  // Remove prometheus exporter plugin
  static async removePrometheusExporter(serverId: string): Promise<boolean> {
    try {
      const server = await DatabaseService.getServerById(serverId);
      if (!server) {
        return false;
      }

      const volumeName = `mc-data-${server.id}`;
      const helperImage = 'alpine'; // A small image to perform file operations

      // Ensure the helper image is available
      await docker.pull(helperImage);

      const cmd = [
        '/bin/sh',
        '-c',
        'rm -rf /data/plugins/minecraft-prometheus-exporter.jar /data/plugins/minecraft-prometheus-exporter',
      ];

      const container = await docker.createContainer({
        Image: helperImage,
        Cmd: cmd,
        HostConfig: {
          Binds: [`${volumeName}:/data`],
        },
      });

      await container.start();
      await container.wait();
      await container.remove();

      console.log(`Prometheus exporter plugin removed for server ${serverId}`);
      return true;
    } catch (_error) {
      console.error('Error removing prometheus exporter plugin:', _error);
      return false;
    }
  }

  // Check if prometheus exporter is installed
  static async isPrometheusExporterInstalled(
    serverId: string
  ): Promise<boolean> {
    try {
      const volumeName = `mc-data-${serverId}`;
      const helperImage = 'alpine';

      // Ensure the helper image is available
      await docker.pull(helperImage);

      const cmd = [
        '/bin/sh',
        '-c',
        'test -f /data/plugins/minecraft-prometheus-exporter.jar',
      ];

      const container = await docker.createContainer({
        Image: helperImage,
        Cmd: cmd,
        HostConfig: {
          Binds: [`${volumeName}:/data`],
        },
      });

      await container.start();
      const result = await container.wait();
      await container.remove();

      return result.StatusCode === 0;
    } catch {
      // If the volume does not exist, it will throw an error.
      return false;
    }
  }

  // Update prometheus exporter configuration
  static async updatePrometheusExporterConfig(
    serverId: string,
    config: unknown
  ): Promise<boolean> {
    try {
      if (!(await this.isPrometheusExporterInstalled(serverId))) {
        return false;
      }

      const volumeName = `mc-data-${serverId}`;
      const helperImage = 'alpine';

      const configObj = config as Record<string, unknown>;
      const configContent = `# Prometheus Exporter Configuration
# Generated automatically by MC Server Management

enable_metrics: ${configObj.enable_metrics || true}
metrics_port: ${configObj.metrics_port || 9225}
enable_player_metrics: ${configObj.enable_player_metrics || true}
enable_server_metrics: ${configObj.enable_server_metrics || true}
enable_world_metrics: ${configObj.enable_world_metrics || true}
update_interval: ${configObj.update_interval || 15}
`;

      const cmd = [
        '/bin/sh',
        '-c',
        `echo "${configContent}" > /data/plugins/minecraft-prometheus-exporter/config.yml`,
      ];

      const container = await docker.createContainer({
        Image: helperImage,
        Cmd: cmd,
        HostConfig: {
          Binds: [`${volumeName}:/data`],
        },
      });

      await container.start();
      const result = await container.wait();

      if (result.StatusCode !== 0) {
        const logs = await container.logs({ stdout: true, stderr: true });
        console.error(
          `Error updating prometheus exporter config for server ${serverId}:`,
          logs.toString()
        );
        await container.remove();
        return false;
      }

      await container.remove();

      console.log(`Prometheus exporter config updated for server ${serverId}`);
      return true;
    } catch (_error) {
      console.error('Error updating prometheus exporter config:', _error);
      return false;
    }
  }

  // Helper methods
  private static parseMemoryLimit(memory: string): number {
    const match = memory.match(/^(\d+)([KMGT]?)B?$/i);
    if (!match) return 2 * 1024 * 1024 * 1024; // Default 2GB

    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers = {
      '': 1,
      K: 1024,
      M: 1024 ** 2,
      G: 1024 ** 3,
      T: 1024 ** 4,
    };
    return value * (multipliers[unit] || 1);
  }

  private static parseCpuLimit(cpu?: string): number | undefined {
    if (!cpu) return undefined;

    const match = cpu.match(/^(\d+(?:\.\d+)?)$/);
    if (!match) return undefined;

    // Convert CPU cores to CPU quota (100000 = 1 core)
    return Math.floor(parseFloat(match[1]) * 100000);
  }
}
