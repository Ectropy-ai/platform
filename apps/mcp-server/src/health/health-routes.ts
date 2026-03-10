/**
 * ============================================================================
 * Health Check Express Routes
 * ============================================================================
 * Version: 1.0.0
 * Description: Express routes for health check endpoints
 *              Compatible with Kubernetes probes and load balancer health checks
 * Last Updated: 2025-12-14
 * ============================================================================
 */

import {
  Request,
  Response,
  Router,
  type Router as ExpressRouter,
} from 'express';
import { getHealthCheckService, HealthStatus } from './health-check-service.js';
import { getCurrentVersion } from '../utils/version.js';

const router: ExpressRouter = Router();

/**
 * Helper: Convert health status to HTTP status code
 */
function healthStatusToHttpCode(status: HealthStatus): number {
  switch (status) {
    case HealthStatus.HEALTHY:
      return 200;
    case HealthStatus.DEGRADED:
      return 200; // Still accepting traffic, just degraded
    case HealthStatus.UNHEALTHY:
      return 503; // Service Unavailable
    case HealthStatus.UNKNOWN:
      return 500; // Internal Server Error
    default:
      return 500;
  }
}

/**
 * GET /health
 * Full health check with all components
 * Used by: Monitoring systems, dashboards
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthService = getHealthCheckService();
    const health = await healthService.checkHealth();

    const statusCode = healthStatusToHttpCode(health.status);
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: HealthStatus.UNKNOWN,
      service: 'ectropy-mcp-server',
      message: 'Health check service error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/live
 * Liveness probe - is the process alive and responsive?
 * Used by: Kubernetes liveness probe
 * Action on failure: Restart container
 */
router.get('/health/live', async (req: Request, res: Response) => {
  try {
    const healthService = getHealthCheckService();
    const liveness = await healthService.checkLiveness();

    const statusCode = healthStatusToHttpCode(liveness.status);
    res.status(statusCode).json({
      status: liveness.status,
      check_type: 'liveness',
      message: liveness.message,
      latency_ms: liveness.latency_ms,
      timestamp: liveness.timestamp,
      details: liveness.details,
    });
  } catch (error) {
    console.error('Liveness check failed:', error);
    res.status(500).json({
      status: HealthStatus.UNHEALTHY,
      check_type: 'liveness',
      message: 'Liveness check error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/ready
 * Readiness probe - can the service accept requests?
 * Used by: Kubernetes readiness probe, load balancers
 * Action on failure: Remove from service endpoints
 */
router.get('/health/ready', async (req: Request, res: Response) => {
  try {
    const healthService = getHealthCheckService();
    const readiness = await healthService.checkReadiness();

    const statusCode = healthStatusToHttpCode(readiness.status);
    res.status(statusCode).json({
      status: readiness.status,
      check_type: 'readiness',
      message: readiness.message,
      latency_ms: readiness.latency_ms,
      timestamp: readiness.timestamp,
      details: readiness.details,
    });
  } catch (error) {
    console.error('Readiness check failed:', error);
    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      check_type: 'readiness',
      message: 'Readiness check error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/startup
 * Startup probe - has initialization completed?
 * Used by: Kubernetes startup probe
 * Action on failure: Wait before running liveness/readiness
 */
router.get('/health/startup', async (req: Request, res: Response) => {
  try {
    const healthService = getHealthCheckService();
    const startup = await healthService.checkStartup();

    const statusCode = healthStatusToHttpCode(startup.status);
    res.status(statusCode).json({
      status: startup.status,
      check_type: 'startup',
      message: startup.message,
      latency_ms: startup.latency_ms,
      timestamp: startup.timestamp,
      details: startup.details,
    });
  } catch (error) {
    console.error('Startup check failed:', error);
    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      check_type: 'startup',
      message: 'Startup check error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /lb-health
 * Simplified health check for load balancers (backward compatibility)
 * Returns 200 OK if ready, 503 if not
 * This is a simplified endpoint that load balancers can use
 */
router.get('/lb-health', async (req: Request, res: Response) => {
  try {
    const healthService = getHealthCheckService();
    const readiness = await healthService.checkReadiness();

    if (
      readiness.status === HealthStatus.HEALTHY ||
      readiness.status === HealthStatus.DEGRADED
    ) {
      res.status(200).send('OK');
    } else {
      res.status(503).send('Service Unavailable');
    }
  } catch (error) {
    res.status(503).send('Service Unavailable');
  }
});

/**
 * GET /ping
 * Ultra-lightweight ping endpoint (no dependency checks)
 * Returns immediately with minimal processing
 * Used for: Basic connectivity tests
 */
router.get('/ping', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'ectropy-mcp-server',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /version
 * Service version information
 * Used for: Deployment verification, debugging
 */
router.get('/version', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'ectropy-mcp-server',
    version: getCurrentVersion(), // Dynamic version from package.json (ROOT CAUSE #80)
    git_commit: process.env.GIT_COMMIT || 'unknown',
    build_date: process.env.BUILD_DATE || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
