-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_allowed BOOLEAN DEFAULT FALSE,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create servers table
CREATE TABLE IF NOT EXISTS public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fabric', 'spigot', 'paper', 'bukkit')),
  mc_version TEXT NOT NULL,
  build_id TEXT,
  status TEXT DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'starting', 'stopping', 'error')),
  container_id TEXT,
  game_port INTEGER,
  rcon_port INTEGER,
  query_port INTEGER,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create server_settings table
CREATE TABLE IF NOT EXISTS public.server_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  env_vars JSONB DEFAULT '{}',
  resource_limits JSONB DEFAULT '{}',
  rcon_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create metrics table
CREATE TABLE IF NOT EXISTS public.metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cpu_usage DECIMAL(5,2),
  memory_usage DECIMAL(10,2),
  memory_limit DECIMAL(10,2),
  disk_usage DECIMAL(10,2),
  tps DECIMAL(5,2),
  player_count INTEGER DEFAULT 0,
  custom_metrics JSONB DEFAULT '{}'
);

-- Create logs table
CREATE TABLE IF NOT EXISTS public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR', 'DEBUG')),
  message TEXT NOT NULL,
  source TEXT DEFAULT 'minecraft'
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (auth.uid() = id AND is_allowed = true);

CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin' AND is_allowed = true
    )
  );

CREATE POLICY "Admins can update user permissions" ON public.users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin' AND is_allowed = true
    )
  );

-- RLS Policies for servers table
CREATE POLICY "Users can view their own servers" ON public.servers
  FOR SELECT USING (
    owner_id = auth.uid() AND 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_allowed = true)
  );

CREATE POLICY "Admins can view all servers" ON public.servers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin' AND is_allowed = true
    )
  );

CREATE POLICY "Users can manage their own servers" ON public.servers
  FOR ALL USING (
    owner_id = auth.uid() AND 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_allowed = true)
  );

-- RLS Policies for server_settings table
CREATE POLICY "Users can manage settings for their servers" ON public.server_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.servers s 
      JOIN public.users u ON s.owner_id = u.id
      WHERE s.id = server_id AND u.id = auth.uid() AND u.is_allowed = true
    )
  );

-- RLS Policies for metrics table
CREATE POLICY "Users can view metrics for their servers" ON public.metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.servers s 
      JOIN public.users u ON s.owner_id = u.id
      WHERE s.id = server_id AND u.id = auth.uid() AND u.is_allowed = true
    )
  );

-- RLS Policies for logs table
CREATE POLICY "Users can view logs for their servers" ON public.logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.servers s 
      JOIN public.users u ON s.owner_id = u.id
      WHERE s.id = server_id AND u.id = auth.uid() AND u.is_allowed = true
    )
  );

-- RLS Policies for audit_logs table
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin' AND is_allowed = true
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_servers_owner_id ON public.servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_servers_status ON public.servers(status);
CREATE INDEX IF NOT EXISTS idx_metrics_server_id_timestamp ON public.metrics(server_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_server_id_timestamp ON public.logs(server_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(created_at DESC);

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_settings TO authenticated;
GRANT SELECT, INSERT ON public.metrics TO authenticated;
GRANT SELECT, INSERT ON public.logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- Grant permissions to anon users (for initial auth flow)
GRANT SELECT ON public.users TO anon;

-- Function to handle user creation from auth trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, is_allowed, role)
  VALUES (NEW.id, NEW.email, FALSE, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_server_settings_updated_at BEFORE UPDATE ON public.server_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();