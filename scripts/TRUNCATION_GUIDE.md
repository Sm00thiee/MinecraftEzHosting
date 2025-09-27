# Database Truncation Guide

This guide explains how to safely truncate ALL application data while preserving ONLY user accounts in the MC Server Management database.

## Overview

The truncation script removes ALL application data from the following tables:

- `machines` - Machine registrations and configurations
- `servers` - Server instances and configurations
- `server_settings` - Server configuration settings
- `server_configurations` - Server property configurations and templates
- `permission_groups` - User groups and permissions
- `file_permissions` - File-level permissions
- `configuration_history` - Configuration change audit trail
- `group_members` - User-group mappings
- `metrics` - Performance and monitoring metrics
- `logs` - Server operation logs
- `audit_logs` - System audit trail
- `monitoring_config` - Monitoring system configurations
- `prometheus_targets` - Prometheus scrape targets
- `metric_alerts` - Alert records and notifications

**ONLY user accounts are preserved** in this table:

- `users` - User accounts and profiles

## Prerequisites

1. **Database Access**: Ensure you have administrative access to the Supabase database
2. **Backup**: Create a full database backup before proceeding
3. **Maintenance Window**: Schedule this during low-usage periods
4. **Team Notification**: Inform team members about the maintenance
5. **Data Loss Awareness**: Understand that ALL server configurations, machines, and operational data will be permanently deleted

## Safety Checklist

- [ ] Database backup completed
- [ ] Maintenance window scheduled
- [ ] Team members notified
- [ ] Script reviewed and understood
- [ ] Rollback plan prepared

## Execution Methods

### Method 1: Supabase Dashboard (Recommended)

1. **Access Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor

2. **Create Backup**

   ```sql
   -- Run this first to check current data counts
   SELECT
       schemaname,
       tablename,
       n_tup_ins as total_rows
   FROM pg_stat_user_tables
   WHERE schemaname = 'public'
   ORDER BY tablename;
   ```

3. **Execute Truncation Script**
   - Copy the contents of `truncate_operational_tables.sql`
   - Paste into the SQL Editor
   - **DO NOT** run immediately - review the script first

4. **Review Results**
   - The script will show row counts after truncation
   - Verify that operational tables show 0 rows
   - Verify that user data tables still have data

5. **Commit or Rollback**

   ```sql
   -- If results look correct:
   COMMIT;

   -- If something went wrong:
   ROLLBACK;
   ```

### Method 2: Command Line (Advanced)

1. **Connect to Database**

   ```bash
   # Using psql with Supabase connection string
   psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
   ```

2. **Execute Script**

   ```bash
   \i scripts/truncate_operational_tables.sql
   ```

3. **Review and Commit**
   ```sql
   -- Review the output, then:
   COMMIT; -- or ROLLBACK;
   ```

## Post-Execution Steps

1. **Verify Data Integrity**
   - Check that user accounts still exist
   - Verify that ALL other application data has been removed
   - Confirm the application can start with clean state

2. **Restart Services**
   - Restart the API server to clear any cached data
   - Restart monitoring services if applicable

3. **Monitor Application**
   - Check application logs for any errors
   - Verify that new data can be created (servers, machines, etc.)
   - Test user authentication and core functionality

## Rollback Procedure

If issues occur after truncation:

1. **Immediate Rollback** (if transaction is still open):

   ```sql
   ROLLBACK;
   ```

2. **Restore from Backup** (if transaction was committed):
   - Use Supabase backup restoration feature
   - Or restore from your manual backup

## Expected Results

After successful execution:

### Truncated Tables (should show 0 rows)

- `machines`: 0 rows
- `servers`: 0 rows
- `server_settings`: 0 rows
- `server_configurations`: 0 rows
- `permission_groups`: 0 rows
- `file_permissions`: 0 rows
- `configuration_history`: 0 rows
- `group_members`: 0 rows
- `metrics`: 0 rows
- `logs`: 0 rows
- `audit_logs`: 0 rows
- `monitoring_config`: 0 rows
- `prometheus_targets`: 0 rows
- `metric_alerts`: 0 rows

### Preserved Tables (should maintain existing data)

- `users`: [existing count] rows

## Troubleshooting

### Common Issues

1. **Foreign Key Constraints**
   - The script temporarily disables foreign key checks
   - If errors occur, ensure you have proper permissions

2. **Permission Denied**
   - Ensure you're connected as a database administrator
   - Check that your user has TRUNCATE permissions

3. **Transaction Timeout**
   - For large datasets, increase transaction timeout
   - Consider running during low-traffic periods

### Recovery Steps

1. If the script fails partway through:

   ```sql
   ROLLBACK;
   ```

2. Check for any remaining data:

   ```sql
   SELECT COUNT(*) FROM public.metrics;
   SELECT COUNT(*) FROM public.logs;
   -- etc.
   ```

3. If needed, restore from backup and retry

## Contact

If you encounter issues during execution:

1. Stop the process immediately
2. Run `ROLLBACK;` if in a transaction
3. Contact the database administrator
4. Have backup restoration ready if needed

---

**⚠️ CRITICAL WARNING**: This operation permanently deletes ALL application data including servers, machines, settings, metrics, logs, and monitoring configurations. ONLY user accounts will be preserved. Always ensure you have a recent backup before proceeding.
