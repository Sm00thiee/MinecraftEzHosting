import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// Get all machines for the logged-in user
router.get('/', async (req, res) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabase
    .from('machines')
    .select('*')
    .eq('owner_id', user.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// Create a new machine
router.post('/', async (req, res) => {
  const { name, mac_address } = req.body;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabase
    .from('machines')
    .insert([{ name, mac_address, owner_id: user.id }])
    .select();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data[0]);
});

// Get a single machine by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('machines')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: 'Machine not found' });
  }

  res.json(data);
});

// Get all servers for a specific machine
router.get('/:id/servers', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('servers')
    .select('*')
    .eq('machine_id', id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

export default router;
