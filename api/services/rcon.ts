import { Socket } from 'net';

export interface RconConfig {
  host: string;
  port: number;
  password: string;
  timeout?: number;
}

export interface RconResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export interface MinecraftMetrics {
  tps?: number;
  player_count: number;
  max_players?: number;
  world_size?: number;
  entities?: number;
  chunks_loaded?: number;
  memory_used?: number;
  memory_max?: number;
  uptime?: number;
  custom: Record<string, unknown>;
}

export class RconService {
  private static connections: Map<string, RconConnection> = new Map();

  static async connect(serverId: string, config: RconConfig): Promise<boolean> {
    try {
      const connection = new RconConnection(config);
      const success = await connection.connect();

      if (success) {
        this.connections.set(serverId, connection);
        console.log(`RCON connected for server ${serverId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Failed to connect RCON for server ${serverId}:`, error);
      return false;
    }
  }

  static async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (connection) {
      await connection.disconnect();
      this.connections.delete(serverId);
      console.log(`RCON disconnected for server ${serverId}`);
    }
  }

  static async executeCommand(
    serverId: string,
    command: string
  ): Promise<RconResponse> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return { success: false, error: 'No RCON connection found' };
    }

    return await connection.execute(command);
  }

  static async getMinecraftMetrics(
    serverId: string
  ): Promise<MinecraftMetrics> {
    const defaultMetrics: MinecraftMetrics = {
      player_count: 0,
      custom: { rcon_available: false },
    };

    const connection = this.connections.get(serverId);
    if (!connection || !connection.isConnected()) {
      return defaultMetrics;
    }

    try {
      const metrics: MinecraftMetrics = {
        player_count: 0,
        custom: { rcon_available: true },
      };

      // Get player count and list
      const listResponse = await connection.execute('list');
      if (listResponse.success && listResponse.data) {
        const playerMatch = listResponse.data.match(
          /There are (\d+) of a max of (\d+) players online/
        );
        if (playerMatch) {
          metrics.player_count = parseInt(playerMatch[1]);
          metrics.max_players = parseInt(playerMatch[2]);
        }
      }

      // Get TPS (if available - works on Paper/Spigot)
      const tpsResponse = await connection.execute('tps');
      if (tpsResponse.success && tpsResponse.data) {
        const tpsMatch = tpsResponse.data.match(
          /TPS from last 1m, 5m, 15m: ([0-9.]+)/
        );
        if (tpsMatch) {
          metrics.tps = parseFloat(tpsMatch[1]);
        }
      }

      // Get memory info (if available)
      const memResponse = await connection.execute('memory');
      if (memResponse.success && memResponse.data) {
        const memMatch = memResponse.data.match(
          /Memory use: (\d+) MB \/ (\d+) MB/
        );
        if (memMatch) {
          metrics.memory_used = parseInt(memMatch[1]);
          metrics.memory_max = parseInt(memMatch[2]);
        }
      }

      // Get world info
      const worldResponse = await connection.execute('forge tps');
      if (worldResponse.success && worldResponse.data) {
        // Parse world-specific data if available
        metrics.custom.world_data = worldResponse.data;
      }

      // Get entity count (if available)
      const entityResponse = await connection.execute('forge entity list');
      if (entityResponse.success && entityResponse.data) {
        const entityMatch = entityResponse.data.match(/Total: (\d+)/);
        if (entityMatch) {
          metrics.entities = parseInt(entityMatch[1]);
        }
      }

      return metrics;
    } catch (error) {
      console.error(
        `Error getting RCON metrics for server ${serverId}:`,
        error
      );
      return {
        ...defaultMetrics,
        custom: { rcon_available: true, error: error.message },
      };
    }
  }

  static isConnected(serverId: string): boolean {
    const connection = this.connections.get(serverId);
    return connection ? connection.isConnected() : false;
  }

  static getConnectionCount(): number {
    return this.connections.size;
  }

  static async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map(serverId =>
      this.disconnect(serverId)
    );
    await Promise.all(promises);
  }
}

class RconConnection {
  private socket: Socket | null = null;
  private config: RconConfig;
  private requestId = 1;
  private connected = false;
  private authenticated = false;

  constructor(config: RconConfig) {
    this.config = {
      timeout: 5000,
      ...config,
    };
  }

  async connect(): Promise<boolean> {
    return new Promise(resolve => {
      this.socket = new Socket();

      const timeout = setTimeout(() => {
        this.socket?.destroy();
        resolve(false);
      }, this.config.timeout);

      this.socket.on('connect', async () => {
        clearTimeout(timeout);
        this.connected = true;

        // Authenticate
        const authSuccess = await this.authenticate();
        resolve(authSuccess);
      });

      this.socket.on('error', error => {
        clearTimeout(timeout);
        console.error('RCON connection error:', error);
        resolve(false);
      });

      this.socket.connect(this.config.port, this.config.host);
    });
  }

  private async authenticate(): Promise<boolean> {
    if (!this.socket || !this.connected) return false;

    return new Promise(resolve => {
      const packet = this.createPacket(3, this.config.password); // Type 3 = auth

      const timeout = setTimeout(() => {
        resolve(false);
      }, this.config.timeout);

      const onData = (data: Buffer) => {
        clearTimeout(timeout);
        this.socket?.off('data', onData);

        const response = this.parsePacket(data);
        this.authenticated = response.id === this.requestId - 1;
        resolve(this.authenticated);
      };

      this.socket.on('data', onData);
      this.socket.write(packet);
    });
  }

  async execute(command: string): Promise<RconResponse> {
    if (!this.socket || !this.connected || !this.authenticated) {
      return { success: false, error: 'Not connected or authenticated' };
    }

    return new Promise(resolve => {
      const packet = this.createPacket(2, command); // Type 2 = command

      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Command timeout' });
      }, this.config.timeout);

      const onData = (data: Buffer) => {
        clearTimeout(timeout);
        this.socket?.off('data', onData);

        try {
          const response = this.parsePacket(data);
          resolve({ success: true, data: response.body });
        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      };

      this.socket.on('data', onData);
      this.socket.write(packet);
    });
  }

  private createPacket(type: number, body: string): Buffer {
    const id = this.requestId++;
    const bodyBuffer = Buffer.from(body, 'utf8');
    const length = 10 + bodyBuffer.length; // 4 + 4 + body + 1 + 1

    const packet = Buffer.alloc(4 + length);
    packet.writeInt32LE(length, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    bodyBuffer.copy(packet, 12);
    packet.writeInt8(0, 12 + bodyBuffer.length); // Null terminator
    packet.writeInt8(0, 13 + bodyBuffer.length); // Null terminator

    return packet;
  }

  private parsePacket(data: Buffer): {
    id: number;
    type: number;
    body: string;
  } {
    if (data.length < 12) {
      throw new Error('Invalid packet length');
    }

    const length = data.readInt32LE(0);
    const id = data.readInt32LE(4);
    const type = data.readInt32LE(8);
    const body = data.slice(12, 12 + length - 10).toString('utf8');

    return { id, type, body };
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.authenticated = false;
  }

  isConnected(): boolean {
    return this.connected && this.authenticated;
  }
}
