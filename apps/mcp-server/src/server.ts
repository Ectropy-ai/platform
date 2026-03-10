import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors'; // CORS re-enabled - Express handles it (enterprise best practice)
import helmet from 'helmet';
import {
  rateLimiter,
  cspNonceMiddleware,
  cspReportHandler,
  createAuditMiddleware,
} from './middleware/index.js';
import {
  auditService,
  AuditEventType,
  AuditResourceType,
} from './services/index.js';
import { apiRouter } from './routes/index.js';
import { metricsRouter } from './routes/metrics.js';
import { healthCheck } from './routes/health-enhanced.js';
import healthRoutes from './health/health-routes.js';
import { initializeHealthCheck } from './health/health-check-service.js';
import {
  getAgentStatus,
  initializeAgents,
  cleanupAgents,
} from './agents/index.js';
import { setupGraphQL } from './graphql/index.js';
// AP-001 ENTERPRISE FIX (2026-01-01): Migrate to env-schema.ts - ZERO hardcoded URLs
import {
  getEnvConfig,
  getCorsOrigins,
  getMcpUrl,
  getApiUrl,
} from '@ectropy/shared/config';
// DEPRECATED (2026-01-01): Legacy config - will be removed after validation
import { config } from './config/environment.config.js';
import { securityHeadersConfig } from './utils/security.utils.js';
import { mcpLogger } from './utils/mcp-logger.js';
import { requestContext } from '@ectropy/shared/utils';

const app: Express = express();

// Track server state for graceful shutdown
let isShuttingDown = false;
const activeConnections = new Set<any>();

// P0: Add helmet.js security headers
// Protects against common vulnerabilities (XSS, clickjacking, etc.)
app.use(helmet(securityHeadersConfig as any)); // Type assertion for complex helmet config

// Enterprise: Nonce-based CSP (eliminates unsafe-inline)
// Must be after helmet but before routes
app.use(cspNonceMiddleware());

// CSP violation report endpoint (must be early, before JSON parsing for report-uri format)
app.post(
  '/api/csp-report',
  express.json({ type: 'application/csp-report' }),
  cspReportHandler
);

// P0: CORS configuration - Express handles it (single source of truth)
// AP-001 ENTERPRISE FIX (2026-01-01): Use getCorsOrigins() - ZERO hardcoded URLs
// P0 FIX (2026-01-05): LAZY CORS initialization - getCorsOrigins() called on first request
// REASON: getCorsOrigins() calls getEnvConfig() which validates ALL environment variables
// ERROR: If called at module load (before error handlers), crashes with empty error logs
// SOLUTION: Use cors() with function callback - evaluated per-request (lazy)
// Enterprise architecture: Application layer handles CORS, not nginx
app.use(
  cors({
    origin: (origin, callback) => {
      try {
        const corsOrigins = getCorsOrigins(); // Lazy evaluation on first request
        const allowedOrigins = [
          ...corsOrigins,
          // GitHub Codespaces domains (regex patterns)
          /^https:\/\/.*\.github\.dev$/,
          /^https:\/\/.*\.preview\.app\.github\.dev$/,
        ];

        // Check if origin is allowed
        const isAllowed =
          !origin ||
          allowedOrigins.some((allowed) => {
            if (allowed instanceof RegExp) {
              return allowed.test(origin);
            }
            return allowed === origin;
          });

        callback(null, isAllowed);
      } catch (error) {
        // If CORS origins can't be loaded, fail closed (security-first)
        mcpLogger.error('Failed to load CORS origins', error as Error);
        callback(new Error('CORS configuration failed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
    ],
  })
);

// Body parsing with size limits (DoS protection)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enterprise: Request context middleware (must be early)
// Provides automatic correlation IDs and request tracking
app.use(requestContext.middleware());

// Middleware: Shutdown check (reject new requests during shutdown)
app.use((req: Request, res: Response, next: NextFunction): void => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    res.status(503).json({
      error: 'Service unavailable',
      message: 'Server is shutting down',
    });
    return;
  }
  next();
});

// Middleware: Rate limiting
app.use(rateLimiter);

// Enterprise: Audit logging for API routes
// Non-blocking, async audit trail for compliance
app.use(
  '/api',
  createAuditMiddleware({
    excludePaths: [
      /^\/api\/health/,
      /^\/api\/mcp\/health/,
      /^\/api\/csp-report/,
    ],
    logRequestBody: false, // Security: don't log request bodies by default
    logResponseBody: false,
  })
);

// Enterprise Health Check System - 4-Layer Architecture (Kubernetes-compatible)
// Initialize with validation-only mode configuration (database connections initialized later in main.ts)
initializeHealthCheck({
  postgres: { enabled: false, timeout_ms: 5000 }, // Will be enabled after database connection established
  redis: { enabled: false, timeout_ms: 3000 }, // Will be enabled after Redis connection established
  memory: { enabled: true, max_heap_mb: 512 },
});

// Mount comprehensive health check routes
// Provides: /health, /health/live, /health/ready, /health/startup, /lb-health, /ping
app.use('/', healthRoutes);

// Legacy health check endpoint (kept for backward compatibility during migration)
// TODO: Remove after confirming new health checks work in production
app.get('/health-legacy', healthCheck);

// MCP Agent Framework health endpoint per roadmap Task 3.1
app.get('/api/mcp/health', (req, res) => {
  try {
    const agentStatus = getAgentStatus();
    return res.json(agentStatus);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get agent status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Metrics
app.use('/metrics', metricsRouter);

// Add /api/agents/analyze endpoint BEFORE general API routes
app.post('/api/agents/analyze', async (req, res) => {
  try {
    const { modelId, agents } = req.body;

    if (!modelId || !agents) {
      return res.status(400).json({
        success: false,
        error: 'modelId and agents are required',
      });
    }

    // Import and use the actual analyze function with randomization
    const { analyzeModel } = await import('./agents/analyze.js');
    const results = await analyzeModel(modelId, agents);
    return res.json({ success: true, data: results });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Analysis failed',
    });
  }
});

// API routes
app.use('/api', apiRouter);

// Custom analyze route for BIM model analysis
app.post('/analyze-model', async (req, res) => {
  try {
    const { analyzeModel } = await import('./agents/analyze.js');
    const { modelId, agents } = req.body;

    if (!modelId || !agents) {
      return res.status(400).json({
        success: false,
        error: 'modelId and agents are required',
      });
    }

    const results = await analyzeModel(modelId, agents);
    return res.json({ success: true, data: results });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Analysis failed',
    });
  }
});

// Enterprise: Global error handler (must be last middleware)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const ctx = requestContext.getContext();

  mcpLogger.error('Unhandled request error', err, {
    path: req.path,
    method: req.method,
  });

  // Don't leak error details in production
  const isDev = config.server.nodeEnv === 'development';

  res.status(500).json({
    error: 'Internal Server Error',
    message: isDev ? err.message : 'An unexpected error occurred',
    requestId: ctx?.requestId,
    timestamp: new Date().toISOString(),
    ...(isDev && { stack: err.stack }),
  });
});

export const startServer = async () => {
  const PORT = config.server.expressPort;
  const ENV = config.server.nodeEnv;

  // Log startup
  mcpLogger.startup({
    port: PORT,
    environment: ENV,
    version: process.env['npm_package_version'] || '1.0.0',
    features: ['agents', 'graphql', 'health-checks', 'metrics'],
  });

  try {
    // Initialize MCP Agent Framework
    mcpLogger.info('Initializing MCP Agent Framework...');
    await initializeAgents();
    mcpLogger.info('MCP Agent Framework initialized');

    // Log system startup to audit trail
    await auditService.log({
      eventType: AuditEventType.SYSTEM_STARTUP,
      resourceId: 'mcp-server',
      resourceType: AuditResourceType.SYSTEM,
      actorId: 'system',
      eventData: {
        port: PORT,
        environment: ENV,
        version: process.env['npm_package_version'] || '1.0.0',
        nodeVersion: process.version,
      },
      severity: 'low',
    });

    // Initialize GraphQL endpoint
    mcpLogger.info('Setting up GraphQL endpoint...');
    await setupGraphQL(app, '/graphql');
    mcpLogger.info('GraphQL endpoint ready');

    return new Promise((resolve, reject) => {
      const server = app
        .listen(PORT, () => {
          // AP-001 ENTERPRISE FIX (2026-01-01): Use getMcpUrl() - ZERO hardcoded localhost
          const mcpUrl = getMcpUrl();
          mcpLogger.info('MCP Server started successfully', {
            port: PORT,
            environment: ENV,
            endpoints: {
              health: `${mcpUrl}/health`,
              agentHealth: `${mcpUrl}/api/mcp/health`,
              graphql: `${mcpUrl}/graphql`,
              metrics: `${mcpUrl}/metrics`,
            },
          });
          resolve(server);
        })
        .on('error', (error) => {
          mcpLogger.error('Failed to start MCP Server', error);
          reject(error);
        });

      // Track connections for graceful shutdown
      server.on('connection', (conn) => {
        activeConnections.add(conn);
        conn.on('close', () => activeConnections.delete(conn));
      });

      // Setup graceful shutdown
      setupGracefulShutdown(server);
    });
  } catch (error) {
    mcpLogger.error('Server initialization failed', error as Error);
    throw error;
  }
};

/**
 * Enterprise: Graceful shutdown with connection draining
 */
function setupGracefulShutdown(server: any): void {
  const SHUTDOWN_TIMEOUT = 30000; // 30 seconds

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    mcpLogger.shutdown(`Received ${signal}, initiating graceful shutdown...`);

    // Stop accepting new connections
    server.close(async () => {
      mcpLogger.info('HTTP server closed, cleaning up resources...');

      try {
        // Cleanup agents
        await cleanupAgents();
        mcpLogger.info('MCP agents cleaned up');

        // Flush audit logs before shutdown
        await auditService.shutdown();
        mcpLogger.info('Audit service shutdown complete');

        mcpLogger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        mcpLogger.error('Error during shutdown', error as Error);
        process.exit(1);
      }
    });

    // Force close connections after timeout
    setTimeout(() => {
      mcpLogger.warn('Shutdown timeout reached, forcing connection close');
      activeConnections.forEach((conn) => conn.destroy());
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    // Gracefully close idle connections
    activeConnections.forEach((conn) => {
      conn.end();
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    mcpLogger.error('========================================');
    mcpLogger.error('FATAL: Uncaught Exception');
    mcpLogger.error('========================================');
    mcpLogger.error('Error:', error.message || String(error));
    mcpLogger.error('Name:', error.name || 'Unknown');
    mcpLogger.error('Stack:', error.stack || 'No stack trace available');
    // P0 FIX: Log full error object for envalid validation errors
    if (error.constructor?.name === 'EnvError' || error.name === 'EnvError') {
      mcpLogger.error(
        'Full Error Object:',
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      );
    }
    mcpLogger.error('========================================');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    mcpLogger.error('Unhandled rejection', reason as Error);
    // Don't exit on unhandled rejection, just log it
  });
}

export default app;

// Re-export health check functions for external use
export {
  enableHealthCheckDatabases,
  completeHealthCheckStartup,
} from './health/health-check-service.js';
