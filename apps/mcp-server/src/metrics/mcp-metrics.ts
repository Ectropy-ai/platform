/**
 * MCP Server Metrics Collection
 * Enterprise telemetry and observability
 */

import { Counter, Histogram, Gauge, Registry } from 'prom-client';

/**
 * Metrics Registry
 */
export const metricsRegistry = new Registry();

/**
 * HTTP Metrics
 */
export const httpRequestDuration = new Histogram({
  name: 'mcp_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const httpRequestTotal = new Counter({
  name: 'mcp_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [metricsRegistry],
});

/**
 * Agent Metrics
 */
export const agentExecutions = new Counter({
  name: 'mcp_agent_executions_total',
  help: 'Total number of agent executions',
  labelNames: ['agent_type', 'status'],
  registers: [metricsRegistry],
});

export const agentExecutionDuration = new Histogram({
  name: 'mcp_agent_execution_duration_seconds',
  help: 'Duration of agent executions in seconds',
  labelNames: ['agent_type'],
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [metricsRegistry],
});

export const activeAgents = new Gauge({
  name: 'mcp_active_agents',
  help: 'Number of currently active agents',
  labelNames: ['agent_type'],
  registers: [metricsRegistry],
});

/**
 * System Metrics
 */
export const systemMemoryUsage = new Gauge({
  name: 'mcp_system_memory_usage_bytes',
  help: 'System memory usage in bytes',
  registers: [metricsRegistry],
});

export const systemCpuUsage = new Gauge({
  name: 'mcp_system_cpu_usage_percent',
  help: 'System CPU usage percentage',
  registers: [metricsRegistry],
});

/**
 * Database Metrics
 */
export const databaseConnections = new Gauge({
  name: 'mcp_database_connections',
  help: 'Number of active database connections',
  labelNames: ['state'],
  registers: [metricsRegistry],
});

export const databaseQueryDuration = new Histogram({
  name: 'mcp_database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [metricsRegistry],
});

/**
 * MCP Metrics Manager
 */
export class MCPMetrics {
  private static instance: MCPMetrics;
  private updateInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startSystemMetricsCollection();
  }

  static getInstance(): MCPMetrics {
    if (!MCPMetrics.instance) {
      MCPMetrics.instance = new MCPMetrics();
    }
    return MCPMetrics.instance;
  }

  /**
   * Start collecting system metrics
   */
  private startSystemMetricsCollection() {
    this.updateInterval = setInterval(() => {
      // Update memory usage
      const memUsage = process.memoryUsage();
      systemMemoryUsage.set(memUsage.heapUsed);

      // Update CPU usage
      const cpuUsage = process.cpuUsage();
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
      systemCpuUsage.set(cpuPercent);
    }, 10000); // Update every 10 seconds
  }

  /**
   * Record HTTP request
   */
  recordHttpRequest(
    method: string,
    route: string,
    status: number,
    duration: number
  ) {
    httpRequestTotal.inc({ method, route, status: status.toString() });
    httpRequestDuration.observe(
      { method, route, status: status.toString() },
      duration
    );
  }

  /**
   * Record agent execution
   */
  recordAgentExecution(
    agentType: string,
    status: 'success' | 'failure',
    duration: number
  ) {
    agentExecutions.inc({ agent_type: agentType, status });
    agentExecutionDuration.observe({ agent_type: agentType }, duration);
  }

  /**
   * Update active agents count
   */
  updateActiveAgents(agentType: string, count: number) {
    activeAgents.set({ agent_type: agentType }, count);
  }

  /**
   * Record database query
   */
  recordDatabaseQuery(operation: string, table: string, duration: number) {
    databaseQueryDuration.observe({ operation, table }, duration);
  }

  /**
   * Update database connections
   */
  updateDatabaseConnections(active: number, idle: number) {
    databaseConnections.set({ state: 'active' }, active);
    databaseConnections.set({ state: 'idle' }, idle);
  }

  /**
   * Record error for monitoring
   */
  recordError(_errorType: string, _component: string) {
    // For now, just log the error - could extend with proper error metrics
  }

  /**
   * Update health check status
   */
  updateHealthCheck(component: string, isHealthy: boolean) {
    // For now, just log the health status - could extend with proper health metrics
    console.info(
      `[MCPMetrics] Health check for ${component}: ${isHealthy ? 'healthy' : 'unhealthy'}`
    );
  }

  /**
   * Get all metrics for Prometheus
   */
  async getMetrics(): Promise<string> {
    return metricsRegistry.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJson() {
    const metrics = await metricsRegistry.getMetricsAsJSON();
    return metrics;
  }

  /**
   * Cleanup
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

// Export singleton instance
export const mcpMetrics = MCPMetrics.getInstance();

// Export for backward compatibility
export default mcpMetrics;
