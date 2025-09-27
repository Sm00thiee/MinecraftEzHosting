-- Create machines table
CREATE TABLE IF NOT EXISTS public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  mac_address TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add machine_id to servers table
ALTER TABLE public.servers
ADD COLUMN machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL;

-- Enable RLS on machines table
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for machines table
CREATE POLICY "Users can view their own machines" ON public.machines
  FOR SELECT USING (
    owner_id = auth.uid() AND 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_allowed = true)
  );

CREATE POLICY "Admins can view all machines" ON public.machines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin' AND is_allowed = true
    )
  );

CREATE POLICY "Users can manage their own machines" ON public.machines
  FOR ALL USING (
    owner_id = auth.uid() AND 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_allowed = true)
  );

-- Update updated_at trigger for machines table
CREATE TRIGGER update_machines_updated_at BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_machines_owner_id ON public.machines(owner_id);
CREATE INDEX IF NOT EXISTS idx_servers_machine_id ON public.servers(machine_id);