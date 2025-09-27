import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Server,
  HardDrive,
  Users,
  Zap,
  Network,
  Globe,
  Database,
  Clock,
  TrendingUp,
  Settings,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
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
  BarChart,
  Bar,
} from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface PrometheusMetrics {
  // Core server metrics
  minecraft_players_online?: number;
  minecraft_players_max?: number;
  minecraft_tps?: number;
  minecraft_memory_used_bytes?: number;
  minecraft_memory_max_bytes?: number;
  minecraft_cpu_usage?: number;

  // World metrics
  minecraft_world_size_bytes?: number;
  minecraft_entities_total?: number;
  minecraft_chunks_loaded?: number;

  // Network metrics
  minecraft_network_bytes_in?: number;
  minecraft_network_bytes_out?: number;

  // RCON metrics
  minecraft_rcon_connected?: number;
  minecraft_rcon_response_time_seconds?: number;

  // Custom metrics
  custom_metrics?: Record<string, any>;

  timestamp?: string;
}

interface PrometheusConfig {
  enabled: boolean;
  port: number;
  endpoint: string;
  status: 'active' | 'inactive' | 'error';
  rcon_enabled?: boolean;
  rcon_port?: number;
  collection_interval?: number;
}

interface PrometheusMetricsProps {
  serverId: string;
}

const PrometheusMetrics: React.FC<PrometheusMetricsProps> = ({ serverId }) => {
  const { session } = useAuth();
  const [metrics, setMetrics] = useState<PrometheusMetrics | null>(null);
  const [historicalMetrics, setHistoricalMetrics] = useState<
    PrometheusMetrics[]
  >([]);
  const [config, setConfig] = useState<PrometheusConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRawMetrics, setShowRawMetrics] = useState(false);
  const [rawMetricsData, setRawMetricsData] = useState<string>('');
  const [configExpanded, setConfigExpanded] = useState(false);

  const fetchPrometheusMetrics = async () => {
    try {
      if (!session?.access_token) return;

      const response = await fetch(`/api/prometheus/${serverId}/metrics`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError(
            'Prometheus metrics not available. Enable Prometheus monitoring first.'
          );
          return;
        }
        throw new Error('Failed to fetch Prometheus metrics');
      }

      const rawData = await response.text();
      setRawMetricsData(rawData);

      // Parse Prometheus metrics format
      const parsedMetrics = parsePrometheusMetrics(rawData);
      setMetrics(parsedMetrics);
      setError(null);
    } catch (err) {
      console.error('Error fetching Prometheus metrics:', err);
      setError('Failed to load Prometheus metrics');
    }
  };

  const fetchPrometheusConfig = async () => {
    try {
      if (!session?.access_token) return;

      const response = await fetch(
        `/api/prometheus/${serverId}/recommended-config`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        console.error('Failed to fetch Prometheus config');
        return;
      }

      const data = await response.json();
      if (data.success && data.data) {
        setConfig({
          enabled: data.data.prometheus_enabled || false,
          port: data.data.prometheus_port || 9225,
          endpoint: `/api/prometheus/${serverId}/metrics`,
          status: data.data.prometheus_enabled ? 'active' : 'inactive',
          rcon_enabled: data.data.rcon_enabled || false,
          rcon_port: data.data.rcon_port || 25575,
          collection_interval: data.data.collection_interval || 30,
        });
      }
    } catch (err) {
      console.error('Error fetching Prometheus config:', err);
    }
  };

  const validatePrometheusConfig = async () => {
    try {
      if (!session?.access_token) return;

      const response = await fetch(
        `/api/prometheus/${serverId}/validate-config`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success('Prometheus configuration is valid');
      } else {
        toast.error(
          `Configuration validation failed: ${data.error || 'Unknown error'}`
        );
      }
    } catch (err) {
      console.error('Error validating config:', err);
      toast.error('Failed to validate configuration');
    }
  };

  const togglePrometheusMonitoring = async () => {
    if (!config || !session?.access_token) return;

    try {
      setRefreshing(true);
      const response = await fetch(`/api/metrics/${serverId}/config`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prometheus_enabled: !config.enabled,
          prometheus_port: config.port,
          rcon_enabled: config.rcon_enabled,
          rcon_port: config.rcon_port,
          collection_interval: config.collection_interval,
        }),
      });

      if (!response.ok) throw new Error('Failed to update monitoring config');

      await fetchPrometheusConfig();
      toast.success(
        `Prometheus monitoring ${!config.enabled ? 'enabled' : 'disabled'}`
      );
    } catch (err) {
      console.error('Error toggling Prometheus monitoring:', err);
      toast.error('Failed to update monitoring configuration');
    } finally {
      setRefreshing(false);
    }
  };

  const parsePrometheusMetrics = (rawData: string): PrometheusMetrics => {
    const metrics: PrometheusMetrics = { timestamp: new Date().toISOString() };
    const lines = rawData.split('\n');

    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;

      const match = line.match(
        /^([a-zA-Z_:][a-zA-Z0-9_:]*(?:\{[^}]*\})?) (.+)$/
      );
      if (!match) continue;

      const [, metricName, value] = match;
      const numValue = parseFloat(value);

      // Map Prometheus metric names to our interface
      const cleanName = metricName.split('{')[0]; // Remove labels for now
      switch (cleanName) {
        case 'minecraft_players_online':
          metrics.minecraft_players_online = numValue;
          break;
        case 'minecraft_players_max':
          metrics.minecraft_players_max = numValue;
          break;
        case 'minecraft_tps':
          metrics.minecraft_tps = numValue;
          break;
        case 'minecraft_memory_used_bytes':
          metrics.minecraft_memory_used_bytes = numValue;
          break;
        case 'minecraft_memory_max_bytes':
          metrics.minecraft_memory_max_bytes = numValue;
          break;
        case 'minecraft_cpu_usage':
          metrics.minecraft_cpu_usage = numValue;
          break;
        case 'minecraft_world_size_bytes':
          metrics.minecraft_world_size_bytes = numValue;
          break;
        case 'minecraft_entities_total':
          metrics.minecraft_entities_total = numValue;
          break;
        case 'minecraft_chunks_loaded':
          metrics.minecraft_chunks_loaded = numValue;
          break;
        case 'minecraft_network_bytes_in':
          metrics.minecraft_network_bytes_in = numValue;
          break;
        case 'minecraft_network_bytes_out':
          metrics.minecraft_network_bytes_out = numValue;
          break;
        case 'minecraft_rcon_connected':
          metrics.minecraft_rcon_connected = numValue;
          break;
        case 'minecraft_rcon_response_time_seconds':
          metrics.minecraft_rcon_response_time_seconds = numValue;
          break;
        default:
          // Store custom metrics
          if (!metrics.custom_metrics) metrics.custom_metrics = {};
          metrics.custom_metrics[cleanName] = numValue;
      }
    }

    return metrics;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    return `${seconds.toFixed(3)}s`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'inactive':
        return <XCircle className="h-4 w-4 text-gray-400" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-blue-600" />;
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([fetchPrometheusMetrics(), fetchPrometheusConfig()]);
    setRefreshing(false);
  };

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await refreshData();
      setLoading(false);
    };

    loadInitialData();

    // Set up polling for real-time updates
    const interval = setInterval(
      () => {
        if (config?.enabled) {
          fetchPrometheusMetrics();
        }
      },
      (config?.collection_interval || 30) * 1000
    );

    return () => clearInterval(interval);
  }, [serverId, config?.enabled, config?.collection_interval]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>Prometheus Monitoring</span>
              </CardTitle>
              <CardDescription>
                Real-time metrics collection and monitoring for your Minecraft
                server
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshData}
                disabled={refreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfigExpanded(!configExpanded)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Config
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {config && getStatusIcon(config.status)}
                <span className="font-medium">
                  {config?.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {config?.enabled && (
                <Badge variant="secondary">Port: {config.port}</Badge>
              )}
            </div>
            <Button
              variant={config?.enabled ? 'destructive' : 'default'}
              size="sm"
              onClick={togglePrometheusMonitoring}
              disabled={refreshing}
            >
              {config?.enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>

          {configExpanded && config && (
            <div className="mt-4 p-4 border rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prometheus Port</Label>
                  <Input value={config.port} readOnly />
                </div>
                <div>
                  <Label>Collection Interval</Label>
                  <Input value={`${config.collection_interval}s`} readOnly />
                </div>
              </div>
              <div>
                <Label>Metrics Endpoint</Label>
                <div className="flex items-center space-x-2">
                  <Input value={config.endpoint} readOnly className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(config.endpoint)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(config.endpoint, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={validatePrometheusConfig}
                >
                  Validate Config
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRawMetrics(!showRawMetrics)}
                >
                  {showRawMetrics ? (
                    <EyeOff className="h-4 w-4 mr-2" />
                  ) : (
                    <Eye className="h-4 w-4 mr-2" />
                  )}
                  Raw Metrics
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showRawMetrics && rawMetricsData && (
        <Card>
          <CardHeader>
            <CardTitle>Raw Prometheus Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
              {rawMetricsData}
            </pre>
          </CardContent>
        </Card>
      )}

      {config?.enabled && metrics && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="world">World Stats</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Players */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Players Online
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics.minecraft_players_online || 0}
                    {metrics.minecraft_players_max && (
                      <span className="text-sm text-muted-foreground">
                        /{metrics.minecraft_players_max}
                      </span>
                    )}
                  </div>
                  {metrics.minecraft_players_max && (
                    <Progress
                      value={
                        ((metrics.minecraft_players_online || 0) /
                          metrics.minecraft_players_max) *
                        100
                      }
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              {/* TPS */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Server TPS
                  </CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics.minecraft_tps?.toFixed(1) || '20.0'}
                  </div>
                  <div
                    className={`text-xs mt-1 ${
                      (metrics.minecraft_tps || 20) >= 19
                        ? 'text-green-600'
                        : (metrics.minecraft_tps || 20) >= 15
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    }`}
                  >
                    {(metrics.minecraft_tps || 20) >= 19
                      ? 'Excellent'
                      : (metrics.minecraft_tps || 20) >= 15
                        ? 'Good'
                        : 'Poor'}
                  </div>
                </CardContent>
              </Card>

              {/* Memory */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Memory Usage
                  </CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics.minecraft_memory_used_bytes &&
                    metrics.minecraft_memory_max_bytes
                      ? `${((metrics.minecraft_memory_used_bytes / metrics.minecraft_memory_max_bytes) * 100).toFixed(1)}%`
                      : 'N/A'}
                  </div>
                  {metrics.minecraft_memory_used_bytes &&
                    metrics.minecraft_memory_max_bytes && (
                      <>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatBytes(metrics.minecraft_memory_used_bytes)} /{' '}
                          {formatBytes(metrics.minecraft_memory_max_bytes)}
                        </div>
                        <Progress
                          value={
                            (metrics.minecraft_memory_used_bytes /
                              metrics.minecraft_memory_max_bytes) *
                            100
                          }
                          className="mt-2"
                        />
                      </>
                    )}
                </CardContent>
              </Card>

              {/* RCON Status */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    RCON Status
                  </CardTitle>
                  <Server className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-2">
                    {metrics.minecraft_rcon_connected ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">
                      {metrics.minecraft_rcon_connected
                        ? 'Connected'
                        : 'Disconnected'}
                    </span>
                  </div>
                  {metrics.minecraft_rcon_response_time_seconds && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Response:{' '}
                      {formatDuration(
                        metrics.minecraft_rcon_response_time_seconds
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* CPU Usage */}
              {metrics.minecraft_cpu_usage !== undefined && (
                <Card>
                  <CardHeader>
                    <CardTitle>CPU Usage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">
                      {metrics.minecraft_cpu_usage.toFixed(1)}%
                    </div>
                    <Progress
                      value={metrics.minecraft_cpu_usage}
                      className="mb-2"
                    />
                  </CardContent>
                </Card>
              )}

              {/* Memory Chart would go here with historical data */}
            </div>
          </TabsContent>

          <TabsContent value="network" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Network In */}
              {metrics.minecraft_network_bytes_in !== undefined && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Network In
                    </CardTitle>
                    <Network className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatBytes(metrics.minecraft_network_bytes_in)}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Network Out */}
              {metrics.minecraft_network_bytes_out !== undefined && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Network Out
                    </CardTitle>
                    <Network className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatBytes(metrics.minecraft_network_bytes_out)}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="world" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* World Size */}
              {metrics.minecraft_world_size_bytes !== undefined && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      World Size
                    </CardTitle>
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatBytes(metrics.minecraft_world_size_bytes)}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Entities */}
              {metrics.minecraft_entities_total !== undefined && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Total Entities
                    </CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {metrics.minecraft_entities_total.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Chunks Loaded */}
              {metrics.minecraft_chunks_loaded !== undefined && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Chunks Loaded
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {metrics.minecraft_chunks_loaded.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {config?.enabled && !metrics && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Collecting Metrics...
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              Prometheus monitoring is enabled. Metrics will appear here once
              data collection begins.
            </p>
          </CardContent>
        </Card>
      )}

      {!config?.enabled && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              Prometheus Monitoring Disabled
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              Enable Prometheus monitoring to start collecting detailed metrics
              from your Minecraft server.
            </p>
            <Button
              className="mt-4"
              onClick={togglePrometheusMonitoring}
              disabled={refreshing}
            >
              Enable Monitoring
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PrometheusMetrics;
