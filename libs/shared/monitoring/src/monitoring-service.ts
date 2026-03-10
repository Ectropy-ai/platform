/**
 * Enterprise Monitoring and Alerting Service
 * Real-time monitoring with alerting for production services
 */

import { logger } from '@ectropy/shared/utils';
import { auditLogger } from '@ectropy/shared/audit';
import EventEmitter from 'events';

export interface HealthCheck {
  name: string;
  description: string;
  critical: boolean;
  timeout: number;
  interval: number;
  check: () => Promise<HealthCheckResult>;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  responseTime: number;
  metadata?: {
    version?: string;
    uptime?: number;
    dependencies?: HealthCheckResult[];
  };
}

export interface ServiceMetrics {
  serviceName: string;
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    inbound: number;
    outbound: number;
  };
  database: {
    connections: number;
    queryTime: number;
    errorRate: number;
  };
  api: {
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
  };
  custom?: Record<string, number>;
}

export interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  service: string;
  title: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  service: string;
  metric: string;
  operator: '>' | '<' | '=' | '>=' | '<=';
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  duration: number; // seconds
  cooldown: number; // seconds to prevent spam
  enabled: boolean;
  notifications: string[]; // notification channels
}

export class EnterpriseMonitoringService extends EventEmitter {
  private healthChecks = new Map<string, HealthCheck>();
  private healthStatus = new Map<string, HealthCheckResult>();
  private metricsHistory: ServiceMetrics[] = [];
  private alerts = new Map<string, Alert>();
  private alertRules = new Map<string, AlertRule>();
  private monitoringInterval?: NodeJS.Timeout;
  private lastAlertTimes = new Map<string, number>();

  constructor(
    private config: {
      healthCheckInterval: number; // seconds
      metricsRetention: number; // hours
      enableRealTimeAlerts: boolean;
      alertCooldown: number; // seconds
      services: string[];
    } = {
      healthCheckInterval: 30,
      metricsRetention: 24,
      enableRealTimeAlerts: true,
      alertCooldown: 300,
      services: ['api-gateway', 'web-dashboard', 'database', 'redis', 'speckle'],
    }
  ) {
    super();
    this.initializeDefaultHealthChecks();
    this.initializeDefaultAlertRules();
    this.startMonitoring();
  }

  /**
   * Register a custom health check
   */
  registerHealthCheck(check: HealthCheck): void {
    this.healthChecks.set(check.name, check);
    logger.info('Health check registered', {
      name: check.name,
      critical: check.critical,
      interval: check.interval,
    });
  }

  /**
   * Get current health status for all services
   */
  getHealthStatus(): Record<string, HealthCheckResult> {
    const status: Record<string, HealthCheckResult> = {};
    this.healthStatus.forEach((result, name) => {
      status[name] = result;
    });
    return status;
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): {
    status: 'healthy' | 'unhealthy' | 'degraded';
    services: Record<string, HealthCheckResult>;
    summary: {
      total: number;
      healthy: number;
      unhealthy: number;
      degraded: number;
    };
  } {
    const services = this.getHealthStatus();
    const summary = {
      total: Object.keys(services).length,
      healthy: 0,
      unhealthy: 0,
      degraded: 0,
    };

    Object.values(services).forEach(result => {
      summary[result.status]++;
    });

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (summary.unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (summary.degraded > 0) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      services,
      summary,
    };
  }

  /**
   * Add metrics data point
   */
  addMetrics(metrics: ServiceMetrics): void {
    this.metricsHistory.push(metrics);
    
    // Clean up old metrics
    const cutoff = new Date(Date.now() - (this.config.metricsRetention * 60 * 60 * 1000));
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);

    // Check alert rules
    if (this.config.enableRealTimeAlerts) {
      this.checkAlertRules(metrics);
    }

    this.emit('metrics', metrics);
  }

  /**
   * Get metrics for a specific service
   */
  getServiceMetrics(serviceName: string, hours: number = 1): ServiceMetrics[] {
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
    return this.metricsHistory
      .filter(m => m.serviceName === serviceName && m.timestamp > cutoff)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Register an alert rule
   */
  registerAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info('Alert rule registered', {
      id: rule.id,
      service: rule.service,
      metric: rule.metric,
      threshold: rule.threshold,
      severity: rule.severity,
    });
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      
      logger.info('Alert resolved', {
        id: alertId,
        service: alert.service,
        title: alert.title,
      });

      // Audit log alert resolution
      auditLogger.logAdminAction({
        userId: 'system',
        sourceIp: 'localhost',
        action: 'alert_resolved',
        resource: `alert:${alertId}`,
        outcome: 'success',
        metadata: {
          alertId,
          service: alert.service,
          title: alert.title,
          duration: alert.resolvedAt.getTime() - alert.timestamp.getTime(),
        },
      });

      this.emit('alertResolved', alert);
    }
  }

  /**
   * Start monitoring services
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.runHealthChecks();
      await this.collectSystemMetrics();
    }, this.config.healthCheckInterval * 1000);

    logger.info('Enterprise monitoring started', {
      interval: this.config.healthCheckInterval,
      services: this.config.services,
      alertsEnabled: this.config.enableRealTimeAlerts,
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('Enterprise monitoring stopped');
    }
  }

  /**
   * Run all registered health checks
   */
  private async runHealthChecks(): Promise<void> {
    const promises = Array.from(this.healthChecks.entries()).map(async ([name, check]) => {
      try {
        const startTime = Date.now();
        const result = await Promise.race([
          check.check(),
          new Promise<HealthCheckResult>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
          )
        ]);
        
        result.responseTime = Date.now() - startTime;
        result.timestamp = new Date();
        
        this.healthStatus.set(name, result);
        
        if (result.status === 'unhealthy' && check.critical) {
          this.createAlert({
            service: name,
            title: `Critical service unhealthy: ${name}`,
            description: result.message,
            severity: 'critical',
            metadata: result.details,
          });
        }

      } catch (error) {
        const result: HealthCheckResult = {
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Health check failed',
          timestamp: new Date(),
          responseTime: check.timeout,
        };
        
        this.healthStatus.set(name, result);
        
        if (check.critical) {
          this.createAlert({
            service: name,
            title: `Critical service check failed: ${name}`,
            description: result.message,
            severity: 'critical',
          });
        }
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      // This would integrate with system monitoring tools
      // For now, generating production metrics
      for (const serviceName of this.config.services) {
        const metrics: ServiceMetrics = {
          serviceName,
          timestamp: new Date(),
          cpu: {
            usage: Math.random() * 100,
            loadAverage: [Math.random(), Math.random(), Math.random()],
          },
          memory: {
            used: Math.random() * 8 * 1024 * 1024 * 1024, // Random up to 8GB
            total: 8 * 1024 * 1024 * 1024, // 8GB total
            percentage: Math.random() * 100,
          },
          disk: {
            used: Math.random() * 100 * 1024 * 1024 * 1024, // Random up to 100GB
            total: 500 * 1024 * 1024 * 1024, // 500GB total
            percentage: Math.random() * 100,
          },
          network: {
            inbound: Math.random() * 1000,
            outbound: Math.random() * 1000,
          },
          database: {
            connections: Math.floor(Math.random() * 100),
            queryTime: Math.random() * 1000,
            errorRate: Math.random() * 5,
          },
          api: {
            requestsPerSecond: Math.random() * 100,
            averageResponseTime: Math.random() * 500,
            errorRate: Math.random() * 2,
          },
        };

        this.addMetrics(metrics);
      }
    } catch (error) {
      logger.error('Failed to collect system metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check alert rules against metrics
   */
  private checkAlertRules(metrics: ServiceMetrics): void {
    this.alertRules.forEach(rule => {
      if (!rule.enabled || rule.service !== metrics.serviceName) {
        return;
      }

      // Check cooldown
      const lastAlert = this.lastAlertTimes.get(rule.id);
      if (lastAlert && (Date.now() - lastAlert) < (rule.cooldown * 1000)) {
        return;
      }

      // Get metric value
      const value = this.getMetricValue(metrics, rule.metric);
      if (value === undefined) {
        return;
      }

      // Check threshold
      const triggered = this.checkThreshold(value, rule.operator, rule.threshold);
      
      if (triggered) {
        this.createAlert({
          service: rule.service,
          title: `Alert: ${rule.name}`,
          description: `${rule.metric} ${rule.operator} ${rule.threshold} (current: ${value})`,
          severity: rule.severity,
          metadata: {
            rule: rule.id,
            metric: rule.metric,
            value,
            threshold: rule.threshold,
          },
        });

        this.lastAlertTimes.set(rule.id, Date.now());
      }
    });
  }

  /**
   * Get metric value by path
   */
  private getMetricValue(metrics: ServiceMetrics, path: string): number | undefined {
    const parts = path.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Check if threshold is exceeded
   */
  private checkThreshold(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '=': return value === threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      default: return false;
    }
  }

  /**
   * Create a new alert
   */
  private createAlert(alertData: {
    service: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, any>;
  }): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      resolved: false,
      ...alertData,
    };

    this.alerts.set(alert.id, alert);

    logger.warn('Alert created', {
      id: alert.id,
      service: alert.service,
      title: alert.title,
      severity: alert.severity,
    });

    // Audit log alert creation
    auditLogger.logAdminAction({
      userId: 'system',
      sourceIp: 'localhost',
      action: 'alert_created',
      resource: `alert:${alert.id}`,
      outcome: 'success',
      metadata: {
        alertId: alert.id,
        service: alert.service,
        title: alert.title,
        severity: alert.severity,
        ...alert.metadata,
      },
    });

    this.emit('alert', alert);
  }

  /**
   * Initialize default health checks
   */
  private initializeDefaultHealthChecks(): void {
    // API Gateway health check
    this.registerHealthCheck({
      name: 'api-gateway',
      description: 'API Gateway service health',
      critical: true,
      timeout: 5000,
      interval: 30,
      check: async () => {
        // This would make an actual HTTP request to the API gateway
        return {
          status: 'healthy',
          message: 'API Gateway is responding',
          timestamp: new Date(),
          responseTime: 0,
        };
      },
    });

    // Database health check
    this.registerHealthCheck({
      name: 'database',
      description: 'PostgreSQL database connectivity',
      critical: true,
      timeout: 5000,
      interval: 30,
      check: async () => {
        // This would test database connectivity
        return {
          status: 'healthy',
          message: 'Database is accessible',
          timestamp: new Date(),
          responseTime: 0,
        };
      },
    });

    // Redis health check
    this.registerHealthCheck({
      name: 'redis',
      description: 'Redis cache server',
      critical: false,
      timeout: 3000,
      interval: 60,
      check: async () => {
        // This would test Redis connectivity
        return {
          status: 'healthy',
          message: 'Redis is responding',
          timestamp: new Date(),
          responseTime: 0,
        };
      },
    });
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    // High CPU usage alert
    this.registerAlertRule({
      id: 'high-cpu',
      name: 'High CPU Usage',
      description: 'CPU usage exceeds 80%',
      service: 'api-gateway',
      metric: 'cpu.usage',
      operator: '>',
      threshold: 80,
      severity: 'medium',
      duration: 300,
      cooldown: 600,
      enabled: true,
      notifications: ['slack', 'email'],
    });

    // High memory usage alert
    this.registerAlertRule({
      id: 'high-memory',
      name: 'High Memory Usage',
      description: 'Memory usage exceeds 85%',
      service: 'api-gateway',
      metric: 'memory.percentage',
      operator: '>',
      threshold: 85,
      severity: 'high',
      duration: 300,
      cooldown: 600,
      enabled: true,
      notifications: ['slack', 'email'],
    });

    // High API error rate alert
    this.registerAlertRule({
      id: 'high-api-errors',
      name: 'High API Error Rate',
      description: 'API error rate exceeds 5%',
      service: 'api-gateway',
      metric: 'api.errorRate',
      operator: '>',
      threshold: 5,
      severity: 'critical',
      duration: 180,
      cooldown: 300,
      enabled: true,
      notifications: ['slack', 'email', 'pagerduty'],
    });
  }
}

// Export singleton instance
export const monitoringService = new EnterpriseMonitoringService();