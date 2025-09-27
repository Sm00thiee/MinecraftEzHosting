-- Prometheus Integration Migration
-- Creates tables for monitoring configuration, prometheus targets, and metric alerts

-- Create monitoring_config table
CREATE TABLE monitoring_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    prometheus_enabled BOOLEAN DEFAULT false,
    prometheus_port INTEGER DEFAULT 9225,
    custom_monitoring BOOLEAN DEFAULT true,
    scrape_interval INTEGER DEFAULT 30,
    exporter_config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(server_id)
);

-- Create prometheus_targets table
CREATE TABLE prometheus_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    endpoint_url VARCHAR(255) NOT NULL,
    job_name VARCHAR(100) DEFAULT 'minecraft-servers',
    labels JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    last_scrape TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(server_id)
);

-- Create metric_alerts table
CREATE TABLE metric_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    threshold FLOAT NOT NULL,
    current_value FLOAT NOT NULL,
    severity VARCHAR(20) DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX idx_monitoring_config_server_id ON monitoring_config(server_id);
CREATE INDEX idx_prometheus_targets_server_id ON prometheus_targets(server_id);
CREATE INDEX idx_prometheus_targets_active ON prometheus_targets(active);
CREATE INDEX idx_metric_alerts_server_id ON metric_alerts(server_id);
CREATE INDEX idx_metric_alerts_resolved ON metric_alerts(resolved);
CREATE INDEX idx_metric_alerts_severity ON metric_alerts(severity);

-- Grant permissions to anon and authenticated roles
GRANT SELECT ON monitoring_config TO anon;
GRANT ALL PRIVILEGES ON monitoring_config TO authenticated;
GRANT SELECT ON prometheus_targets TO anon;
GRANT ALL PRIVILEGES ON prometheus_targets TO authenticated;
GRANT SELECT ON metric_alerts TO anon;
GRANT ALL PRIVILEGES ON metric_alerts TO authenticated;

-- Insert default monitoring configurations for existing servers
INSERT INTO monitoring_config (server_id, prometheus_enabled, custom_monitoring)
SELECT id, false, true FROM servers
WHERE id NOT IN (SELECT server_id FROM monitoring_config);

-- Create function to automatically create monitoring config for new servers
CREATE OR REPLACE FUNCTION create_default_monitoring_config()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO monitoring_config (server_id, prometheus_enabled, custom_monitoring)
    VALUES (NEW.id, false, true);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically create monitoring config for new servers
CREATE TRIGGER trigger_create_monitoring_config
    AFTER INSERT ON servers
    FOR EACH ROW
    EXECUTE FUNCTION create_default_monitoring_config();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on monitoring_config changes
CREATE TRIGGER trigger_update_monitoring_config_updated_at
    BEFORE UPDATE ON monitoring_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();