import { supabaseAdmin } from '../config/supabase.js';
import type {
  User,
  Server,
  ServerSettings,
  Metrics,
  Log,
  AuditLog,
  CreateServerRequest,
  UpdateServerRequest,
  ServerWithSettings,
} from '../../shared/types.js';

export class DatabaseService {
  // User operations
  static async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }

    return data;
  }

  static async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error fetching user by email:', error);
      return null;
    }

    return data;
  }

  static async updateUserAllowedStatus(
    userId: string,
    isAllowed: boolean,
    actorId: string
  ): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ is_allowed: isAllowed, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      console.error('Error updating user allowed status:', error);
      return false;
    }

    // Log audit event
    await this.createAuditLog({
      actor_user_id: actorId,
      action: isAllowed ? 'user_allowed' : 'user_disallowed',
      target_type: 'user',
      target_id: userId,
      metadata: { is_allowed: isAllowed },
    });

    return true;
  }

  static async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all users:', error);
      return [];
    }

    return data || [];
  }

  // Server operations
  static async createServer(
    serverData: CreateServerRequest & { owner_id: string }
  ): Promise<Server | null> {
    const { data, error } = await supabaseAdmin
      .from('servers')
      .insert({
        name: serverData.name,
        type: serverData.type,
        mc_version: serverData.mc_version || 'latest',
        owner_id: serverData.owner_id,
        machine_id: serverData.machine_id,
        status: 'stopped',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating server:', error);
      return null;
    }

    // Create server settings if provided
    if (
      serverData.env_vars ||
      serverData.resource_limits ||
      serverData.rcon_enabled !== undefined
    ) {
      await this.createServerSettings({
        server_id: data.id,
        env_vars: serverData.env_vars || {},
        resource_limits: serverData.resource_limits || {},
        rcon_enabled: serverData.rcon_enabled || false,
      });
    }

    return data;
  }

  static async getServerById(id: string): Promise<ServerWithSettings | null> {
    const { data, error } = await supabaseAdmin
      .from('servers')
      .select(
        `
        *,
        settings:server_settings(*)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching server:', error);
      return null;
    }

    return {
      ...data,
      settings: data.settings?.[0] || null,
    };
  }

  static async getServersByOwner(
    ownerId: string
  ): Promise<ServerWithSettings[]> {
    const { data, error } = await supabaseAdmin
      .from('servers')
      .select(
        `
        *,
        settings:server_settings(*)
      `
      )
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching servers by owner:', error);
      return [];
    }

    return (data || []).map(server => ({
      ...server,
      settings: server.settings?.[0] || null,
    }));
  }

  static async getAllServers(): Promise<ServerWithSettings[]> {
    const { data, error } = await supabaseAdmin
      .from('servers')
      .select(
        `
        *,
        settings:server_settings(*)
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all servers:', error);
      return [];
    }

    return (data || []).map(server => ({
      ...server,
      settings: server.settings?.[0] || null,
    }));
  }

  static async updateServer(
    id: string,
    updates: Partial<Server>
  ): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('servers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error updating server:', error);
      return false;
    }

    return true;
  }

  static async deleteServer(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin.from('servers').delete().eq('id', id);

    if (error) {
      console.error('Error deleting server:', error);
      return false;
    }

    return true;
  }

  // Server settings operations
  static async createServerSettings(
    settings: Omit<ServerSettings, 'id' | 'created_at' | 'updated_at'>
  ): Promise<ServerSettings | null> {
    const { data, error } = await supabaseAdmin
      .from('server_settings')
      .insert(settings)
      .select()
      .single();

    if (error) {
      console.error('Error creating server settings:', error);
      return null;
    }

    return data;
  }

  static async getServerSettings(
    serverId: string
  ): Promise<ServerSettings | null> {
    const { data, error } = await supabaseAdmin
      .from('server_settings')
      .select('*')
      .eq('server_id', serverId)
      .single();

    if (error) {
      console.error('Error fetching server settings:', error);
      return null;
    }

    return data;
  }

  static async updateServerSettings(
    serverId: string,
    updates: Partial<ServerSettings>
  ): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('server_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('server_id', serverId);

    if (error) {
      console.error('Error updating server settings:', error);
      return false;
    }

    return true;
  }

  // Metrics operations
  static async createMetrics(
    metrics: Omit<Metrics, 'id' | 'timestamp'>
  ): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('metrics')
      .insert({ ...metrics, timestamp: new Date().toISOString() });

    if (error) {
      console.error('Error creating metrics:', error);
      return false;
    }

    return true;
  }

  static async getServerMetrics(
    serverId: string,
    limit: number = 100
  ): Promise<Metrics[]> {
    const { data, error } = await supabaseAdmin
      .from('metrics')
      .select('*')
      .eq('server_id', serverId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching server metrics:', error);
      return [];
    }

    return data || [];
  }

  // Logs operations
  static async createLog(log: Omit<Log, 'id' | 'timestamp'>): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('logs')
      .insert({ ...log, timestamp: new Date().toISOString() });

    if (error) {
      console.error('Error creating log:', error);
      return false;
    }

    return true;
  }

  static async getServerLogs(
    serverId: string,
    limit: number = 1000,
    level?: string
  ): Promise<Log[]> {
    let query = supabaseAdmin
      .from('logs')
      .select('*')
      .eq('server_id', serverId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (level) {
      query = query.eq('level', level);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching server logs:', error);
      return [];
    }

    return data || [];
  }

  static async clearLogsByServerId(serverId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('server_logs')
      .delete()
      .eq('server_id', serverId);

    if (error) {
      console.error('Error clearing logs for server:', error);
      return false;
    }

    return true;
  }

  // Audit log operations
  static async createAuditLog(
    auditLog: Omit<AuditLog, 'id' | 'created_at'>
  ): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({ ...auditLog, created_at: new Date().toISOString() });

    if (error) {
      console.error('Error creating audit log:', error);
      return false;
    }

    return true;
  }

  static async updateUserRole(
    userId: string,
    role: 'admin' | 'user',
    actorId: string
  ): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      console.error('Error updating user role:', error);
      return false;
    }

    // Log audit event
    await this.createAuditLog({
      actor_user_id: actorId,
      action: 'user_role_updated',
      target_type: 'user',
      target_id: userId,
      metadata: { new_role: role },
    });

    return true;
  }

  static async getAuditLogs(
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLog[]> {
    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select(
        `
        *,
        users:actor_user_id (
          email,
          role
        )
      `
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }

    return data || [];
  }

  static async getSystemStats(): Promise<{
    total_users: number;
    active_users: number;
    total_servers: number;
    running_servers: number;
    total_metrics_collected: number;
    disk_usage_gb: number;
  }> {
    try {
      // Get user stats
      const { data: userStats } = await supabaseAdmin
        .from('users')
        .select('id, is_allowed');

      // Get server stats
      const { data: serverStats } = await supabaseAdmin
        .from('servers')
        .select('id, status');

      // Get metrics count
      const { count: metricsCount } = await supabaseAdmin
        .from('metrics')
        .select('*', { count: 'exact', head: true });

      return {
        total_users: userStats?.length || 0,
        active_users: userStats?.filter(u => u.is_allowed).length || 0,
        total_servers: serverStats?.length || 0,
        running_servers:
          serverStats?.filter(s => s.status === 'running').length || 0,
        total_metrics_collected: metricsCount || 0,
        disk_usage_gb: 0, // TODO: Implement actual disk usage calculation
      };
    } catch (error) {
      console.error('Error fetching system stats:', error);
      return {
        total_users: 0,
        active_users: 0,
        total_servers: 0,
        running_servers: 0,
        total_metrics_collected: 0,
        disk_usage_gb: 0,
      };
    }
  }

  // Prometheus operations
  static async getPrometheusTargets(): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('prometheus_targets')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching prometheus targets:', error);
      return [];
    }

    return data || [];
  }

  static async getPrometheusTargetByServerId(
    serverId: string
  ): Promise<any | null> {
    const { data, error } = await supabaseAdmin
      .from('prometheus_targets')
      .select('*')
      .eq('server_id', serverId)
      .eq('active', true)
      .single();

    if (error) {
      console.error('Error fetching prometheus target by server ID:', error);
      return null;
    }

    return data;
  }

  // Metric alerts operations
  static async createMetricAlert(alertData: any): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('metric_alerts')
      .insert(alertData);

    if (error) {
      console.error('Error creating metric alert:', error);
      return false;
    }

    return true;
  }

  static async getActiveAlerts(serverId?: string): Promise<any[]> {
    let query = supabaseAdmin
      .from('metric_alerts')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (serverId) {
      query = query.eq('server_id', serverId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching active alerts:', error);
      return [];
    }

    return data || [];
  }

  static async resolveAlert(alertId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('metric_alerts')
      .update({
        active: false,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    if (error) {
      console.error('Error resolving alert:', error);
      return false;
    }

    return true;
  }

  // Additional prometheus target operations
  static async createOrUpdatePrometheusTarget(
    targetData: any
  ): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('prometheus_targets')
      .upsert(targetData, { onConflict: 'server_id' });

    if (error) {
      console.error('Error creating/updating prometheus target:', error);
      return false;
    }

    return true;
  }

  static async deactivatePrometheusTarget(serverId: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('prometheus_targets')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('server_id', serverId);

    if (error) {
      console.error('Error deactivating prometheus target:', error);
      return false;
    }

    return true;
  }

  static async getPrometheusTarget(serverId: string): Promise<any | null> {
    const { data, error } = await supabaseAdmin
      .from('prometheus_targets')
      .select('*')
      .eq('server_id', serverId)
      .single();

    if (error) {
      console.error('Error fetching prometheus target:', error);
      return null;
    }

    return data;
  }

  static async getAllPrometheusTargets(): Promise<any[]> {
    const { data, error } = await supabaseAdmin
      .from('prometheus_targets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all prometheus targets:', error);
      return [];
    }

    return data || [];
  }

  static async updatePrometheusTargetLastScrape(
    targetId: string
  ): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from('prometheus_targets')
      .update({
        last_scrape_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetId);

    if (error) {
      console.error('Error updating prometheus target last scrape:', error);
      return false;
    }

    return true;
  }

  // Monitoring configuration operations
  static async getMonitoringConfig(serverId: string): Promise<any | null> {
    const { data, error } = await supabaseAdmin
      .from('monitoring_config')
      .select('*')
      .eq('server_id', serverId)
      .single();

    if (error) {
      console.error('Error fetching monitoring config:', error);
      return null;
    }

    return data;
  }

  static async updateMonitoringConfig(
    serverId: string,
    config: any
  ): Promise<boolean> {
    const { error } = await supabaseAdmin.from('monitoring_config').upsert(
      {
        server_id: serverId,
        ...config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'server_id' }
    );

    if (error) {
      console.error('Error updating monitoring config:', error);
      return false;
    }

    return true;
  }

  // Get latest metrics for a server
  static async getLatestMetrics(serverId: string): Promise<Metrics | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('metrics')
        .select('*')
        .eq('server_id', serverId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No data found
          return null;
        }
        console.error('Error getting latest metrics:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error getting latest metrics:', error);
      return null;
    }
  }
}
