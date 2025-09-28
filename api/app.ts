import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import serversRoutes from './routes/servers.js';
import logsRoutes from './routes/logs.js';
import filesRoutes from './routes/files.js';
import metricsRoutes from './routes/metrics.js';
import prometheusRoutes from './routes/prometheus.js';
import machinesRoutes from './routes/machines.js';
import backupsRoutes from './routes/backups.js';
import schedulerRoutes from './routes/scheduler.js';
import alertsRoutes from './routes/alerts.js';
import { bootstrapAdmin } from './middleware/auth.js';
import { MonitoringService } from './services/monitoring.js';
import { BackupService } from './services/backup.js';
import { SchedulerService } from './services/scheduler.js';
import { AlertingService } from './services/alerting.js';

dotenv.config();

const app = express();

// Middleware
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://your-domain.com']
        : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/prometheus', prometheusRoutes);
app.use('/api/machines', machinesRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/alerts', alertsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Minecraft Server Management API',
    version: process.env.npm_package_version || '1.0.0',
    endpoints: {
      auth: '/api/auth',
      servers: '/api/servers',
      logs: '/api/logs',
      files: '/api/files',
      metrics: '/api/metrics',
      machines: '/api/machines',
    },
  });
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response) => {
  console.error('API Error:', error);

  // Handle multer errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'File too large. Maximum size is 50MB.',
    });
  }

  if (error.message === 'File type not allowed') {
    return res.status(400).json({
      success: false,
      error:
        'File type not allowed. Only .jar, .yml, .yaml, .properties, .txt, .json, .toml files are supported.',
    });
  }

  // Handle JSON parsing errors
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
    });
  }

  // Generic error response
  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Bootstrap admin user and start monitoring service on startup
if (process.env.NODE_ENV !== 'test') {
  bootstrapAdmin().catch(console.error);

  // Initialize backup service
  BackupService.initialize().catch(console.error);

  // Initialize scheduler service
  SchedulerService.initialize().catch(console.error);

  // Start monitoring service
  MonitoringService.start();

  // Start alerting service
  AlertingService.start();
}

export default app;
