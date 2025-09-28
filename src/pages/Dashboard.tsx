import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Server,
  Plus,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Settings,
  Activity,
  LogOut,
  User,
  Shield,
} from 'lucide-react';
import { Server as ServerType } from '@/lib/supabase';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface ServerCardProps {
  server: ServerType;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete: (id: string) => void;
  onManage: (id: string) => void;
}

function ServerCard({
  server,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onManage,
}: ServerCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800';
      case 'stopped':
        return 'bg-gray-100 text-gray-800';
      case 'starting':
        return 'bg-yellow-100 text-yellow-800';
      case 'stopping':
        return 'bg-orange-100 text-orange-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const canStart = server.status === 'stopped';
  const canStop = server.status === 'running';
  const canRestart = server.status === 'running';
  const isTransitioning =
    server.status === 'starting' || server.status === 'stopping';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{server.name}</CardTitle>
            <CardDescription>
              {server.description || 'No description'}
            </CardDescription>
          </div>
          <div
            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(server.status)}`}
          >
            {server.status}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Version:</span>
              <div className="font-medium">{server.version}</div>
            </div>
            <div>
              <span className="text-gray-500">Type:</span>
              <div className="font-medium capitalize">{server.server_type}</div>
            </div>
            <div>
              <span className="text-gray-500">Port:</span>
              <div className="font-medium">{server.port}</div>
            </div>
            <div>
              <span className="text-gray-500">Memory:</span>
              <div className="font-medium">{server.max_memory}MB</div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => onStart(server.id)}
              disabled={!canStart || isTransitioning}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-1" />
              Start
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStop(server.id)}
              disabled={!canStop || isTransitioning}
              className="flex-1"
            >
              <Square className="h-4 w-4 mr-1" />
              Stop
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRestart(server.id)}
              disabled={!canRestart || isTransitioning}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onManage(server.id)}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDelete(server.id)}
              disabled={isTransitioning}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, session, signOut } = useAuth();
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'paper' as 'fabric' | 'spigot' | 'paper' | 'bukkit',
    version: '',
    memory: '2048',
  });

  const fetchVersions = React.useCallback(
    async (serverType: string) => {
      if (!session?.access_token) return;

      setVersionsLoading(true);
      try {
        const response = await fetch(`/api/servers/versions/${serverType}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          // Extract version strings from version objects
          const versions = (data.data?.versions || []).map(
            (v: string | { version: string }) =>
              typeof v === 'string' ? v : v.version
          );
          setAvailableVersions(versions);
          // Set the first version as default if no version is selected
          if (versions.length > 0 && !formData.version) {
            setFormData(prev => ({ ...prev, version: versions[0] }));
          }
        } else {
          toast.error('Failed to fetch versions');
          setAvailableVersions([]);
        }
      } catch (error) {
        console.error('Error fetching versions:', error);
        toast.error('Failed to fetch versions');
        setAvailableVersions([]);
      } finally {
        setVersionsLoading(false);
      }
    },
    [session?.access_token, formData.version]
  );

  const fetchServers = React.useCallback(async () => {
    try {
      if (!session?.access_token) {
        toast.error('No authentication token available');
        return;
      }

      const response = await fetch('/api/servers', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setServers(data.data?.servers || []);
      } else {
        toast.error('Failed to fetch servers');
        setServers([]);
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
      toast.error('Failed to fetch servers');
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) {
      fetchServers();
      // Fetch versions for the default server type
      fetchVersions(formData.type);
    }
  }, [session?.access_token, fetchServers, fetchVersions, formData.type]);

  const handleServerAction = async (action: string, serverId: string) => {
    try {
      if (!session?.access_token) {
        toast.error('No authentication token available');
        return;
      }

      const response = await fetch(`/api/servers/${serverId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        toast.success(`Server ${action} initiated`);
        // Refresh servers to get updated status
        setTimeout(fetchServers, 1000);
      } else {
        const error = await response.json();
        toast.error(error.error || `Failed to ${action} server`);
      }
    } catch (error) {
      console.error(`Error ${action} server:`, error);
      toast.error(`Failed to ${action} server`);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this server? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      if (!session?.access_token) {
        toast.error('No authentication token available');
        return;
      }

      const response = await fetch(`/api/servers/${serverId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        toast.success('Server deleted successfully');
        fetchServers();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete server');
      }
    } catch (error) {
      console.error('Error deleting server:', error);
      toast.error('Failed to delete server');
    }
  };

  const handleManageServer = (serverId: string) => {
    // Navigate to server management page
    window.location.href = `/servers/${serverId}`;
  };

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Server name is required');
      return;
    }

    setCreateLoading(true);

    try {
      if (!session?.access_token) {
        toast.error('No authentication token available');
        return;
      }

      const response = await fetch('/api/servers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          server_type: formData.type,
          version: formData.version,
          memory: parseInt(formData.memory),
        }),
      });

      if (response.ok) {
        toast.success('Server created successfully!');
        setCreateModalOpen(false);
        setFormData({ name: '', type: 'paper', version: '', memory: '2048' });
        fetchServers(); // Refresh the servers list
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create server');
      }
    } catch (error) {
      console.error('Error creating server:', error);
      toast.error('Failed to create server');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'type') {
      const serverType = value as 'fabric' | 'spigot' | 'paper' | 'bukkit';
      setFormData(prev => ({ ...prev, type: serverType, version: '' }));
      fetchVersions(value);
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Server className="h-8 w-8 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">
                MC Server Manager
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <User className="h-4 w-4" />
                <span>{user?.name || user?.email}</span>
                {user?.role === 'admin' && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                    Admin
                  </span>
                )}
              </div>

              {user?.role === 'admin' && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/admin">
                    <Shield className="h-4 w-4 mr-2" />
                    Admin Panel
                  </Link>
                </Button>
              )}

              <Button variant="outline" size="sm" asChild>
                <Link to="/prometheus">
                  <Activity className="h-4 w-4 mr-2" />
                  Prometheus Monitoring
                </Link>
              </Button>

              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Your Servers</h2>
              <p className="text-gray-600 mt-1">
                Manage and monitor your Minecraft servers
              </p>
            </div>
            <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Server
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create New Server</DialogTitle>
                  <DialogDescription>
                    Set up a new Minecraft server with your preferred
                    configuration.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateServer} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Server Name</Label>
                    <Input
                      id="name"
                      placeholder="My Minecraft Server"
                      value={formData.name}
                      onChange={e => handleInputChange('name', e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">Server Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={value => handleInputChange('type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select server type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paper">Paper</SelectItem>
                        <SelectItem value="spigot">Spigot</SelectItem>
                        <SelectItem value="fabric">Fabric</SelectItem>
                        <SelectItem value="bukkit">Bukkit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="version">Minecraft Version</Label>
                    <Select
                      value={formData.version}
                      onValueChange={value =>
                        handleInputChange('version', value)
                      }
                      disabled={
                        versionsLoading || availableVersions.length === 0
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            versionsLoading
                              ? 'Loading versions...'
                              : availableVersions.length === 0
                                ? 'No versions available'
                                : 'Select version'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableVersions.map(version => (
                          <SelectItem key={version} value={version}>
                            {version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="memory">Memory (MB)</Label>
                    <Select
                      value={formData.memory}
                      onValueChange={value =>
                        handleInputChange('memory', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select memory allocation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1024">1 GB</SelectItem>
                        <SelectItem value="2048">2 GB</SelectItem>
                        <SelectItem value="4096">4 GB</SelectItem>
                        <SelectItem value="8192">8 GB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateModalOpen(false)}
                      disabled={createLoading}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createLoading}>
                      {createLoading ? 'Creating...' : 'Create Server'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading servers...</div>
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-12">
            <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No servers yet
            </h3>
            <p className="text-gray-600 mb-6">
              Create your first Minecraft server to get started
            </p>
            <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Server
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create Your First Server</DialogTitle>
                  <DialogDescription>
                    Set up your first Minecraft server to get started.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateServer} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Server Name</Label>
                    <Input
                      id="name"
                      placeholder="My Minecraft Server"
                      value={formData.name}
                      onChange={e => handleInputChange('name', e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">Server Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={value => handleInputChange('type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select server type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paper">Paper</SelectItem>
                        <SelectItem value="spigot">Spigot</SelectItem>
                        <SelectItem value="fabric">Fabric</SelectItem>
                        <SelectItem value="bukkit">Bukkit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="version">Minecraft Version</Label>
                    <Select
                      value={formData.version}
                      onValueChange={value =>
                        handleInputChange('version', value)
                      }
                      disabled={
                        versionsLoading || availableVersions.length === 0
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            versionsLoading
                              ? 'Loading versions...'
                              : availableVersions.length === 0
                                ? 'No versions available'
                                : 'Select version'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableVersions.map(version => (
                          <SelectItem key={version} value={version}>
                            {version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="memory">Memory (MB)</Label>
                    <Select
                      value={formData.memory}
                      onValueChange={value =>
                        handleInputChange('memory', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select memory allocation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1024">1 GB</SelectItem>
                        <SelectItem value="2048">2 GB</SelectItem>
                        <SelectItem value="4096">4 GB</SelectItem>
                        <SelectItem value="8192">8 GB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateModalOpen(false)}
                      disabled={createLoading}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createLoading}>
                      {createLoading ? 'Creating...' : 'Create Server'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {servers.map(server => (
              <ServerCard
                key={server.id}
                server={server}
                onStart={id => handleServerAction('start', id)}
                onStop={id => handleServerAction('stop', id)}
                onRestart={id => handleServerAction('restart', id)}
                onDelete={handleDeleteServer}
                onManage={handleManageServer}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
