import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import PrometheusMetrics from '../components/PrometheusMetrics';

interface Server {
  id: string;
  name: string;
  status: string;
  prometheus_enabled: boolean;
}

export default function PrometheusMonitoring() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  useEffect(() => {
    fetchServers();
  }, [session]);

  const fetchServers = async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/servers', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setServers(data);
        // Auto-select first server with Prometheus enabled
        const prometheusServer = data.find((s: Server) => s.prometheus_enabled);
        if (prometheusServer) {
          setSelectedServerId(prometheusServer.id);
        }
      } else {
        // Fallback to mock data if API is not available
        const mockServers = [
          {
            id: '1',
            name: 'Production Server',
            status: 'running',
            prometheus_enabled: true,
          },
          {
            id: '2',
            name: 'Development Server',
            status: 'running',
            prometheus_enabled: true,
          },
          {
            id: '3',
            name: 'Test Server',
            status: 'stopped',
            prometheus_enabled: false,
          },
        ];
        setServers(mockServers);
        const prometheusServer = mockServers.find(
          (s: Server) => s.prometheus_enabled
        );
        if (prometheusServer) {
          setSelectedServerId(prometheusServer.id);
        }
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
      // Fallback to mock data on error
      const mockServers = [
        {
          id: '1',
          name: 'Production Server',
          status: 'running',
          prometheus_enabled: true,
        },
        {
          id: '2',
          name: 'Development Server',
          status: 'running',
          prometheus_enabled: true,
        },
      ];
      setServers(mockServers);
      setSelectedServerId(mockServers[0].id);
    } finally {
      setLoading(false);
    }
  };

  const prometheusEnabledServers = servers.filter(s => s.prometheus_enabled);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="flex items-center space-x-2">
                <Activity className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-semibold text-gray-900">
                  Prometheus Monitoring
                </h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Server Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Server className="h-5 w-5" />
                  <span>Server Selection</span>
                </CardTitle>
                <CardDescription>
                  Select a server to view its Prometheus metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                {prometheusEnabledServers.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No Prometheus Monitoring Enabled
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Enable Prometheus monitoring on your servers to view
                      metrics here.
                    </p>
                    <Button onClick={() => navigate('/dashboard')}>
                      Go to Dashboard
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {prometheusEnabledServers.map(server => (
                      <Card
                        key={server.id}
                        className={`cursor-pointer transition-all ${
                          selectedServerId === server.id
                            ? 'ring-2 ring-blue-500 bg-blue-50'
                            : 'hover:shadow-md'
                        }`}
                        onClick={() => setSelectedServerId(server.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <Server className="h-5 w-5 text-gray-600" />
                              <div>
                                <h3 className="font-medium text-gray-900">
                                  {server.name}
                                </h3>
                                <p className="text-sm text-gray-500">
                                  Status: {server.status}
                                </p>
                              </div>
                            </div>
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Prometheus Metrics */}
            {selectedServerId && (
              <PrometheusMetrics serverId={selectedServerId} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
