import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft,
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Server,
  HardDrive,
  Users,
  Zap,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import PrometheusMetrics from '@/components/PrometheusMetrics';

interface MetricData {
  timestamp: string;
  cpu_usage?: number;
  memory_usage?: number;
  memory_total?: number;
  player_count?: number;
  tps?: number;
  disk_usage?: number;
  disk_total?: number;
}

interface AlertData {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
  resolved: boolean;
}

interface PrometheusConfig {
  enabled: boolean;
  port: number;
  endpoint: string;
  status: 'active' | 'inactive' | 'error';
}

const ServerMetrics: React.FC = () => {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [currentMetrics, setCurrentMetrics] = useState<MetricData | null>(null);
  const [historicalMetrics, setHistoricalMetrics] = useState<MetricData[]>([]);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [prometheusConfig, setPrometheusConfig] =
    useState<PrometheusConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCurrentMetrics = async () => {
    try {
      if (!session?.access_token) {
        setError('Authentication required');
        return;
      }

      const response = await fetch(`/api/metrics/${serverId}/current`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 404) {
          // No metrics available yet
          setCurrentMetrics(null);
          setError(
            'No metrics available yet. Metrics will appear once the monitoring service collects data.'
          );
          return;
        }
        throw new Error('Failed to fetch current metrics');
      }
      const data = await response.json();
      if (!data.success || !data.data?.metrics) {
        setCurrentMetrics(null);
        setError(
          'No metrics available yet. Metrics will appear once the monitoring service collects data.'
        );
      } else {
        setCurrentMetrics(data.data.metrics);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching current metrics:', err);
      setError(
        'Failed to load current metrics. Please check if the server is running and try again.'
      );
    }
  };

  const fetchHistoricalMetrics = async () => {
    try {
      if (!session?.access_token) {
        return;
      }

      const response = await fetch(
        `/api/metrics/${serverId}/history?hours=24&interval=5m`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );
      if (!response.ok) {
        console.error('Failed to fetch historical metrics:', response.status);
        return;
      }
      const data = await response.json();
      if (data.success && data.data?.metrics) {
        setHistoricalMetrics(
          Array.isArray(data.data.metrics) ? data.data.metrics : []
        );
      } else {
        setHistoricalMetrics([]);
      }
    } catch (err) {
      console.error('Error fetching historical metrics:', err);
      setError('Failed to load historical metrics');
    }
  };

  const fetchAlerts = async () => {
    try {
      if (!session?.access_token) {
        setAlerts([]);
        return;
      }

      const response = await fetch(`/api/metrics/${serverId}/alerts`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      if (!response.ok) {
        console.error('Failed to fetch alerts:', response.status);
        setAlerts([]);
        return;
      }
      const data = await response.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setAlerts([]);
    }
  };

  const fetchPrometheusConfig = async () => {
    try {
      if (!session?.access_token) {
        return;
      }

      const response = await fetch(
        `/api/metrics/${serverId}/monitoring/config`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );
      if (!response.ok) {
        console.error('Failed to fetch Prometheus config:', response.status);
        return;
      }
      const data = await response.json();
      if (data.success && data.data?.config) {
        const config = data.data.config;
        setPrometheusConfig({
          enabled: config.prometheus_enabled,
          port: config.prometheus_port,
          endpoint: `/metrics`,
          status: config.prometheus_enabled ? 'active' : 'inactive',
        });
      }
    } catch (err) {
      console.error('Error fetching Prometheus config:', err);
    }
  };

  const togglePrometheusMonitoring = async () => {
    if (!prometheusConfig || !session?.access_token) return;

    try {
      setRefreshing(true);
      const requestBody = {
        prometheus_enabled: !prometheusConfig.enabled,
        // Include prometheus_port when enabling
        ...(!prometheusConfig.enabled && {
          prometheus_port: prometheusConfig.port || 9090,
        }),
      };

      const response = await fetch(
        `/api/metrics/${serverId}/monitoring/config`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) throw new Error('Failed to update monitoring config');

      await fetchPrometheusConfig();
      toast.success(
        `Prometheus monitoring ${!prometheusConfig.enabled ? 'enabled' : 'disabled'}`
      );
    } catch (err) {
      console.error('Error toggling Prometheus monitoring:', err);
      toast.error('Failed to update monitoring configuration');
    } finally {
      setRefreshing(false);
    }
  };

  const refreshAllData = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchCurrentMetrics(),
      fetchHistoricalMetrics(),
      fetchAlerts(),
      fetchPrometheusConfig(),
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (!serverId) return;

    const loadInitialData = async () => {
      setLoading(true);
      await refreshAllData();
      setLoading(false);
    };

    loadInitialData();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchCurrentMetrics();
      fetchAlerts();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [serverId]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600';
      case 'inactive':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4" />;
      case 'inactive':
        return <XCircle className="h-4 w-4" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <XCircle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <span className="ml-2 text-lg">Loading metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={() => navigate(`/servers/${serverId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Server
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Server Metrics</h1>
            <p className="text-muted-foreground">
              Real-time monitoring dashboard
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={refreshAllData}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Prometheus Status */}
      {prometheusConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Server className="h-5 w-5" />
                <span>Prometheus Monitoring</span>
              </div>
              <Button
                variant={prometheusConfig.enabled ? 'destructive' : 'default'}
                onClick={togglePrometheusMonitoring}
                disabled={refreshing}
              >
                {prometheusConfig.enabled ? 'Disable' : 'Enable'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div
                  className={`flex items-center space-x-1 ${getStatusColor(prometheusConfig.status)}`}
                >
                  {getStatusIcon(prometheusConfig.status)}
                  <span className="font-medium capitalize">
                    {prometheusConfig.status}
                  </span>
                </div>
                {prometheusConfig.enabled && (
                  <Badge variant="secondary">
                    Port: {prometheusConfig.port}
                  </Badge>
                )}
              </div>
              {prometheusConfig.enabled && (
                <div className="text-sm text-muted-foreground">
                  Endpoint: {prometheusConfig.endpoint}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="prometheus">Prometheus</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts (
            {Array.isArray(alerts) ? alerts.filter(a => !a.resolved).length : 0}
            )
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Current Metrics Cards */}
          {currentMetrics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    CPU Usage
                  </CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {currentMetrics.cpu_usage?.toFixed(1) || 0}%
                  </div>
                  <Progress
                    value={currentMetrics.cpu_usage || 0}
                    className="mt-2"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Memory Usage
                  </CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {currentMetrics.memory_usage && currentMetrics.memory_total
                      ? `${((currentMetrics.memory_usage / currentMetrics.memory_total) * 100).toFixed(1)}%`
                      : '0%'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatBytes(currentMetrics.memory_usage || 0)} /{' '}
                    {formatBytes(currentMetrics.memory_total || 0)}
                  </div>
                  <Progress
                    value={
                      currentMetrics.memory_usage && currentMetrics.memory_total
                        ? (currentMetrics.memory_usage /
                            currentMetrics.memory_total) *
                          100
                        : 0
                    }
                    className="mt-2"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Players Online
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {currentMetrics.player_count || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">TPS</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {currentMetrics.tps?.toFixed(1) || '20.0'}
                  </div>
                  <div
                    className={`text-xs mt-1 ${
                      (currentMetrics.tps || 20) >= 19
                        ? 'text-green-600'
                        : (currentMetrics.tps || 20) >= 15
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    }`}
                  >
                    {(currentMetrics.tps || 20) >= 19
                      ? 'Excellent'
                      : (currentMetrics.tps || 20) >= 15
                        ? 'Good'
                        : 'Poor'}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  No Metrics Available
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Metrics will appear here once the monitoring service starts
                  collecting data from your server. Make sure your server is
                  running and wait a moment for data collection to begin.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={fetchCurrentMetrics}
                  disabled={refreshing}
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`}
                  />
                  Check Again
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          {historicalMetrics.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>CPU & Memory Usage</CardTitle>
                  <CardDescription>
                    Last hour performance metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={historicalMetrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={value =>
                          new Date(value).toLocaleTimeString()
                        }
                      />
                      <YAxis />
                      <Tooltip
                        labelFormatter={value =>
                          new Date(value).toLocaleString()
                        }
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="cpu_usage"
                        stroke="#8884d8"
                        name="CPU %"
                      />
                      <Line
                        type="monotone"
                        dataKey="memory_usage"
                        stroke="#82ca9d"
                        name="Memory %"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Player Count & TPS</CardTitle>
                  <CardDescription>Server activity metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={historicalMetrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={value =>
                          new Date(value).toLocaleTimeString()
                        }
                      />
                      <YAxis />
                      <Tooltip
                        labelFormatter={value =>
                          new Date(value).toLocaleString()
                        }
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="player_count"
                        stackId="1"
                        stroke="#ffc658"
                        fill="#ffc658"
                        name="Players"
                      />
                      <Area
                        type="monotone"
                        dataKey="tps"
                        stackId="2"
                        stroke="#ff7300"
                        fill="#ff7300"
                        name="TPS"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="prometheus" className="space-y-4">
          <PrometheusMetrics serverId={serverId!} />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map(alert => (
                <Alert
                  key={alert.id}
                  className={alert.resolved ? 'opacity-60' : ''}
                >
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{alert.message}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <Badge
                      variant={
                        alert.resolved
                          ? 'secondary'
                          : alert.type === 'error'
                            ? 'destructive'
                            : 'default'
                      }
                    >
                      {alert.resolved ? 'Resolved' : alert.type}
                    </Badge>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <div className="text-center">
                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    No alerts at this time
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ServerMetrics;
