/**
 * Enhanced Audit Logging Service for Enterprise Compliance
 * Provides comprehensive audit trails for security events, authentication, and sensitive operations
 */

import { logger } from '@ectropy/shared/utils';
import { randomUUID } from 'crypto';
import { AuditPersistenceService } from './audit-persistence.service.js';

// Internal interface for audit events - not exported to avoid conflict with AuditLogger interface
interface InternalAuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  category: AuditCategory;
  severity: AuditSeverity;
  userId?: string;
  sessionId?: string;
  sourceIp: string;
  userAgent?: string;
  resource?: string;
  action: string;
  outcome: 'success' | 'failure' | 'attempt';
  details: Record<string, any>;
  metadata?: {
    requestId?: string;
    correlationId?: string;
    complianceFramework?: string[];
  };
}

export enum AuditEventType {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  DATA_MODIFICATION = 'data_modification',
  SECURITY_EVENT = 'security_event',
  SYSTEM_EVENT = 'system_event',
  COMPLIANCE_EVENT = 'compliance_event',
  SECRETS_ACCESS = 'secrets_access',
  ADMIN_ACTION = 'admin_action',
  RATE_LIMIT = 'rate_limit',
}

export enum AuditCategory {
  SECURITY = 'security',
  ACCESS_CONTROL = 'access_control',
  DATA_PROTECTION = 'data_protection',
  SYSTEM_INTEGRITY = 'system_integrity',
  COMPLIANCE = 'compliance',
  BUSINESS_OPERATIONS = 'business_operations',
}

export enum AuditSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export class EnterpriseAuditLogger {
  private static instance: EnterpriseAuditLogger;
  private auditEvents: InternalAuditEvent[] = [];
  private persistenceService?: AuditPersistenceService;

  constructor(
    private config: {
      enablePersistence?: boolean;
      retentionDays?: number;
      complianceFrameworks?: string[];
      sensitiveFieldRedaction?: boolean;
    } = {},
    persistenceService?: AuditPersistenceService
  ) {
    this.config = {
      enablePersistence: true,
      retentionDays: 2555, // 7 years for SOX compliance,
      complianceFrameworks: ['SOX', 'CMMC', 'GDPR'],
      sensitiveFieldRedaction: true,
      ...config,
    };

    if (this.config.enablePersistence) {
      this.persistenceService =
        persistenceService || new AuditPersistenceService();
    }
  }

  static getInstance(
    config?: any,
    persistenceService?: AuditPersistenceService
  ): EnterpriseAuditLogger {
    if (!EnterpriseAuditLogger.instance) {
      EnterpriseAuditLogger.instance = new EnterpriseAuditLogger(
        config,
        persistenceService
      );
    }
    return EnterpriseAuditLogger.instance;
  }

  /**
   * Log authentication events
   */
  logAuthenticationEvent(details: {
    userId?: string;
    sessionId?: string;
    sourceIp: string;
    userAgent?: string;
    action:
      | 'login'
      | 'logout'
      | 'token_refresh'
      | 'password_change'
      | 'mfa_challenge'
      | 'role_switch';
    outcome: 'success' | 'failure' | 'attempt';
    metadata?: Record<string, any>;
  }): void {
    this.logEvent({
      eventType: AuditEventType.AUTHENTICATION,
      category: AuditCategory.SECURITY,
      severity:
        details.outcome === 'failure'
          ? AuditSeverity.HIGH
          : AuditSeverity.MEDIUM,
      ...details,
      details: { action: details.action, outcome: details.outcome },
      resource: 'authentication_system',
    });
  }

  /**
   * Log authorization events
   */
  logAuthorizationEvent(details: {
    userId: string;
    sessionId?: string;
    sourceIp: string;
    userAgent?: string;
    resource: string;
    action: string;
    outcome: 'success' | 'failure' | 'attempt';
    requiredPermissions?: string[];
    actualPermissions?: string[];
    metadata?: Record<string, any>;
  }): void {
    this.logEvent({
      eventType: AuditEventType.AUTHORIZATION,
      category: AuditCategory.ACCESS_CONTROL,
      severity:
        details.outcome === 'failure' ? AuditSeverity.HIGH : AuditSeverity.LOW,
      ...details,
      details: {
        action: details.action,
        outcome: details.outcome,
        requiredPermissions: details.requiredPermissions,
        actualPermissions: details.actualPermissions,
      },
    });
  }

  /**
   * Log secrets access events
   */
  logSecretsAccessEvent(details: {
    userId?: string;
    sessionId?: string;
    sourceIp: string;
    userAgent?: string;
    secretName: string;
    action: 'retrieve' | 'update' | 'delete' | 'create' | 'rotate';
    outcome: 'success' | 'failure' | 'attempt';
    source: 'infisical' | 'aws' | 'cache';
    metadata?: Record<string, any>;
  }): void {
    this.logEvent({
      eventType: AuditEventType.SECRETS_ACCESS,
      category: AuditCategory.SECURITY,
      severity: AuditSeverity.HIGH,
      resource: details.secretName,
      action: details.action,
      sourceIp: details.sourceIp,
      userId: details.userId,
      sessionId: details.sessionId,
      userAgent: details.userAgent,
      outcome: details.outcome,
      details: {
        source: details.source,
        secretName: this.config.sensitiveFieldRedaction
          ? this.redactSensitiveInfo(details.secretName)
          : details.secretName,
        ...details.metadata,
      },
    });
  }

  /**
   * Log rate limiting events
   */
  logRateLimitEvent(details: {
    identifier: string;
    type: 'ip' | 'user';
    sourceIp: string;
    userAgent?: string;
    endpoint: string;
    method: string;
    keyPrefix: string;
    metadata?: Record<string, any>;
  }): void {
    this.logEvent({
      eventType: AuditEventType.RATE_LIMIT,
      category: AuditCategory.SECURITY,
      severity: AuditSeverity.MEDIUM,
      sourceIp: details.sourceIp,
      userAgent: details.userAgent,
      resource: details.endpoint,
      action: 'rate_limit_exceeded',
      outcome: 'failure',
      details: {
        identifier: details.identifier,
        type: details.type,
        endpoint: details.endpoint,
        method: details.method,
        keyPrefix: details.keyPrefix,
        ...details.metadata,
      },
    });
  }

  /**
   * Log admin actions
   */
  logAdminAction(details: {
    userId: string;
    sessionId?: string;
    sourceIp: string;
    userAgent?: string;
    action: string;
    resource: string;
    outcome: 'success' | 'failure' | 'attempt';
    changes?: Record<string, any>;
    metadata?: Record<string, any>;
  }): void {
    this.logEvent({
      eventType: AuditEventType.ADMIN_ACTION,
      category: AuditCategory.BUSINESS_OPERATIONS,
      severity: AuditSeverity.HIGH,
      ...details,
      details: {
        changes: details.changes
          ? this.redactSensitiveFields(details.changes)
          : undefined,
        ...details.metadata,
      },
    });
  }

  /**
   * Core event logging method
   */
  private logEvent(
    eventData: Omit<InternalAuditEvent, 'id' | 'timestamp' | 'metadata'> & {
      metadata?: Record<string, any>;
    }
  ): void {
    const auditEvent: InternalAuditEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...eventData,
      metadata: {
        requestId: this.generateRequestId(),
        correlationId: this.generateCorrelationId(),
        complianceFramework: this.config.complianceFrameworks,
        ...eventData.metadata,
      },
    };

    if (this.config.sensitiveFieldRedaction) {
      auditEvent.details = this.redactSensitiveFields(auditEvent.details);
      auditEvent.metadata = this.redactSensitiveFields(
        auditEvent.metadata || {}
      );
    }

    // Log to application logger
    logger.info('Audit Event', {
      audit: true,
      event: auditEvent,
    });

    // Store in memory for short-term access
    this.auditEvents.push(auditEvent);

    // Rotate logs if needed
    this.rotateAuditLogs();

    // ENTERPRISE SECURITY FIX: Persist to PostgreSQL audit database
    if (this.config.enablePersistence) {
      // Fire and forget - don't block on audit persistence
      this.persistAuditEvent(auditEvent).catch((error) => {
        logger.error('Audit persistence failed (non-blocking)', {
          eventId: auditEvent.id,
          error,
        });
      });
    }
  }

  /**
   * Redact sensitive information from audit logs
   */
  private redactSensitiveInfo(value: string): string {
    if (typeof value !== 'string') return value;

    // Redact common sensitive patterns
    return value
      .replace(/password/gi, '[REDACTED]')
      .replace(/secret/gi, '[REDACTED]')
      .replace(/token/gi, '[REDACTED]')
      .replace(/key/gi, '[REDACTED]')
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        '[EMAIL_REDACTED]'
      )
      .replace(
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
        '[CARD_REDACTED]'
      );
  }

  /**
   * Redact sensitive fields from objects
   * ENTERPRISE FIX: Only redact by field name, not by content scanning
   * Content scanning (redactSensitiveInfo) was too aggressive - it redacted 'token' in 'token_refresh'
   * Field-name based redaction is more precise and avoids false positives
   */
  private redactSensitiveFields(obj: Record<string, any>): Record<string, any> {
    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'key',
      'credential',
    ];
    const redacted = { ...obj };

    for (const [key, value] of Object.entries(redacted)) {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
        // Redact the entire value if field name suggests it's sensitive
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively redact nested objects
        redacted[key] = this.redactSensitiveFields(value);
      }
      // REMOVED: overly aggressive string content scanning
      // This was causing false positives like 'token_refresh' → '[REDACTED]_refresh'
    }

    return redacted;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate correlation ID for tracking related events
   */
  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Rotate audit logs based on retention policy
   */
  private rotateAuditLogs(): void {
    if (!this.config.retentionDays) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    this.auditEvents = this.auditEvents.filter(
      (event) => new Date(event.timestamp) > cutoffDate
    );
  }

  /**
   * Persist audit event to database
   * ENTERPRISE SECURITY FIX: Made async for database persistence
   */
  private async persistAuditEvent(event: InternalAuditEvent): Promise<void> {
    if (!this.persistenceService) return;
    try {
      await this.persistenceService.saveEvent(event);
    } catch (error) {
      logger.error('Failed to persist audit event', {
        eventId: event.id,
        error,
      });
    }
  }

  /**
   * Get audit events for compliance reporting
   */
  getAuditEvents(filter?: {
    startDate?: Date;
    endDate?: Date;
    eventType?: AuditEventType;
    category?: AuditCategory;
    severity?: AuditSeverity;
    userId?: string;
  }): InternalAuditEvent[] {
    let filtered = [...this.auditEvents];

    if (filter) {
      if (filter.startDate) {
        filtered = filtered.filter(
          (event) => new Date(event.timestamp) >= filter.startDate!
        );
      }
      if (filter.endDate) {
        filtered = filtered.filter(
          (event) => new Date(event.timestamp) <= filter.endDate!
        );
      }
      if (filter.eventType) {
        filtered = filtered.filter(
          (event) => event.eventType === filter.eventType
        );
      }
      if (filter.category) {
        filtered = filtered.filter(
          (event) => event.category === filter.category
        );
      }
      if (filter.severity) {
        filtered = filtered.filter(
          (event) => event.severity === filter.severity
        );
      }
      if (filter.userId) {
        filtered = filtered.filter((event) => event.userId === filter.userId);
      }
    }

    return filtered;
  }
}

// Export singleton instance for easy use
export const auditLogger = EnterpriseAuditLogger.getInstance();
