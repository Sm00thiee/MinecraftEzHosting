-- Database Truncation Script for MC Server Management
-- This script truncates ALL application data while preserving ONLY user accounts
-- 
-- PRESERVED TABLES (User Data ONLY):
-- - users (user accounts and profiles)
--
-- TRUNCATED TABLES (ALL Application Data):
-- - servers (server configurations)
-- - machines (machine registrations)
-- - server_settings (server configuration settings)
-- - server_configurations (server property configurations and templates)
-- - permission_groups (user groups and permissions)
-- - file_permissions (file-level permissions)
-- - configuration_history (configuration change audit trail)
-- - group_members (user-group mappings)
-- - metrics (performance metrics)
-- - logs (server logs)
-- - audit_logs (audit trail)
-- - monitoring_config (monitoring configurations)
-- - prometheus_targets (prometheus scrape targets)
-- - metric_alerts (alert records)

-- WARNING: This script will permanently delete ALL application data except user accounts
-- This includes servers, machines, settings, configurations, permissions, metrics, logs, and monitoring data
-- Make sure to create a backup before running this script

-- Start transaction for safety
BEGIN;

-- Disable foreign key checks temporarily to avoid constraint issues
SET session_replication_role = replica;

-- Truncate ALL application tables except users in correct order (respecting dependencies)
TRUNCATE TABLE public.metric_alerts RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.prometheus_targets RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.monitoring_config RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.audit_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.metrics RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.configuration_history RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.file_permissions RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.server_configurations RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.server_settings RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.servers RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.group_members RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.permission_groups RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.machines RESTART IDENTITY CASCADE;

-- Re-enable foreign key checks
SET session_replication_role = DEFAULT;

-- Verify truncation results (all should show 0 rows)
SELECT 
    'machines' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.machines
UNION ALL
SELECT 
    'permission_groups' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.permission_groups
UNION ALL
SELECT 
    'group_members' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.group_members
UNION ALL
SELECT 
    'servers' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.servers
UNION ALL
SELECT 
    'server_settings' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.server_settings
UNION ALL
SELECT 
    'server_configurations' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.server_configurations
UNION ALL
SELECT 
    'file_permissions' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.file_permissions
UNION ALL
SELECT 
    'configuration_history' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.configuration_history
UNION ALL
SELECT 
    'metrics' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.metrics
UNION ALL
SELECT 
    'logs' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.logs
UNION ALL
SELECT 
    'audit_logs' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.audit_logs
UNION ALL
SELECT 
    'monitoring_config' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.monitoring_config
UNION ALL
SELECT 
    'prometheus_targets' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.prometheus_targets
UNION ALL
SELECT 
    'metric_alerts' as table_name, 
    COUNT(*) as remaining_rows 
FROM public.metric_alerts;

-- Verify ONLY users table is preserved
SELECT 
    'users' as table_name, 
    COUNT(*) as preserved_rows 
FROM public.users;

-- If everything looks correct, commit the transaction
-- COMMIT;

-- If you need to rollback, uncomment the line below instead of COMMIT
-- ROLLBACK;

-- Note: The script ends with the transaction open
-- You must manually COMMIT or ROLLBACK after reviewing the results