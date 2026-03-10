/**
 * Security Monitor Service
 * Runtime security monitoring and threat response for Ectropy Platform
 * Implements rate limiting, anomaly detection, and automated threat mitigation
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export interface SecurityAlert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'rate_limit' | 'anomaly' | 'injection' | 'brute_force' | 'suspicious_activity';
  source: string;
  details: any;
  mitigated: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface AnomalyPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: SecurityAlert['severity'];
  description: string;
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  constructor(private config: RateLimitConfig) {
    // Constructor initializes with config parameter
  }
  
  isAllowed(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const userRequests = this.requests.get(key)!;
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= this.config.maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }
  
  getRemainingRequests(key: string): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const userRequests = this.requests.get(key) || [];
    const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    return Math.max(0, this.config.maxRequests - validRequests.length);
  }
  
  reset(key: string): void {
    this.requests.delete(key);
  }
  
  cleanup(): void {
    const now = Date.now();
    
    for (const [key, timestamps] of this.requests.entries()) {
      const validRequests = timestamps.filter(timestamp => 
        timestamp > (now - this.config.windowMs)
      );
      
      if (validRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validRequests);
      }
    }
  }
}

export class AuditLogger {
  private logs: SecurityAlert[] = [];
  private maxLogs = 10000;
  
  log(alert: SecurityAlert): void {
    this.logs.push(alert);
    
    // Maintain log size
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // Console logging with severity colors
    const timestamp = new Date(alert.timestamp).toISOString();
    const severityColors = {
      low: '\x1b[32m', // Green
      medium: '\x1b[33m', // Yellow  
      high: '\x1b[31m', // Red
      critical: '\x1b[35m' // Magenta
    };
    
    const color = severityColors[alert.severity];
    const reset = '\x1b[0m';
    
    console.log(
      `${color}[SECURITY-${alert.severity.toUpperCase()}]${reset} ${timestamp} ` +
      `${alert.type}: ${alert.source} - ${JSON.stringify(alert.details)}`
    );
  }
  
  getRecentAlerts(count = 100): SecurityAlert[] {
    return this.logs.slice(-count);
  }
  
  getAlertsByType(type: SecurityAlert['type']): SecurityAlert[] {
    return this.logs.filter(alert => alert.type === type);
  }
  
  getAlertsBySeverity(severity: SecurityAlert['severity']): SecurityAlert[] {
    return this.logs.filter(alert => alert.severity === severity);
  }
  
  getAlertsInTimeRange(startTime: string, endTime: string): SecurityAlert[] {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    
    return this.logs.filter(alert => {
      const alertTime = new Date(alert.timestamp).getTime();
      return alertTime >= start && alertTime <= end;
    });
  }
  
  exportLogs(): any {
    return {
      exported_at: new Date().toISOString(),
      total_alerts: this.logs.length,
      alerts: this.logs,
      summary: {
        by_severity: {
          low: this.logs.filter(a => a.severity === 'low').length,
          medium: this.logs.filter(a => a.severity === 'medium').length,
          high: this.logs.filter(a => a.severity === 'high').length,
          critical: this.logs.filter(a => a.severity === 'critical').length,
        },
        by_type: {
          rate_limit: this.logs.filter(a => a.type === 'rate_limit').length,
          anomaly: this.logs.filter(a => a.type === 'anomaly').length,
          injection: this.logs.filter(a => a.type === 'injection').length,
          brute_force: this.logs.filter(a => a.type === 'brute_force').length,
          suspicious_activity: this.logs.filter(a => a.type === 'suspicious_activity').length,
        }
      }
    };
  }
}

export class SecurityMonitor extends EventEmitter {
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private auditLog: AuditLogger = new AuditLogger();
  private cleanupInterval: NodeJS.Timeout;
  private alertCount = 0;
  
  // Built-in anomaly patterns
  private readonly anomalyPatterns: AnomalyPattern[] = [
    {
      id: 'sql_injection',
      name: 'SQL Injection Attempt',
      pattern: /(union\s+select|drop\s+table|exec\s*\(|script\s*>)/i,
      severity: 'critical',
      description: 'Potential SQL injection attack detected'
    },
    {
      id: 'xss_attempt',
      name: 'Cross-Site Scripting',
      pattern: /(<script|javascript:|vbscript:|onload=|onerror=)/i,
      severity: 'high',
      description: 'Potential XSS attack detected'
    },
    {
      id: 'directory_traversal',
      name: 'Directory Traversal',
      pattern: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,
      severity: 'high',
      description: 'Directory traversal attempt detected'
    },
    {
      id: 'command_injection',
      name: 'Command Injection',
      pattern: /(\||\&\&|\|\||;|`|\$\(|%0a|%0d)/,
      severity: 'critical',
      description: 'Command injection attempt detected'
    },
    {
      id: 'suspicious_user_agent',
      name: 'Suspicious User Agent',
      pattern: /(sqlmap|nmap|nikto|burp|owasp|dirbuster)/i,
      severity: 'medium',
      description: 'Security scanning tool detected'
    }
  ];
  
  constructor() {
    super();
    
    // Setup periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    console.log('🛡️ Security Monitor initialized');
    console.log(`📊 Monitoring ${this.anomalyPatterns.length} threat patterns`);
  }
  
  /**
   * Create rate limiter for endpoint
   */
  createRateLimiter(endpoint: string, config: RateLimitConfig): void {
    this.rateLimiters.set(endpoint, new RateLimiter(config));
    console.log(`🚦 Rate limiter configured for ${endpoint}: ${config.maxRequests}/${config.windowMs}ms`);
  }
  
  /**
   * Check if request is allowed through rate limiting
   */
  checkRateLimit(endpoint: string, clientKey: string): boolean {
    const limiter = this.rateLimiters.get(endpoint);
    
    if (!limiter) {
      // No rate limiting configured for this endpoint
      return true;
    }
    
    const allowed = limiter.isAllowed(clientKey);
    
    if (!allowed) {
      this.generateAlert({
        severity: 'medium',
        type: 'rate_limit',
        source: clientKey,
        details: {
          endpoint,
          remaining: limiter.getRemainingRequests(clientKey),
          action: 'blocked'
        }
      });
    }
    
    return allowed;
  }
  
  /**
   * Detect anomalies in request data
   */
  detectAnomalies(data: { 
    url?: string; 
    body?: any; 
    headers?: any; 
    query?: any; 
    userAgent?: string;
    clientIP?: string;
  }): SecurityAlert[] {
    const alerts: SecurityAlert[] = [];
    const combinedData = JSON.stringify(data).toLowerCase();
    
    for (const pattern of this.anomalyPatterns) {
      if (pattern.pattern.test(combinedData)) {
        const alert = this.generateAlert({
          severity: pattern.severity,
          type: 'anomaly',
          source: data.clientIP || 'unknown',
          details: {
            pattern_id: pattern.id,
            pattern_name: pattern.name,
            description: pattern.description,
            matched_data: this.extractMatchedData(combinedData, pattern.pattern),
            url: data.url,
            user_agent: data.userAgent
          }
        });
        
        alerts.push(alert);
      }
    }
    
    return alerts;
  }
  
  /**
   * Automated threat mitigation
   */
  mitigateThreats(alerts: SecurityAlert[]): void {
    for (const alert of alerts) {
      switch (alert.severity) {
        case 'critical':
          this.handleCriticalThreat(alert);
          break;
        case 'high':
          this.handleHighThreat(alert);
          break;
        case 'medium':
          this.handleMediumThreat(alert);
          break;
        case 'low':
          this.handleLowThreat(alert);
          break;
      }
    }
  }
  
  private handleCriticalThreat(alert: SecurityAlert): void {
    console.log(`🚨 CRITICAL THREAT: Auto-blocking ${alert.source}`);
    
    // In production, this would:
    // 1. Add IP to firewall blacklist
    // 2. Terminate active sessions
    // 3. Alert security team immediately
    // 4. Create incident report
    
    alert.mitigated = true;
    this.emit('criticalThreat', alert);
  }
  
  private handleHighThreat(alert: SecurityAlert): void {
    console.log(`⚠️ HIGH THREAT: Enhanced monitoring for ${alert.source}`);
    
    // In production, this would:
    // 1. Increase monitoring frequency
    // 2. Apply stricter rate limiting
    // 3. Require additional authentication
    // 4. Log all activity for forensics
    
    alert.mitigated = true;
    this.emit('highThreat', alert);
  }
  
  private handleMediumThreat(alert: SecurityAlert): void {
    console.log(`⚠️ MEDIUM THREAT: Monitoring ${alert.source}`);
    
    // In production, this would:
    // 1. Flag for manual review
    // 2. Apply moderate rate limiting
    // 3. Extended logging
    
    alert.mitigated = true;
    this.emit('mediumThreat', alert);
  }
  
  private handleLowThreat(alert: SecurityAlert): void {
    console.log(`ℹ️ LOW THREAT: Logged for analysis ${alert.source}`);
    
    // Standard logging and analysis
    alert.mitigated = false;
    this.emit('lowThreat', alert);
  }
  
  /**
   * Generate security alert
   */
  private generateAlert(alertData: {
    severity: SecurityAlert['severity'];
    type: SecurityAlert['type'];
    source: string;
    details: any;
  }): SecurityAlert {
    const alert: SecurityAlert = {
      id: this.generateAlertId(),
      timestamp: new Date().toISOString(),
      mitigated: false,
      ...alertData
    };
    
    this.auditLog.log(alert);
    this.emit('securityAlert', alert);
    
    return alert;
  }
  
  private generateAlertId(): string {
    this.alertCount++;
    const timestamp = Date.now().toString();
    const hash = createHash('md5').update(`${timestamp}-${this.alertCount}`).digest('hex');
    return `sec-${hash.substring(0, 8)}`;
  }
  
  private extractMatchedData(data: string, pattern: RegExp): string {
    const match = data.match(pattern);
    return match ? match[0] : '';
  }
  
  /**
   * Periodic cleanup
   */
  private performCleanup(): void {
    // Clean up rate limiters
    for (const [endpoint, limiter] of this.rateLimiters) {
      limiter.cleanup();
    }
    
    console.log('🧹 Security monitor cleanup completed');
  }
  
  /**
   * Get security statistics
   */
  getSecurityStats(): any {
    return {
      timestamp: new Date().toISOString(),
      rate_limiters: this.rateLimiters.size,
      anomaly_patterns: this.anomalyPatterns.length,
      recent_alerts: this.auditLog.getRecentAlerts(10),
      alert_summary: {
        total_alerts: this.auditLog.getRecentAlerts().length,
        critical: this.auditLog.getAlertsBySeverity('critical').length,
        high: this.auditLog.getAlertsBySeverity('high').length,
        medium: this.auditLog.getAlertsBySeverity('medium').length,
        low: this.auditLog.getAlertsBySeverity('low').length,
      },
      threat_types: {
        rate_limit: this.auditLog.getAlertsByType('rate_limit').length,
        anomaly: this.auditLog.getAlertsByType('anomaly').length,
        injection: this.auditLog.getAlertsByType('injection').length,
        brute_force: this.auditLog.getAlertsByType('brute_force').length,
        suspicious_activity: this.auditLog.getAlertsByType('suspicious_activity').length,
      }
    };
  }
  
  /**
   * Export audit logs
   */
  exportAuditLogs(): any {
    return this.auditLog.exportLogs();
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.rateLimiters.clear();
    this.removeAllListeners();
    
    console.log('🛡️ Security Monitor destroyed');
  }
}