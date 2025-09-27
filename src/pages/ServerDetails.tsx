import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  Server,
  Play,
  Square,
  RotateCcw,
  ArrowLeft,
  Activity,
  Settings,
  Network,
  HardDrive,
  Cpu,
  MemoryStick,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Server as ServerType, ContainerInfo } from '../../shared/types';
import { toast } from 'sonner';

export default function ServerDetails() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [server, setServer] = useState<ServerType | null>(null);
  const [containerInfo, setContainerInfo] = useState<ContainerInfo | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchServerDetails = React.useCallback(async () => {
    if (!serverId || !session?.access_token) return;

    try {
      const response = await fetch(`/api/servers/${serverId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setServer(data.data.server);
      } else if (response.status === 404) {
        toast.error('Server not found');
        navigate('/dashboard');
      } else if (response.status === 403) {
        toast.error('Access denied');
        navigate('/dashboard');
      } else {
        toast.error('Failed to fetch server details');
      }
    } catch (error) {
      console.error('Error fetching server details:', error);
      toast.error('Failed to fetch server details');
    } finally {
      setLoading(false);
    }
  }, [serverId, session?.access_token, navigate]);

  const fetchServerStatus = React.useCallback(async () => {
    if (!serverId || !session?.access_token) return;

    try {
      const response = await fetch(`/api/servers/${serverId}/status`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setContainerInfo(data.data.container);
        // Update server status if it changed
        if (server && data.data.status !== server.status) {
          setServer(prev =>
            prev ? { ...prev, status: data.data.status } : null
          );
        }
      }
    } catch (error) {
      console.error('Error fetching server status:', error);
    }
  }, [serverId, session?.access_token, server]);

  useEffect(() => {
    fetchServerDetails();
  }, [fetchServerDetails]);

  useEffect(() => {
    if (server) {
      fetchServerStatus();
      // Set up polling for real-time updates
      const interval = setInterval(fetchServerStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [server, fetchServerStatus]);

  const handleServerAction = async (action: string) => {
    if (!serverId || !session?.access_token) return;

    setActionLoading(action);
    try {
      const response = await fetch(`/api/servers/${serverId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        toast.success(`Server ${action} initiated`);
        // Refresh server details
        setTimeout(() => {
          fetchServerDetails();
          fetchServerStatus();
        }, 1000);
      } else {
        const error = await response.json();
        toast.error(error.error || `Failed to ${action} server`);
      }
    } catch (error) {
      console.error(`Error ${action} server:`, error);
      toast.error(`Failed to ${action} server`);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'stopped':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'starting':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'stopping':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="h-4 w-4" />;
      case 'stopped':
        return <XCircle className="h-4 w-4" />;
      case 'starting':
      case 'stopping':
        return <Clock className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading server details...</p>
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Server not found
          </h2>
          <p className="text-gray-600 mb-4">
            The server you're looking for doesn't exist or you don't have access
            to it.
          </p>
          <Button asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const canStart = server.status === 'stopped';
  const canStop = server.status === 'running';
  const canRestart = server.status === 'running';
  const isTransitioning =
    server.status === 'starting' || server.status === 'stopping';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Link>
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center space-x-2">
                <Server className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-semibold text-gray-900">
                  {server.name}
                </h1>
                <span
                  className={`px-2 py-1 rounded-full text-sm font-medium border ${getStatusColor(server.status)} flex items-center gap-1`}
                >
                  {getStatusIcon(server.status)}
                  {server.status}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                onClick={() => handleServerAction('start')}
                disabled={
                  !canStart || isTransitioning || actionLoading === 'start'
                }
              >
                <Play className="h-4 w-4 mr-1" />
                Start
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleServerAction('stop')}
                disabled={
                  !canStop || isTransitioning || actionLoading === 'stop'
                }
              >
                <Square className="h-4 w-4 mr-1" />
                Stop
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleServerAction('restart')}
                disabled={
                  !canRestart || isTransitioning || actionLoading === 'restart'
                }
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Restart
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Server Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Server Information
                </CardTitle>
                <CardDescription>
                  Basic configuration and details about your server
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Server Name
                      </label>
                      <p className="text-lg font-semibold">{server.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Server Type
                      </label>
                      <p className="text-lg font-semibold capitalize">
                        {server.type}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Minecraft Version
                      </label>
                      <p className="text-lg font-semibold">
                        {server.mc_version}
                      </p>
                    </div>
                    {server.build_id && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">
                          Build ID
                        </label>
                        <p className="text-lg font-semibold">
                          {server.build_id}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Server ID
                      </label>
                      <p className="text-sm font-mono bg-gray-100 p-2 rounded">
                        {server.id}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Created
                      </label>
                      <p className="text-lg">
                        {new Date(server.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Last Updated
                      </label>
                      <p className="text-lg">
                        {new Date(server.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Network Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Network Configuration
                </CardTitle>
                <CardDescription>
                  Port configuration and network settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {server.game_port && (
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <Network className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-500">
                        Game Port
                      </p>
                      <p className="text-2xl font-bold text-blue-600">
                        {server.game_port}
                      </p>
                    </div>
                  )}
                  {server.rcon_port && (
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <Settings className="h-8 w-8 text-green-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-500">
                        RCON Port
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {server.rcon_port}
                      </p>
                    </div>
                  )}
                  {server.query_port && (
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <Activity className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-500">
                        Query Port
                      </p>
                      <p className="text-2xl font-bold text-purple-600">
                        {server.query_port}
                      </p>
                    </div>
                  )}
                </div>
                {!server.game_port &&
                  !server.rcon_port &&
                  !server.query_port && (
                    <div className="text-center py-8 text-gray-500">
                      <Network className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No port configuration available</p>
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>

          {/* Status and Container Info */}
          <div className="space-y-6">
            {/* Current Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Current Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <div
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-lg font-semibold border ${getStatusColor(server.status)}`}
                  >
                    {getStatusIcon(server.status)}
                    {server.status.toUpperCase()}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Last updated: {new Date().toLocaleTimeString()}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Container Information */}
            {containerInfo && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    Container Info
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Container ID
                      </label>
                      <p className="text-sm font-mono bg-gray-100 p-2 rounded break-all">
                        {containerInfo.id.substring(0, 12)}...
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Image
                      </label>
                      <p className="text-sm">{containerInfo.image}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">
                        Created
                      </label>
                      <p className="text-sm">
                        {new Date(containerInfo.created).toLocaleString()}
                      </p>
                    </div>
                    {containerInfo.ports && containerInfo.ports.length > 0 && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">
                          Port Mappings
                        </label>
                        <div className="space-y-1 mt-1">
                          {containerInfo.ports.map((port, index) => (
                            <div
                              key={index}
                              className="text-sm bg-gray-100 p-2 rounded"
                            >
                              {port.public
                                ? `${port.public}:${port.private}`
                                : port.private}{' '}
                              ({port.type})
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => navigate(`/servers/${serverId}/logs`)}
                  >
                    View Logs
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => navigate(`/servers/${serverId}/files`)}
                  >
                    File Manager
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => navigate(`/servers/${serverId}/metrics`)}
                  >
                    View Metrics
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
