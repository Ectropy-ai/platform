/**
 * Base Agent Class for MCP Server
 * Provides common functionality for all specialized construction agents
 */

/**
 * Validates that a timestamp is within a reasonable range
 * Prevents far future or past timestamps that indicate calculation errors
 */
function validateTimestamp(timestamp: number): boolean {
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const oneYearFuture = now + 365 * 24 * 60 * 60 * 1000;

  // Timestamp should be between one year ago and one year in the future
  return timestamp >= oneYearAgo && timestamp <= oneYearFuture;
}

/**
 * Sanitizes a timestamp to ensure it's valid
 * Falls back to current time if invalid
 */
function sanitizeTimestamp(
  timestamp: number,
  fieldName: string = 'timestamp'
): number {
  if (!validateTimestamp(timestamp)) {
    console.warn(
      `Invalid ${fieldName} detected: ${timestamp} (${new Date(timestamp).toISOString()}). Using current time as fallback.`
    );
    return Date.now();
  }
  return timestamp;
}

export interface AgentStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastActivity: number;
  version: string;
  capabilities: string[];
}

export interface AgentMetrics {
  requestsProcessed: number;
  averageResponseTime: number;
  errorRate: number;
  memoryUsage: number;
}

export abstract class BaseAgent {
  protected startTime: number = Date.now();
  protected lastActivity: number = Date.now();
  protected requestCount: number = 0;
  protected totalResponseTime: number = 0;
  protected errorCount: number = 0;
  protected hasProcessedRequests: boolean = false;

  protected version: string = '1.0.0';
  protected capabilities: string[] = [];

  constructor() {
    const now = Date.now();
    this.startTime = now;
    this.lastActivity = now;
  }

  /**
   * Abstract methods that must be implemented by specialized agents
   */
  abstract getName(): string;
  abstract getDescription(): string;
  abstract process(_input: any): Promise<any>;
  abstract getCapabilities(): string[];

  /**
   * Common status reporting
   */
  getStatus(): AgentStatus {
    // Validate and sanitize timestamps before returning
    const lastActivity = sanitizeTimestamp(this.lastActivity, 'lastActivity');

    return {
      name: this.getName(),
      status: this.determineHealthStatus(),
      uptime: this.getUptime(),
      lastActivity,
      version: this.version,
      capabilities: this.getCapabilities(),
    };
  }

  /**
   * Get agent uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity(): number {
    return this.lastActivity;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): AgentMetrics {
    return {
      requestsProcessed: this.requestCount,
      averageResponseTime:
        this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0,
      errorRate:
        this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      memoryUsage: process.memoryUsage().heapUsed,
    };
  }

  /**
   * Update activity timestamp
   */
  protected updateActivity(): void {
    const now = Date.now();
    // Ensure timestamp is reasonable
    if (validateTimestamp(now)) {
      this.lastActivity = now;
    } else {
      // This should never happen, but log if it does
      console.error(
        `System clock appears invalid: ${now} (${new Date(now).toISOString()})`
      );
      // Use the last known good timestamp
    }
  }

  /**
   * Record request metrics
   */
  protected recordRequest(
    responseTime: number,
    isError: boolean = false
  ): void {
    this.requestCount++;
    this.hasProcessedRequests = true;
    this.totalResponseTime += responseTime;
    if (isError) {
      this.errorCount++;
    }
    this.updateActivity();
  }

  /**
   * Determine health status based on metrics
   * ROOT CAUSE #76 Fix: Distinguish between idle-ready agents and crashed agents
   */
  protected determineHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const metrics = this.getMetrics();

    // Agent is unhealthy if error rate > 50%
    if (metrics.errorRate > 0.5) {
      return 'unhealthy';
    }

    // Agent is degraded if error rate > 10% or avg response time > 5 seconds
    if (metrics.errorRate > 0.1 || metrics.averageResponseTime > 5000) {
      return 'degraded';
    }

    // Only check inactivity if agent has processed requests before
    // Idle-but-ready agents (never used) should be healthy, not unhealthy
    // This prevents false negatives in demo/testing environments
    if (this.hasProcessedRequests) {
      const inactiveTime = Date.now() - this.lastActivity;
      // Agent is unhealthy if previously active but no activity for 10+ minutes
      if (inactiveTime > 10 * 60 * 1000) {
        return 'unhealthy';
      }
    }

    return 'healthy';
  }

  /**
   * Process request with error handling and metrics recording
   */
  protected async processWithMetrics<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let isError = false;

    try {
      const result = await operation();
      return result;
    } catch (error) {
      isError = true;
      throw error;
    } finally {
      const responseTime = Date.now() - startTime;
      this.recordRequest(responseTime, isError);
    }
  }

  /**
   * Initialize agent (called during startup)
   */
  async initialize(): Promise<void> {
    this.updateActivity();
  }

  /**
   * Cleanup agent resources (called during shutdown)
   */
  async cleanup(): Promise<void> {
    // Base cleanup implementation - override if needed
  }
}
