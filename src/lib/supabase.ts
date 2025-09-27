import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Types for our database
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  is_admin: boolean;
  is_allowed: boolean;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
}

export interface Server {
  id: string;
  name: string;
  description?: string;
  version: string;
  server_type: 'paper' | 'fabric' | 'spigot' | 'bukkit';
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  port: number;
  max_memory: number;
  owner_id: string;
  container_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ServerSettings {
  id: string;
  server_id: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Metrics {
  id: string;
  server_id: string;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_in: number;
  network_out: number;
  players_online: number;
  tps: number;
  timestamp: string;
}

export interface LogEntry {
  id: string;
  server_id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, any>;
  timestamp: string;
}
