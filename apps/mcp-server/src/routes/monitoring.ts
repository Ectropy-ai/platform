/**
 * Enterprise Monitoring and Audit Endpoints
 * Provides comprehensive monitoring for production deployment
 */

import { Router, Request, Response } from 'express';
import { Logger } from '@ectropy/shared/utils';
import os from 'os';
import fs from 'fs';
import { getCurrentVersion, VERSION_STRATEGY } from '../utils/version.js';

const router: Router = Router();
const logger = new Logger('monitoring');

/**
 * Health check endpoint for load balancers
 */
router.get('/health', (req: Request, res: Response) => {
  const startTime = Date.now();

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
    },
    cpu: {
      loadAverage: process.platform !== 'win32' ? os.loadavg() : [0, 0, 0],
      platform: process.platform,
      arch: process.arch,
    },
    environment: process.env.NODE_ENV || 'development',
    version: getCurrentVersion(),
    versionStrategy: VERSION_STRATEGY.type,
    nodeVersion: process.version,
    responseTime: Date.now() - startTime
  };
  
  // Check memory usage
  if (health.memory.used > 1024) { // > 1GB
    health.status = 'warning';
    logger.warn('High memory usage detected', { memoryUsage: health.memory });
  }
  
  // Check uptime
  if (health.uptime < 60) { // Less than 1 minute
    health.status = 'starting';
  }
  
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

/**
 * Readiness check for Kubernetes
 */
router.get('/ready', async (req: Request, res: Response) => {
  // Check if all required services are available
  const readiness = {
    status: 'ready',
    timestamp: new Date().toISOString(),
    services: {
      database: checkDatabaseConnection(),
      redis: checkRedisConnection(),
      filesystem: checkFilesystemAccess(),
    },
    dependencies: {
      nodeModules: await checkRequiredModules(),
      environment: checkEnvironmentVariables(),
    }
  };
  
  const allReady = Object.values(readiness.services).every(s => s.status === 'ready') &&
                   Object.values(readiness.dependencies).every(d => d.status === 'ready');
  
  if (!allReady) {
    readiness.status = 'not-ready';
  }
  
  res.status(allReady ? 200 : 503).json(readiness);
});

/**
 * Liveness check for Kubernetes
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime()
  });
});

/**
 * Metrics endpoint for Prometheus
 */
router.get('/metrics', (req: Request, res: Response) => {
  const metrics = generatePrometheusMetrics();
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics);
});

/**
 * Audit log endpoint for compliance
 */
router.get('/audit', (req: Request, res: Response) => {
  // Check authorization
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !isValidAuditApiKey(apiKey.toString())) {
    logger.security('Unauthorized audit access attempt', 'AUDIT_ACCESS', 'high', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const auditData = {
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown',
    auditTrail: getRecentAuditEvents(50), // Last 50 events
    summary: {
      totalEvents: getAuditEventCount(),
      lastEvent: getLastAuditEvent(),
      securityEvents: getSecurityEventCount(),
    }
  };
  
  logger.audit('audit_log_accessed', apiKey.toString(), {
    eventsRequested: auditData.auditTrail.length,
    requestIp: req.ip
  });
  
  res.json(auditData);
});

/**
 * System information endpoint
 */
router.get('/system', (req: Request, res: Response) => {
  
  const systemInfo = {
    timestamp: new Date().toISOString(),
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      hostname: os.hostname(),
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024), // GB
      cpuCount: os.cpus().length,
      loadAverage: process.platform !== 'win32' ? os.loadavg() : [0, 0, 0],
      uptime: os.uptime(),
    },
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      versions: process.versions,
      env: process.env.NODE_ENV || 'development'
    },
    application: {
      name: 'ectropy-mcp-server',
      version: getCurrentVersion(),
      versionStrategy: VERSION_STRATEGY.type,
      buildNumber: process.env.BUILD_NUMBER || 'local',
      commitHash: process.env.COMMIT_HASH || 'unknown',
    }
  };
  
  res.json(systemInfo);
});

// Helper functions
function checkDatabaseConnection(): any {
  // Placeholder - implement actual database health check
  return { status: 'ready', lastCheck: new Date().toISOString() };
}

function checkRedisConnection(): any {
  // Placeholder - implement actual Redis health check
  return { status: 'ready', lastCheck: new Date().toISOString() };
}

function checkFilesystemAccess(): any {
  try {
    const testFile = `/tmp/health-check-${Date.now()}`;
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return { status: 'ready', lastCheck: new Date().toISOString() };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown filesystem error';
    return { status: 'error', error: errorMessage, lastCheck: new Date().toISOString() };
  }
}

async function checkRequiredModules(): Promise<any> {
  const requiredModules = ['express', 'winston'];
  try {
    for (const module of requiredModules) {
      // Use ESM import.meta.resolve for module resolution
      try {
        await import.meta.resolve(module);
      } catch {
        // For environments that don't support import.meta.resolve, 
        // fall back to trying a dynamic import which will fail if module doesn't exist
        await import(module);
      }
    }
    return { status: 'ready', modules: requiredModules };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown module resolution error';
    return { status: 'error', error: errorMessage };
  }
}

function checkEnvironmentVariables(): any {
  const requiredVars = ['NODE_ENV'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    return { status: 'error', missing };
  }
  
  return { status: 'ready', variables: requiredVars };
}

function generatePrometheusMetrics(): string {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  return `
# HELP nodejs_heap_size_used_bytes Process heap space used in bytes.
# TYPE nodejs_heap_size_used_bytes gauge
nodejs_heap_size_used_bytes ${memUsage.heapUsed}

# HELP nodejs_heap_size_total_bytes Process heap space total in bytes.
# TYPE nodejs_heap_size_total_bytes gauge
nodejs_heap_size_total_bytes ${memUsage.heapTotal}

# HELP nodejs_external_memory_bytes Nodejs external memory size in bytes.
# TYPE nodejs_external_memory_bytes gauge
nodejs_external_memory_bytes ${memUsage.external}

# HELP process_cpu_user_seconds_total Total user CPU time in seconds.
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total ${cpuUsage.user / 1000000}

# HELP process_cpu_system_seconds_total Total system CPU time in seconds.
# TYPE process_cpu_system_seconds_total counter
process_cpu_system_seconds_total ${cpuUsage.system / 1000000}

# HELP process_uptime_seconds Number of seconds the process has been running.
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${process.uptime()}

# HELP ectropy_mcp_server_info Information about the MCP server.
# TYPE ectropy_mcp_server_info gauge
ectropy_mcp_server_info{version="${getCurrentVersion()}",node_version="${process.version}"} 1
`.trim();
}

function isValidAuditApiKey(apiKey: string): boolean {
  // Implement proper API key validation
  const validKeys = (process.env.AUDIT_API_KEYS || '').split(',');
  return validKeys.includes(apiKey);
}

function getRecentAuditEvents(_limit: number): any[] {
  // Placeholder - implement actual audit log retrieval
  return [
    {
      timestamp: new Date().toISOString(),
      event: 'system_startup',
      user: 'system',
      details: { component: 'mcp-server' }
    }
  ];
}

function getAuditEventCount(): number {
  // Placeholder - implement actual audit event counting
  return 1;
}

function getLastAuditEvent(): any {
  // Placeholder - implement actual last event retrieval
  return {
    timestamp: new Date().toISOString(),
    event: 'system_startup'
  };
}

function getSecurityEventCount(): number {
  // Placeholder - implement actual security event counting
  return 0;
}

export { router as monitoringRouter };