/**
 * Secret Monitoring and Audit System
 * Enterprise-grade monitoring for secret management compliance
 */

import { SecretProvider, AuditLogEntry, SecretProviderMetrics } from './types.js';
import { SecretValidator } from './validation.js';

export interface SecurityAlert {
  id: string;
  timestamp: Date;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'unauthorized_access' | 'weak_secret' | 'rotation_overdue' | 'source_failure' | 'compliance_violation';
  message: string;
  details: Record<string, any>;
  resolved: boolean;
}

export interface ComplianceReport {
  timestamp: Date;
  environment: string;
  totalSecrets: number;
  compliantSecrets: number;
  complianceRate: number;
  violations: ComplianceViolation[];
  recommendations: string[];
}

export interface ComplianceViolation {
  secretKey: string;
  violationType: 'weak_entropy' | 'expired' | 'insecure_source' | 'missing_rotation' | 'policy_violation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  remediation: string;
}

/**
 * Monitoring service for secret management operations
 */
export class SecretMonitoringService {
  private alerts: SecurityAlert[] = [];
  private alertHandlers: ((alert: SecurityAlert) => void)[] = [];

  constructor(private secretProvider: SecretProvider) {
    // Set up periodic monitoring
    this.setupPeriodicMonitoring();
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(environment: string): Promise<ComplianceReport> {
    const metrics = this.secretProvider.getMetrics();
    const auditLogs = this.secretProvider.getAuditLogs(1000);
    
    // Get all secrets for analysis
    const secretKeys = this.extractSecretKeysFromAudit(auditLogs);
    const violations: ComplianceViolation[] = [];
    let compliantSecrets = 0;

    for (const key of secretKeys) {
      try {
        const secret = await this.secretProvider.getSecret(key);
        const validationResults = SecretValidator.validateSecret(secret.value, {
          key,
          environment: environment as any,
          classification: this.classifySecret(key),
        });

        // Check for violations
        const hasViolations = validationResults.some(r => !r.passed && r.severity === 'error');
        
        if (hasViolations) {
          const violation = this.createViolationFromValidation(key, validationResults);
          if (violation) violations.push(violation);
        } else {
          compliantSecrets++;
        }

        // Check for rotation violations
        const rotationViolation = this.checkRotationCompliance(secret, key, environment);
        if (rotationViolation) violations.push(rotationViolation);
        
        // Check source compliance for production
        if (environment === 'production' && secret.source === 'fallback') {
          violations.push({
            secretKey: key,
            violationType: 'insecure_source',
            severity: 'critical',
            description: 'Production secret using alternative source',
            remediation: 'Move secret to AWS Secrets Manager',
          });
        }
      } catch (error) {
        violations.push({
          secretKey: key,
          violationType: 'policy_violation',
          severity: 'high',
          description: `Cannot access secret: ${error}`,
          remediation: 'Ensure secret exists and permissions are correct',
        });
      }
    }

    const totalSecrets = secretKeys.length;
    const complianceRate = totalSecrets > 0 ? (compliantSecrets / totalSecrets) * 100 : 100;

    const recommendations = this.generateRecommendations(violations, metrics);

    return {
      timestamp: new Date(),
      environment,
      totalSecrets,
      compliantSecrets,
      complianceRate,
      violations,
      recommendations,
    };
  }

  /**
   * Monitor for security anomalies
   */
  async monitorSecurityAnomalies(): Promise<SecurityAlert[]> {
    const newAlerts: SecurityAlert[] = [];
    const auditLogs = this.secretProvider.getAuditLogs(100);
    
    // Check for suspicious access patterns
    const failureRate = this.calculateFailureRate(auditLogs);
    if (failureRate > 0.3) { // More than 30% failures
      newAlerts.push(this.createAlert(
        'high',
        'unauthorized_access',
        `High secret access failure rate: ${(failureRate * 100).toFixed(1)}%`,
        { failureRate, recentLogs: auditLogs.slice(-10) }
      ));
    }

    // Check for source availability issues
    const health = await this.secretProvider.healthCheck();
    for (const [source, isHealthy] of Object.entries(health)) {
      if (!isHealthy) {
        newAlerts.push(this.createAlert(
          'critical',
          'source_failure',
          `Secret source '${source}' is unavailable`,
          { source, health }
        ));
      }
    }

    // Check metrics for performance issues
    const metrics = this.secretProvider.getMetrics();
    if (metrics.avgLatencyMs > 5000) { // More than 5 seconds
      newAlerts.push(this.createAlert(
        'medium',
        'source_failure',
        `High secret retrieval latency: ${metrics.avgLatencyMs}ms`,
        { metrics }
      ));
    }

    // Add new alerts and notify handlers
    for (const alert of newAlerts) {
      this.alerts.push(alert);
      this.notifyAlertHandlers(alert);
    }

    return newAlerts;
  }

  /**
   * Check for secrets requiring rotation
   */
  async checkRotationRequirements(): Promise<string[]> {
    const auditLogs = this.secretProvider.getAuditLogs(1000);
    const secretKeys = this.extractSecretKeysFromAudit(auditLogs);
    const needsRotation: string[] = [];

    for (const key of secretKeys) {
      try {
        const secret = await this.secretProvider.getSecret(key);
        const daysSinceRetrieval = (Date.now() - secret.retrievedAt.getTime()) / (1000 * 60 * 60 * 24);
        
        // Critical secrets should be rotated every 30 days, others every 90
        const rotationThreshold = key.includes('JWT') || key.includes('PRIVATE') ? 30 : 90;
        
        if (daysSinceRetrieval > rotationThreshold) {
          needsRotation.push(key);
          
          this.alerts.push(this.createAlert(
            'medium',
            'rotation_overdue',
            `Secret '${key}' is ${Math.round(daysSinceRetrieval)} days old and needs rotation`,
            { secretKey: key, ageInDays: daysSinceRetrieval, threshold: rotationThreshold }
          ));
        }
      } catch (error) {
        // Skip secrets that can't be accessed
      }
    }

    return needsRotation;
  }

  /**
   * Export audit logs for external compliance systems
   */
  exportAuditLogs(format: 'json' | 'csv' | 'syslog' = 'json'): string {
    const logs = this.secretProvider.getAuditLogs(10000);
    
    switch (format) {
      case 'json':
        return JSON.stringify(logs, null, 2);
      
      case 'csv':
        const headers = ['timestamp', 'secretKey', 'action', 'source', 'success', 'latencyMs', 'error'];
        const rows = logs.map(log => [
          log.timestamp.toISOString(),
          log.secretKey,
          log.action,
          log.source,
          log.success.toString(),
          log.latencyMs.toString(),
          log.error || ''
        ]);
        return [headers, ...rows].map(row => row.join(',')).join('\n');
      
      case 'syslog':
        return logs.map(log => 
          `${log.timestamp.toISOString()} ectropy-secrets: ${log.action} ${log.secretKey} ` +
          `source=${log.source} success=${log.success} latency=${log.latencyMs}ms`
        ).join('\n');
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Register alert handler
   */
  onAlert(handler: (alert: SecurityAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(hours = 24): SecurityAlert[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.alerts.filter(alert => alert.timestamp >= cutoff);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  // Private helper methods

  private setupPeriodicMonitoring(): void {
    // Monitor every 5 minutes
    setInterval(async () => {
      try {
        await this.monitorSecurityAnomalies();
        await this.checkRotationRequirements();
      } catch (error) {
      }
    }, 5 * 60 * 1000);
  }

  private extractSecretKeysFromAudit(logs: AuditLogEntry[]): string[] {
    const keys = new Set<string>();
    for (const log of logs) {
      if (log.action === 'retrieve' && log.success) {
        keys.add(log.secretKey);
      }
    }
    return Array.from(keys);
  }

  private calculateFailureRate(logs: AuditLogEntry[]): number {
    if (logs.length === 0) return 0;
    const failures = logs.filter(log => !log.success).length;
    return failures / logs.length;
  }

  private createAlert(
    severity: SecurityAlert['severity'],
    type: SecurityAlert['type'],
    message: string,
    details: Record<string, any>
  ): SecurityAlert {
    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      severity,
      type,
      message,
      details,
      resolved: false,
    };
  }

  private notifyAlertHandlers(alert: SecurityAlert): void {
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
      }
    }
  }

  private classifySecret(key: string): 'critical' | 'high' | 'medium' | 'low' {
    const criticalPatterns = ['JWT', 'PRIVATE_KEY', 'MASTER'];
    const highPatterns = ['PASSWORD', 'SECRET', 'TOKEN'];
    const mediumPatterns = ['API_KEY', 'WEBHOOK'];

    const upperKey = key.toUpperCase();
    
    if (criticalPatterns.some(pattern => upperKey.includes(pattern))) {
      return 'critical';
    } else if (highPatterns.some(pattern => upperKey.includes(pattern))) {
      return 'high';
    } else if (mediumPatterns.some(pattern => upperKey.includes(pattern))) {
      return 'medium';
    }
    
    return 'low';
  }

  private createViolationFromValidation(
    key: string,
    results: Array<{ passed: boolean; message?: string; severity: string }>
  ): ComplianceViolation | null {
    const error = results.find(r => !r.passed && r.severity === 'error');
    if (!error) return null;

    return {
      secretKey: key,
      violationType: error.message?.includes('entropy') ? 'weak_entropy' : 'policy_violation',
      severity: 'high',
      description: error.message || 'Validation failed',
      remediation: 'Regenerate secret with stronger criteria',
    };
  }

  private checkRotationCompliance(secret: any, key: string, environment: string): ComplianceViolation | null {
    const ageMs = Date.now() - secret.retrievedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    const rotationPolicy = environment === 'production' ? 30 : 90;
    
    if (ageDays > rotationPolicy) {
      return {
        secretKey: key,
        violationType: 'missing_rotation',
        severity: ageDays > rotationPolicy * 2 ? 'high' : 'medium',
        description: `Secret is ${Math.round(ageDays)} days old, exceeds ${rotationPolicy} day policy`,
        remediation: `Rotate secret using automated rotation or manual regeneration`,
      };
    }
    
    return null;
  }

  private generateRecommendations(violations: ComplianceViolation[], metrics: SecretProviderMetrics): string[] {
    const recommendations: string[] = [];
    
    if (violations.length > 0) {
      const criticalCount = violations.filter(v => v.severity === 'critical').length;
      if (criticalCount > 0) {
        recommendations.push(`Address ${criticalCount} critical security violations immediately`);
      }
      
      const rotationCount = violations.filter(v => v.violationType === 'missing_rotation').length;
      if (rotationCount > 0) {
        recommendations.push(`Implement automated rotation for ${rotationCount} overdue secrets`);
      }
    }
    
    if (metrics.cacheHitRate < 0.8) {
      recommendations.push('Optimize cache configuration to improve performance');
    }
    
    if (metrics.successRate < 0.95) {
      recommendations.push('Investigate and resolve source reliability issues');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Secret management system is operating within compliance parameters');
    }
    
    return recommendations;
  }
}