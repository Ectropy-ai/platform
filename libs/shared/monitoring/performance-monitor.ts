/**
 * Enterprise Performance Monitoring System
 * Tracks critical metrics for construction platform operations
 */

export interface PerformanceMetrics {
  timestamp: number;
  service: string;
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export class EnterprisePerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private thresholds = {
    apiResponse: 100, // ms
    databaseQuery: 50, // ms
    bimProcessing: 1000, // ms
    fileUpload: 5000, // ms
  };

  /**
   * Track API response performance
   */
  trackAPIResponse(operation: string, startTime: number, success: boolean, error?: string): void {
    const duration = Date.now() - startTime;
    this.recordMetric({
      timestamp: Date.now(),
      service: 'api-gateway',
      operation,
      duration,
      success,
      error,
    });

    if (duration > this.thresholds.apiResponse) {
      console.warn(`⚠️ Slow API response: ${operation} took ${duration}ms (threshold: ${this.thresholds.apiResponse}ms)`);
    }
  }

  /**
   * Track database query performance
   */
  trackDatabaseQuery(query: string, startTime: number, success: boolean, error?: string): void {
    const duration = Date.now() - startTime;
    this.recordMetric({
      timestamp: Date.now(),
      service: 'database',
      operation: 'query',
      duration,
      success,
      error,
      metadata: { query: query.substring(0, 100) }, // First 100 chars for privacy
    });

    if (duration > this.thresholds.databaseQuery) {
      console.warn(`⚠️ Slow database query: ${duration}ms (threshold: ${this.thresholds.databaseQuery}ms)`);
    }
  }

  /**
   * Track BIM processing performance
   */
  trackBIMProcessing(operation: string, elementCount: number, startTime: number, success: boolean, error?: string): void {
    const duration = Date.now() - startTime;
    this.recordMetric({
      timestamp: Date.now(),
      service: 'bim-processor',
      operation,
      duration,
      success,
      error,
      metadata: { elementCount },
    });

    const elementsPerSecond = elementCount / (duration / 1000);
    console.log(`🏗️ BIM processing: ${operation} - ${elementCount} elements in ${duration}ms (${elementsPerSecond.toFixed(2)} elements/sec)`);

    if (duration > this.thresholds.bimProcessing) {
      console.warn(`⚠️ Slow BIM processing: ${operation} took ${duration}ms (threshold: ${this.thresholds.bimProcessing}ms)`);
    }
  }

  /**
   * Get performance summary for monitoring dashboards
   */
  getPerformanceSummary(timeWindowMs: number = 300000): {
    totalOperations: number;
    successRate: number;
    averageResponseTime: number;
    slowOperations: number;
    topSlowOperations: Array<{ operation: string; duration: number }>;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);

    const totalOperations = recentMetrics.length;
    const successfulOperations = recentMetrics.filter(m => m.success).length;
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 100;
    
    const totalDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0);
    const averageResponseTime = totalOperations > 0 ? totalDuration / totalOperations : 0;
    
    const slowOperations = recentMetrics.filter(m => m.duration > this.thresholds.apiResponse).length;
    
    const topSlowOperations = recentMetrics
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5)
      .map(m => ({ operation: m.operation, duration: m.duration }));

    return {
      totalOperations,
      successRate,
      averageResponseTime,
      slowOperations,
      topSlowOperations,
    };
  }

  private recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only last 1000 metrics to prevent memory leaks
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }
}

// Global performance monitor instance
export const performanceMonitor = new EnterprisePerformanceMonitor();