// Application metrics collection system for Ectropy platform
// Implements comprehensive monitoring and alerting

import * as promClient from 'prom-client';

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

/**
 * Business Metrics for Construction Platform
 */

// Request metrics
export const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'environment'],
  registers: [register]
});

// Response time metrics
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'environment'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// Database metrics
export const dbConnectionsActive = new promClient.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
  labelNames: ['database', 'environment'],
  registers: [register]
});

export const dbQueryDuration = new promClient.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['query_type', 'table', 'environment'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register]
});

// MCP Server specific metrics
export const mcpRequestsTotal = new promClient.Counter({
  name: 'mcp_requests_total',
  help: 'Total number of MCP requests',
  labelNames: ['tool', 'status', 'environment'],
  registers: [register]
});

export const mcpResponseTime = new promClient.Histogram({
  name: 'mcp_response_time_seconds',
  help: 'MCP tool response time in seconds',
  labelNames: ['tool', 'environment'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Semantic search metrics
export const semanticSearchQueries = new promClient.Counter({
  name: 'semantic_search_queries_total',
  help: 'Total number of semantic search queries',
  labelNames: ['query_type', 'environment'],
  registers: [register]
});

export const semanticSearchLatency = new promClient.Histogram({
  name: 'semantic_search_latency_seconds',
  help: 'Semantic search query latency in seconds',
  labelNames: ['query_type', 'environment'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// IFC processing metrics
export const ifcFilesProcessed = new promClient.Counter({
  name: 'ifc_files_processed_total',
  help: 'Total number of IFC files processed',
  labelNames: ['file_size_category', 'status', 'environment'],
  registers: [register]
});

export const ifcProcessingTime = new promClient.Histogram({
  name: 'ifc_processing_time_seconds',
  help: 'IFC file processing time in seconds',
  labelNames: ['file_size_category', 'environment'],
  buckets: [1, 5, 10, 30, 60, 300],
  registers: [register]
});

// Business domain metrics
export const projectsActive = new promClient.Gauge({
  name: 'construction_projects_active',
  help: 'Number of active construction projects',
  labelNames: ['project_type', 'environment'],
  registers: [register]
});

export const collaborationSessions = new promClient.Gauge({
  name: 'collaboration_sessions_active',
  help: 'Number of active collaboration sessions',
  labelNames: ['session_type', 'environment'],
  registers: [register]
});

export const daoTemplatesCreated = new promClient.Counter({
  name: 'dao_templates_created_total',
  help: 'Total number of DAO templates created',
  labelNames: ['template_type', 'environment'],
  registers: [register]
});

// Error tracking metrics
export const errorCounter = new promClient.Counter({
  name: 'application_errors_total',
  help: 'Total number of application errors',
  labelNames: ['error_type', 'severity', 'component', 'environment'],
  registers: [register]
});

// Feature flag metrics
export const featureFlagUsage = new promClient.Counter({
  name: 'feature_flag_usage_total',
  help: 'Total number of feature flag evaluations',
  labelNames: ['flag_name', 'result', 'environment'],
  registers: [register]
});

// Cache metrics
export const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type', 'environment'],
  registers: [register]
});

export const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type', 'environment'],
  registers: [register]
});

/**
 * Middleware for Express.js to collect HTTP metrics
 */
export function metricsMiddleware(req: any, res: any, next: any) {
  const startTime = Date.now();
  const environment = process.env.NODE_ENV || 'development';

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    
    httpRequestCounter.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
      environment
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        environment
      },
      duration
    );
  });

  next();
}

/**
 * Database metrics collection helper
 */
export function recordDatabaseMetrics(queryType: string, table: string, duration: number) {
  const environment = process.env.NODE_ENV || 'development';
  
  dbQueryDuration.observe(
    { query_type: queryType, table, environment },
    duration
  );
}

/**
 * MCP metrics collection helper
 */
export function recordMCPMetrics(tool: string, status: string, responseTime: number) {
  const environment = process.env.NODE_ENV || 'development';
  
  mcpRequestsTotal.inc({ tool, status, environment });
  mcpResponseTime.observe({ tool, environment }, responseTime);
}

/**
 * Error tracking helper
 */
export function recordError(errorType: string, severity: 'low' | 'medium' | 'high' | 'critical', component: string) {
  const environment = process.env.NODE_ENV || 'development';
  
  errorCounter.inc({
    error_type: errorType,
    severity,
    component,
    environment
  });
}

/**
 * Feature flag usage tracking
 */
export function recordFeatureFlagUsage(flagName: string, result: boolean) {
  const environment = process.env.NODE_ENV || 'development';
  
  featureFlagUsage.inc({
    flag_name: flagName,
    result: result.toString(),
    environment
  });
}

/**
 * Business metrics helpers
 */
export function updateProjectCount(projectType: string, count: number) {
  const environment = process.env.NODE_ENV || 'development';
  projectsActive.set({ project_type: projectType, environment }, count);
}

export function updateCollaborationSessions(sessionType: string, count: number) {
  const environment = process.env.NODE_ENV || 'development';
  collaborationSessions.set({ session_type: sessionType, environment }, count);
}

export function recordDAOTemplateCreation(templateType: string) {
  const environment = process.env.NODE_ENV || 'development';
  daoTemplatesCreated.inc({ template_type: templateType, environment });
}

/**
 * IFC processing metrics
 */
export function recordIFCProcessing(fileSizeCategory: string, status: string, processingTime: number) {
  const environment = process.env.NODE_ENV || 'development';
  
  ifcFilesProcessed.inc({
    file_size_category: fileSizeCategory,
    status,
    environment
  });
  
  ifcProcessingTime.observe(
    { file_size_category: fileSizeCategory, environment },
    processingTime
  );
}

/**
 * Semantic search metrics
 */
export function recordSemanticSearch(queryType: string, latency: number) {
  const environment = process.env.NODE_ENV || 'development';
  
  semanticSearchQueries.inc({ query_type: queryType, environment });
  semanticSearchLatency.observe({ query_type: queryType, environment }, latency);
}

/**
 * Cache metrics helpers
 */
export function recordCacheHit(cacheType: string) {
  const environment = process.env.NODE_ENV || 'development';
  cacheHits.inc({ cache_type: cacheType, environment });
}

export function recordCacheMiss(cacheType: string) {
  const environment = process.env.NODE_ENV || 'development';
  cacheMisses.inc({ cache_type: cacheType, environment });
}

/**
 * Health check metrics endpoint
 */
export function getMetrics() {
  return register.metrics();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics() {
  register.resetMetrics();
}

export { register };
export default {
  httpRequestCounter,
  httpRequestDuration,
  dbConnectionsActive,
  dbQueryDuration,
  mcpRequestsTotal,
  mcpResponseTime,
  semanticSearchQueries,
  semanticSearchLatency,
  ifcFilesProcessed,
  ifcProcessingTime,
  projectsActive,
  collaborationSessions,
  daoTemplatesCreated,
  errorCounter,
  featureFlagUsage,
  cacheHits,
  cacheMisses,
  metricsMiddleware,
  recordDatabaseMetrics,
  recordMCPMetrics,
  recordError,
  recordFeatureFlagUsage,
  updateProjectCount,
  updateCollaborationSessions,
  recordDAOTemplateCreation,
  recordIFCProcessing,
  recordSemanticSearch,
  recordCacheHit,
  recordCacheMiss,
  getMetrics,
  resetMetrics
};