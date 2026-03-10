import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecurityMonitor, RateLimiter, AuditLogger, SecurityAlert } from './security-monitor';

describe('SecurityMonitor', () => {
  let securityMonitor: SecurityMonitor;

  beforeEach(() => {
    securityMonitor = new SecurityMonitor();
  });

  afterEach(() => {
    securityMonitor.destroy();
  });

  describe('Initialization', () => {
    it('should initialize with default anomaly patterns', () => {
      const stats = securityMonitor.getSecurityStats();
      expect(stats.anomaly_patterns).toBe(5);
      expect(stats.rate_limiters).toBe(0);
    });

    it('should emit events for security alerts', async () => {
      const alertPromise = new Promise<SecurityAlert>((resolve) => {
        securityMonitor.on('securityAlert', (alert: SecurityAlert) => {
          expect(alert).toHaveProperty('id');
          expect(alert).toHaveProperty('timestamp');
          expect(alert).toHaveProperty('severity');
          expect(alert).toHaveProperty('type');
          resolve(alert);
        });
      });

      // Trigger an anomaly detection
      securityMonitor.detectAnomalies({
        url: '/test',
        body: "'; DROP TABLE users; --",
        clientIP: '127.0.0.1'
      });

      await alertPromise;
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      securityMonitor.createRateLimiter('/api/test', {
        windowMs: 1000, // 1 second window
        maxRequests: 5,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      });
    });

    it('should allow requests within rate limit', () => {
      const clientKey = 'client-123';
      
      // First 5 requests should be allowed
      for (let i = 0; i < 5; i++) {
        expect(securityMonitor.checkRateLimit('/api/test', clientKey)).toBe(true);
      }
    });

    it('should block requests exceeding rate limit', () => {
      const clientKey = 'client-456';
      
      // First 5 requests allowed
      for (let i = 0; i < 5; i++) {
        securityMonitor.checkRateLimit('/api/test', clientKey);
      }
      
      // 6th request should be blocked
      expect(securityMonitor.checkRateLimit('/api/test', clientKey)).toBe(false);
    });

    it('should generate rate limit alert when blocked', async () => {
      const clientKey = 'client-789';
      
      const alertPromise = new Promise<SecurityAlert>((resolve) => {
        securityMonitor.on('securityAlert', (alert: SecurityAlert) => {
          if (alert.type === 'rate_limit') {
            expect(alert.severity).toBe('medium');
            expect(alert.source).toBe(clientKey);
            expect(alert.details.endpoint).toBe('/api/test');
            expect(alert.details.action).toBe('blocked');
            resolve(alert);
          }
        });
      });
      
      // Exhaust rate limit
      for (let i = 0; i < 6; i++) {
        securityMonitor.checkRateLimit('/api/test', clientKey);
      }

      await alertPromise;
    });

    it('should allow requests from different endpoints independently', () => {
      securityMonitor.createRateLimiter('/api/other', {
        windowMs: 1000,
        maxRequests: 3,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      });

      const clientKey = 'client-multi';
      
      // Exhaust first endpoint
      for (let i = 0; i < 5; i++) {
        securityMonitor.checkRateLimit('/api/test', clientKey);
      }
      
      // Should still be allowed on different endpoint
      expect(securityMonitor.checkRateLimit('/api/other', clientKey)).toBe(true);
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect SQL injection attempts', () => {
      const alerts = securityMonitor.detectAnomalies({
        body: "'; DROP TABLE users; --",
        clientIP: '192.168.1.1'
      });

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const sqlAlert = alerts.find(alert => alert.details.pattern_id === 'sql_injection');
      expect(sqlAlert).toBeDefined();
      expect(sqlAlert?.severity).toBe('critical');
      expect(sqlAlert?.type).toBe('anomaly');
    });

    it('should detect XSS attempts', () => {
      const alerts = securityMonitor.detectAnomalies({
        body: '<script>alert("xss")</script>',
        clientIP: '192.168.1.2'
      });

      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const xssAlert = alerts.find(alert => alert.details.pattern_id === 'xss_attempt');
      expect(xssAlert).toBeDefined();
      expect(xssAlert?.severity).toBe('high');
    });

    it('should detect directory traversal attempts', () => {
      const alerts = securityMonitor.detectAnomalies({
        url: '/../../etc/passwd',
        clientIP: '192.168.1.3'
      });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('high');
      expect(alerts[0].details.pattern_id).toBe('directory_traversal');
    });

    it('should detect command injection attempts', () => {
      const alerts = securityMonitor.detectAnomalies({
        body: 'param=value; cat /etc/passwd',
        clientIP: '192.168.1.4'
      });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].details.pattern_id).toBe('command_injection');
    });

    it('should detect suspicious user agents', () => {
      const alerts = securityMonitor.detectAnomalies({
        userAgent: 'sqlmap/1.0',
        clientIP: '192.168.1.5'
      });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('medium');
      expect(alerts[0].details.pattern_id).toBe('suspicious_user_agent');
    });

    it('should detect multiple anomalies in single request', () => {
      const alerts = securityMonitor.detectAnomalies({
        body: "'; DROP TABLE users; --<script>alert('xss')</script>",
        userAgent: 'sqlmap/1.0',
        clientIP: '192.168.1.6'
      });

      expect(alerts.length).toBeGreaterThan(1);
      
      const severities = alerts.map(alert => alert.severity);
      expect(severities).toContain('critical');
      expect(severities).toContain('high');
      expect(severities).toContain('medium');
    });

    it('should return empty array for clean requests', () => {
      const alerts = securityMonitor.detectAnomalies({
        url: '/api/users',
        body: { username: 'john', email: 'john@example.com' },
        userAgent: 'Mozilla/5.0',
        clientIP: '192.168.1.7'
      });

      expect(alerts).toHaveLength(0);
    });
  });

  describe('Threat Mitigation', () => {
    it('should handle critical threats', async () => {
      const threatPromise = new Promise<SecurityAlert>((resolve) => {
        securityMonitor.on('criticalThreat', (alert: SecurityAlert) => {
          expect(alert.severity).toBe('critical');
          expect(alert.mitigated).toBe(true);
          resolve(alert);
        });
      });

      const alerts = securityMonitor.detectAnomalies({
        body: "'; DROP TABLE users; --",
        clientIP: '192.168.1.10'
      });

      securityMonitor.mitigateThreats(alerts);
      await threatPromise;
    });

    it('should handle high threats', async () => {
      const threatPromise = new Promise<SecurityAlert>((resolve) => {
        securityMonitor.on('highThreat', (alert: SecurityAlert) => {
          expect(alert.severity).toBe('high');
          expect(alert.mitigated).toBe(true);
          resolve(alert);
        });
      });

      const alerts = securityMonitor.detectAnomalies({
        body: '<script>alert("xss")</script>',
        clientIP: '192.168.1.11'
      });

      securityMonitor.mitigateThreats(alerts);
      await threatPromise;
    });

    it('should handle medium threats', async () => {
      const threatPromise = new Promise<SecurityAlert>((resolve) => {
        securityMonitor.on('mediumThreat', (alert: SecurityAlert) => {
          expect(alert.severity).toBe('medium');
          expect(alert.mitigated).toBe(true);
          resolve(alert);
        });
      });

      const alerts = securityMonitor.detectAnomalies({
        userAgent: 'sqlmap/1.0',
        clientIP: '192.168.1.12'
      });

      securityMonitor.mitigateThreats(alerts);
      await threatPromise;
    });

    it('should handle low threats', async () => {
      // Create a custom alert for testing
      const lowAlert: SecurityAlert = {
        id: 'test-low',
        timestamp: new Date().toISOString(),
        severity: 'low',
        type: 'suspicious_activity',
        source: '192.168.1.13',
        details: { test: true },
        mitigated: false
      };

      const threatPromise = new Promise<SecurityAlert>((resolve) => {
        securityMonitor.on('lowThreat', (alert: SecurityAlert) => {
          expect(alert.severity).toBe('low');
          expect(alert.mitigated).toBe(false);
          resolve(alert);
        });
      });

      securityMonitor.mitigateThreats([lowAlert]);
      await threatPromise;
    });
  });

  describe('Security Statistics', () => {
    beforeEach(() => {
      securityMonitor.createRateLimiter('/api/stats', {
        windowMs: 60000,
        maxRequests: 100,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      });
    });

    it('should provide comprehensive security stats', () => {
      // Generate some alerts
      securityMonitor.detectAnomalies({
        body: "'; DROP TABLE users; --",
        clientIP: '192.168.1.20'
      });

      const stats = securityMonitor.getSecurityStats();

      expect(stats).toHaveProperty('timestamp');
      expect(stats).toHaveProperty('rate_limiters');
      expect(stats).toHaveProperty('anomaly_patterns');
      expect(stats).toHaveProperty('recent_alerts');
      expect(stats).toHaveProperty('alert_summary');
      expect(stats).toHaveProperty('threat_types');

      expect(stats.rate_limiters).toBe(1);
      expect(stats.anomaly_patterns).toBe(5);
      expect(stats.alert_summary.total_alerts).toBeGreaterThan(0);
    });

    it('should track alert counts by severity', () => {
      // Generate different severity alerts
      securityMonitor.detectAnomalies({
        body: "'; DROP TABLE users; --", // Critical
        clientIP: '192.168.1.21'
      });

      securityMonitor.detectAnomalies({
        body: '<script>alert("test")</script>', // High
        clientIP: '192.168.1.22'
      });

      securityMonitor.detectAnomalies({
        userAgent: 'sqlmap/1.0', // Medium
        clientIP: '192.168.1.23'
      });

      const stats = securityMonitor.getSecurityStats();

      expect(stats.alert_summary.critical).toBeGreaterThan(0);
      expect(stats.alert_summary.high).toBeGreaterThan(0);
      expect(stats.alert_summary.medium).toBeGreaterThan(0);
    });

    it('should export audit logs with summary', () => {
      // Generate some test alerts
      securityMonitor.detectAnomalies({
        body: "test'; DROP TABLE users; --test",
        clientIP: '192.168.1.24'
      });

      const auditExport = securityMonitor.exportAuditLogs();

      expect(auditExport).toHaveProperty('exported_at');
      expect(auditExport).toHaveProperty('total_alerts');
      expect(auditExport).toHaveProperty('alerts');
      expect(auditExport).toHaveProperty('summary');

      expect(auditExport.summary).toHaveProperty('by_severity');
      expect(auditExport.summary).toHaveProperty('by_type');
      expect(auditExport.total_alerts).toBeGreaterThan(0);
    });
  });

  describe('Resource Management', () => {
    it('should cleanup resources on destroy', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });
      
      securityMonitor.createRateLimiter('/test', {
        windowMs: 1000,
        maxRequests: 5,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      });

      expect(securityMonitor.getSecurityStats().rate_limiters).toBe(1);

      securityMonitor.destroy();

      expect(consoleSpy).toHaveBeenCalledWith('🛡️ Security Monitor destroyed');
      
      consoleSpy.mockRestore();
    });

    it('should perform periodic cleanup', (done) => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });
      
      // Create rate limiter with very short window for testing
      securityMonitor.createRateLimiter('/cleanup-test', {
        windowMs: 100, // Very short window
        maxRequests: 1,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      });

      // Make a request to create some data
      securityMonitor.checkRateLimit('/cleanup-test', 'test-client');

      // Wait for cleanup interval to trigger
      setTimeout(() => {
        expect(consoleSpy).toHaveBeenCalledWith('🧹 Security monitor cleanup completed');
        consoleSpy.mockRestore();
        done();
      }, 600); // Wait longer than cleanup interval
    }, 10000); // Extended timeout for this test
  });
});

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      windowMs: 1000,
      maxRequests: 3,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    });
  });

  describe('Request Limiting', () => {
    it('should allow requests within limit', () => {
      const key = 'test-key-1';

      expect(rateLimiter.isAllowed(key)).toBe(true);
      expect(rateLimiter.isAllowed(key)).toBe(true);
      expect(rateLimiter.isAllowed(key)).toBe(true);
    });

    it('should block requests exceeding limit', () => {
      const key = 'test-key-2';

      // Use up all allowed requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.isAllowed(key);
      }

      // Next request should be blocked
      expect(rateLimiter.isAllowed(key)).toBe(false);
    });

    it('should return correct remaining requests', () => {
      const key = 'test-key-3';

      expect(rateLimiter.getRemainingRequests(key)).toBe(3);

      rateLimiter.isAllowed(key);
      expect(rateLimiter.getRemainingRequests(key)).toBe(2);

      rateLimiter.isAllowed(key);
      expect(rateLimiter.getRemainingRequests(key)).toBe(1);

      rateLimiter.isAllowed(key);
      expect(rateLimiter.getRemainingRequests(key)).toBe(0);
    });

    it('should reset limits for specific key', () => {
      const key = 'test-key-4';

      // Use up all requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.isAllowed(key);
      }

      expect(rateLimiter.isAllowed(key)).toBe(false);

      // Reset and try again
      rateLimiter.reset(key);
      expect(rateLimiter.isAllowed(key)).toBe(true);
    });

    it('should handle different keys independently', () => {
      const key1 = 'user-1';
      const key2 = 'user-2';

      // Exhaust limit for key1
      for (let i = 0; i < 3; i++) {
        rateLimiter.isAllowed(key1);
      }

      expect(rateLimiter.isAllowed(key1)).toBe(false);
      expect(rateLimiter.isAllowed(key2)).toBe(true); // key2 should still work
    });

    it('should cleanup old entries', () => {
      const key = 'cleanup-test';

      rateLimiter.isAllowed(key);
      rateLimiter.cleanup();

      // After cleanup, we should have 2 remaining requests since one was used
      expect(rateLimiter.getRemainingRequests(key)).toBe(2);
    });
  });

  describe('Time Window Handling', () => {
    it('should allow requests after time window expires', (done) => {
      const key = 'time-window-test';
      
      // Create rate limiter with very short window
      const shortLimiter = new RateLimiter({
        windowMs: 200, // 200ms window
        maxRequests: 2,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      });

      // Use up the limit
      shortLimiter.isAllowed(key);
      shortLimiter.isAllowed(key);
      expect(shortLimiter.isAllowed(key)).toBe(false);

      // Wait for window to expire and try again
      setTimeout(() => {
        expect(shortLimiter.isAllowed(key)).toBe(true);
        done();
      }, 250);
    });
  });
});

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger();
  });

  describe('Logging', () => {
    it('should log security alerts', () => {
      const alert: SecurityAlert = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        severity: 'medium',
        type: 'anomaly',
        source: '192.168.1.100',
        details: { test: true },
        mitigated: false
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      auditLogger.log(alert);

      expect(consoleSpy).toHaveBeenCalled();
      expect(auditLogger.getRecentAlerts()).toHaveLength(1);
      
      consoleSpy.mockRestore();
    });

    it('should retrieve alerts by type', () => {
      const rateAlert: SecurityAlert = {
        id: 'rate-1',
        timestamp: new Date().toISOString(),
        severity: 'medium',
        type: 'rate_limit',
        source: '192.168.1.101',
        details: {},
        mitigated: false
      };

      const anomalyAlert: SecurityAlert = {
        id: 'anomaly-1',
        timestamp: new Date().toISOString(),
        severity: 'high',
        type: 'anomaly',
        source: '192.168.1.102',
        details: {},
        mitigated: false
      };

      auditLogger.log(rateAlert);
      auditLogger.log(anomalyAlert);

      expect(auditLogger.getAlertsByType('rate_limit')).toHaveLength(1);
      expect(auditLogger.getAlertsByType('anomaly')).toHaveLength(1);
      expect(auditLogger.getAlertsByType('injection')).toHaveLength(0);
    });

    it('should retrieve alerts by severity', () => {
      const lowAlert: SecurityAlert = {
        id: 'low-1',
        timestamp: new Date().toISOString(),
        severity: 'low',
        type: 'suspicious_activity',
        source: '192.168.1.103',
        details: {},
        mitigated: false
      };

      const criticalAlert: SecurityAlert = {
        id: 'critical-1',
        timestamp: new Date().toISOString(),
        severity: 'critical',
        type: 'injection',
        source: '192.168.1.104',
        details: {},
        mitigated: true
      };

      auditLogger.log(lowAlert);
      auditLogger.log(criticalAlert);

      expect(auditLogger.getAlertsBySeverity('low')).toHaveLength(1);
      expect(auditLogger.getAlertsBySeverity('critical')).toHaveLength(1);
      expect(auditLogger.getAlertsBySeverity('medium')).toHaveLength(0);
    });

    it('should retrieve alerts in time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const oldAlert: SecurityAlert = {
        id: 'old-1',
        timestamp: twoHoursAgo.toISOString(),
        severity: 'low',
        type: 'suspicious_activity',
        source: '192.168.1.105',
        details: {},
        mitigated: false
      };

      const recentAlert: SecurityAlert = {
        id: 'recent-1',
        timestamp: now.toISOString(),
        severity: 'high',
        type: 'anomaly',
        source: '192.168.1.106',
        details: {},
        mitigated: false
      };

      auditLogger.log(oldAlert);
      auditLogger.log(recentAlert);

      const recentAlerts = auditLogger.getAlertsInTimeRange(
        oneHourAgo.toISOString(),
        now.toISOString()
      );

      expect(recentAlerts).toHaveLength(1);
      expect(recentAlerts[0].id).toBe('recent-1');
    });

    it('should export logs with summary statistics', () => {
      // Add various types of alerts
      const alerts: SecurityAlert[] = [
        {
          id: 'export-1',
          timestamp: new Date().toISOString(),
          severity: 'critical',
          type: 'injection',
          source: '192.168.1.107',
          details: {},
          mitigated: true
        },
        {
          id: 'export-2',
          timestamp: new Date().toISOString(),
          severity: 'high',
          type: 'anomaly',
          source: '192.168.1.108',
          details: {},
          mitigated: false
        },
        {
          id: 'export-3',
          timestamp: new Date().toISOString(),
          severity: 'medium',
          type: 'rate_limit',
          source: '192.168.1.109',
          details: {},
          mitigated: true
        }
      ];

      alerts.forEach(alert => auditLogger.log(alert));

      const exported = auditLogger.exportLogs();

      expect(exported).toHaveProperty('exported_at');
      expect(exported).toHaveProperty('total_alerts', 3);
      expect(exported).toHaveProperty('alerts');
      expect(exported).toHaveProperty('summary');

      expect(exported.summary.by_severity.critical).toBe(1);
      expect(exported.summary.by_severity.high).toBe(1);
      expect(exported.summary.by_severity.medium).toBe(1);

      expect(exported.summary.by_type.injection).toBe(1);
      expect(exported.summary.by_type.anomaly).toBe(1);
      expect(exported.summary.by_type.rate_limit).toBe(1);
    });
  });
});