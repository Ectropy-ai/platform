/**
 * =============================================================================
 * ENTERPRISE AUDIT LOGGING SERVICE (API GATEWAY)
 *
 * PURPOSE: Immutable, tamper-evident audit trail for compliance
 * ENTERPRISE PATTERN: Blockchain-style hash chaining for integrity
 *
 * FEATURES:
 * - Cryptographic hash chaining (tamper detection)
 * - Automatic request context integration
 * - Typed audit events with validation
 * - Graceful fallback when database unavailable
 * - Async write with in-memory buffer for performance
 * - SOC2 / GDPR / HIPAA compliant event structure
 *
 * COMPLIANCE: SOC2-CC6.1, GDPR-Article30, HIPAA-164.312
 * DEPLOYMENT: Phase 1 Priority 2 - Security Hardening (2025-11-30)
 * =============================================================================
 */

import { createHash } from 'crypto';
import { getPrismaClient } from '../database/prisma.js';
import { requestContext } from '@ectropy/shared/utils';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

/**
 * Audit Event Types - Comprehensive coverage for enterprise compliance
 */
export enum AuditEventType {
  // Authentication Events
  AUTH_LOGIN_SUCCESS = 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILED = 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_TOKEN_REFRESH = 'AUTH_TOKEN_REFRESH',
  AUTH_SESSION_INVALIDATED = 'AUTH_SESSION_INVALIDATED',
  AUTH_MFA_ENABLED = 'AUTH_MFA_ENABLED',
  AUTH_MFA_VERIFIED = 'AUTH_MFA_VERIFIED',
  AUTH_PASSWORD_CHANGED = 'AUTH_PASSWORD_CHANGED',
  AUTH_PASSWORD_RESET = 'AUTH_PASSWORD_RESET',

  // Authorization Events
  AUTHZ_PERMISSION_GRANTED = 'AUTHZ_PERMISSION_GRANTED',
  AUTHZ_PERMISSION_DENIED = 'AUTHZ_PERMISSION_DENIED',
  AUTHZ_ROLE_ASSIGNED = 'AUTHZ_ROLE_ASSIGNED',
  AUTHZ_ROLE_REVOKED = 'AUTHZ_ROLE_REVOKED',

  // Resource Events
  RESOURCE_CREATED = 'RESOURCE_CREATED',
  RESOURCE_READ = 'RESOURCE_READ',
  RESOURCE_UPDATED = 'RESOURCE_UPDATED',
  RESOURCE_DELETED = 'RESOURCE_DELETED',
  RESOURCE_EXPORTED = 'RESOURCE_EXPORTED',
  RESOURCE_SHARED = 'RESOURCE_SHARED',

  // File Operations
  FILE_UPLOADED = 'FILE_UPLOADED',
  FILE_DOWNLOADED = 'FILE_DOWNLOADED',
  FILE_DELETED = 'FILE_DELETED',
  FILE_SCAN_COMPLETED = 'FILE_SCAN_COMPLETED',
  FILE_SCAN_BLOCKED = 'FILE_SCAN_BLOCKED',

  // API Events
  API_KEY_CREATED = 'API_KEY_CREATED',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
  API_KEY_USED = 'API_KEY_USED',
  API_RATE_LIMIT_HIT = 'API_RATE_LIMIT_HIT',

  // Security Events
  SECURITY_ALERT = 'SECURITY_ALERT',
  SECURITY_THREAT_DETECTED = 'SECURITY_THREAT_DETECTED',
  SECURITY_CSP_VIOLATION = 'SECURITY_CSP_VIOLATION',
  SECURITY_CORS_VIOLATION = 'SECURITY_CORS_VIOLATION',

  // Admin Events
  ADMIN_USER_CREATED = 'ADMIN_USER_CREATED',
  ADMIN_USER_DELETED = 'ADMIN_USER_DELETED',
  ADMIN_CONFIG_CHANGED = 'ADMIN_CONFIG_CHANGED',
  ADMIN_AUDIT_EXPORTED = 'ADMIN_AUDIT_EXPORTED',

  // System Events
  SYSTEM_STARTUP = 'SYSTEM_STARTUP',
  SYSTEM_SHUTDOWN = 'SYSTEM_SHUTDOWN',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  SYSTEM_MAINTENANCE = 'SYSTEM_MAINTENANCE',
}

/**
 * Resource Types for categorization
 */
export enum AuditResourceType {
  USER = 'user',
  SESSION = 'session',
  API_KEY = 'api_key',
  FILE = 'file',
  MODEL = 'model',
  PROJECT = 'project',
  CONFIG = 'config',
  SYSTEM = 'system',
}

/**
 * Audit Event Input (what callers provide)
 */
export interface AuditEventInput {
  eventType: AuditEventType;
  resourceId: string;
  resourceType: AuditResourceType;
  actorId?: string; // Defaults to current user from context
  eventData?: Record<string, unknown>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Full Audit Event (what gets stored)
 */
export interface AuditEvent {
  eventHash: string;
  eventType: string;
  resourceId: string;
  resourceType: string;
  actorId: string;
  eventData: Record<string, unknown>;
  previousHash: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  sessionId: string | null;
  requestId: string | null;
  createdAt: Date;
}

/**
 * Enterprise Audit Service
 * Implements tamper-evident logging with hash chaining
 */
class EnterpriseAuditService {
  private prisma: ReturnType<typeof getPrismaClient> | null = null;
  private lastHash: string | null = null;
  private buffer: AuditEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // Configuration
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds
  private readonly MAX_RETRIES = 3;

  constructor() {
    // Defer initialization to avoid blocking startup
    this.initializationPromise = this.initialize();
  }

  /**
   * Initialize database connection and load last hash
   */
  private async initialize(): Promise<void> {
    try {
      // Use shared Prisma Client singleton to prevent connection pool exhaustion
      this.prisma = getPrismaClient();

      // Load the last hash for chain continuity
      await this.loadLastHash();

      // Start periodic flush
      this.startPeriodicFlush();

      this.isInitialized = true;
      logger.info('[Audit] Enterprise audit service initialized');
    } catch (error) {
      logger.warn('[Audit] Initialization failed - using memory buffer only', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Service will continue with in-memory buffer only
    }
  }

  /**
   * Load the most recent event hash for chain continuity
   */
  private async loadLastHash(): Promise<void> {
    if (!this.prisma) return;

    try {
      const lastEvent = await this.prisma.auditLog.findFirst({
        orderBy: { created_at: 'desc' },
        select: { event_hash: true },
      });

      this.lastHash = lastEvent?.event_hash || null;

      if (this.lastHash) {
        logger.debug('[Audit] Chain resumed', {
          lastHash: this.lastHash.substring(0, 8) + '...',
        });
      }
    } catch (error) {
      logger.warn('[Audit] Failed to load last hash', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Generate cryptographic hash for audit event
   * Creates tamper-evident chain by including previous hash
   */
  private generateEventHash(event: Omit<AuditEvent, 'eventHash'>): string {
    const payload = JSON.stringify({
      eventType: event.eventType,
      resourceId: event.resourceId,
      resourceType: event.resourceType,
      actorId: event.actorId,
      eventData: event.eventData,
      previousHash: event.previousHash,
      createdAt: event.createdAt.toISOString(),
      requestId: event.requestId,
    });

    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Log an audit event
   * Thread-safe with automatic batching for performance
   */
  async log(input: AuditEventInput): Promise<void> {
    // Wait for initialization if needed
    if (this.initializationPromise) {
      await this.initializationPromise;
    }

    // Get request context for metadata
    const ctx = requestContext.getContext();

    // Build full event
    const event: AuditEvent = {
      eventHash: '', // Will be set after hash calculation
      eventType: input.eventType,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      actorId: input.actorId || ctx?.userId || 'system',
      eventData: {
        ...input.eventData,
        severity: input.severity || 'low',
      },
      previousHash: this.lastHash,
      sourceIp: (ctx?.metadata?.['ip'] as string) || null,
      userAgent: (ctx?.metadata?.['userAgent'] as string) || null,
      sessionId: ctx?.sessionId || null,
      requestId: ctx?.requestId || null,
      createdAt: new Date(),
    };

    // Generate hash including previous hash for chain integrity
    event.eventHash = this.generateEventHash(event);

    // Update chain pointer
    this.lastHash = event.eventHash;

    // Add to buffer
    this.buffer.push(event);

    // Log high-severity events immediately
    if (input.severity === 'high' || input.severity === 'critical') {
      logger.warn(
        `[Audit] ${input.severity.toUpperCase()}: ${input.eventType}`,
        {
          resourceId: input.resourceId,
          actorId: event.actorId,
          eventHash: event.eventHash.substring(0, 8),
        }
      );
    }

    // Flush if buffer is full
    if (this.buffer.length >= this.BUFFER_SIZE) {
      await this.flush();
    }
  }

  /**
   * Convenience methods for common audit events
   */
  async logAuth(
    eventType: AuditEventType,
    userId: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType,
      resourceId: userId,
      resourceType: AuditResourceType.USER,
      actorId: userId,
      eventData: data,
      severity: eventType.includes('FAILED') ? 'medium' : 'low',
    });
  }

  async logFileOperation(
    eventType: AuditEventType,
    fileId: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType,
      resourceId: fileId,
      resourceType: AuditResourceType.FILE,
      eventData: data,
      severity: eventType.includes('BLOCKED') ? 'high' : 'low',
    });
  }

  async logSecurityEvent(
    eventType: AuditEventType,
    resourceId: string,
    data?: Record<string, unknown>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<void> {
    await this.log({
      eventType,
      resourceId,
      resourceType: AuditResourceType.SYSTEM,
      eventData: data,
      severity,
    });
  }

  /**
   * Flush buffer to database
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.prisma) {
      return;
    }

    const eventsToWrite = [...this.buffer];
    this.buffer = [];

    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        // Use createMany for batch insert performance
        await this.prisma.auditLog.createMany({
          data: eventsToWrite.map((event) => ({
            event_hash: event.eventHash,
            event_type: event.eventType,
            resource_id: event.resourceId,
            resource_type: event.resourceType,
            actor_id: event.actorId,
            event_data: event.eventData as any,
            previous_hash: event.previousHash,
            source_ip: event.sourceIp,
            user_agent: event.userAgent,
            session_id: event.sessionId,
            request_id: event.requestId,
            created_at: event.createdAt,
          })),
          skipDuplicates: true, // Idempotent writes
        });

        logger.debug('[Audit] Events flushed', {
          count: eventsToWrite.length,
        });
        return;
      } catch (error) {
        retries++;
        if (retries >= this.MAX_RETRIES) {
          // Put events back in buffer for next flush
          this.buffer = [...eventsToWrite, ...this.buffer];
          logger.error('[Audit] Failed to flush events after retries', {
            error: error instanceof Error ? error.message : 'Unknown error',
            count: eventsToWrite.length,
          });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 100 * retries));
        }
      }
    }
  }

  /**
   * Start periodic flush interval
   */
  private startPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(() => {
      this.flush().catch((error) => {
        logger.warn('[Audit] Periodic flush failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Verify audit chain integrity
   * Used for compliance audits and tamper detection
   */
  async verifyChainIntegrity(limit = 1000): Promise<{
    valid: boolean;
    eventsChecked: number;
    brokenAt?: string;
  }> {
    if (!this.prisma) {
      return { valid: false, eventsChecked: 0 };
    }

    try {
      const events = await this.prisma.auditLog.findMany({
        orderBy: { created_at: 'asc' },
        take: limit,
        select: {
          event_hash: true,
          event_type: true,
          resource_id: true,
          resource_type: true,
          actor_id: true,
          event_data: true,
          previous_hash: true,
          created_at: true,
          request_id: true,
        },
      });

      let previousHash: string | null = null;

      for (const event of events) {
        // Verify previous hash matches
        if (event.previous_hash !== previousHash) {
          return {
            valid: false,
            eventsChecked: events.indexOf(event),
            brokenAt: event.event_hash,
          };
        }

        // Verify event hash is correct
        const expectedHash = this.generateEventHash({
          eventType: event.event_type,
          resourceId: event.resource_id,
          resourceType: event.resource_type,
          actorId: event.actor_id,
          eventData: event.event_data as Record<string, unknown>,
          previousHash: event.previous_hash,
          sourceIp: null,
          userAgent: null,
          sessionId: null,
          requestId: event.request_id,
          createdAt: event.created_at,
        });

        if (event.event_hash !== expectedHash) {
          return {
            valid: false,
            eventsChecked: events.indexOf(event),
            brokenAt: event.event_hash,
          };
        }

        previousHash = event.event_hash;
      }

      return { valid: true, eventsChecked: events.length };
    } catch (error) {
      logger.error('[Audit] Chain integrity verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { valid: false, eventsChecked: 0 };
    }
  }

  /**
   * Graceful shutdown - flush remaining events
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Final flush
    await this.flush();

    if (this.prisma) {
      await this.prisma.$disconnect();
    }

    logger.info('[Audit] Service shutdown complete');
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    bufferSize: number;
    lastHash: string | null;
    databaseConnected: boolean;
  } {
    return {
      initialized: this.isInitialized,
      bufferSize: this.buffer.length,
      lastHash: this.lastHash ? this.lastHash.substring(0, 8) + '...' : null,
      databaseConnected: this.prisma !== null,
    };
  }
}

// Singleton instance
export const auditService = new EnterpriseAuditService();

// Export for testing
export { EnterpriseAuditService };
