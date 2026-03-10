/**
 * PostgreSQL Implementation of Audit Logger
 * 
 * This implementation uses PostgreSQL with cryptographic hash chaining
 * to provide immutable audit logging. It satisfies the AuditLogger interface,
 * enabling future migration to blockchain when scale justifies.
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import {
  AuditLogger,
  AuditEvent,
  AuditLoggerConfig,
  ChainVerificationResult,
} from './audit-logger.interface.js';

export class PostgresAuditLogger implements AuditLogger {
  private prisma: PrismaClient;
  private config: Required<AuditLoggerConfig>;

  constructor(
    prisma: PrismaClient,
    config?: AuditLoggerConfig
  ) {
    this.prisma = prisma;
    this.config = {
      enableVerification: config?.enableVerification ?? true,
      retentionDays: config?.retentionDays ?? 2555, // 7 years for SOX compliance
      complianceFrameworks: config?.complianceFrameworks ?? ['SOX', 'CMMC', 'GDPR'],
      redactSensitiveFields: config?.redactSensitiveFields ?? true,
    };
  }

  /**
   * Log an audit event with cryptographic hash chaining
   */
  async log(event: AuditEvent): Promise<void> {
    // Get previous event for this resource to maintain chain
    const previousEvent = await this.prisma.auditLog.findFirst({
      where: { resource_id: event.resourceId },
      orderBy: { created_at: 'desc' },
      select: { event_hash: true },
    });

    const previousHash = previousEvent?.event_hash || '0';

    // Compute cryptographic hash
    const eventHash = this.computeHash(event, previousHash);

    // Redact sensitive fields if enabled
    const eventData = this.config.redactSensitiveFields
      ? this.redactSensitiveFields(event.eventData)
      : event.eventData;

    // Insert into write-only table
    await this.prisma.auditLog.create({
      data: {
        event_hash: eventHash,
        event_type: event.eventType,
        resource_id: event.resourceId,
        resource_type: event.resourceType,
        actor_id: event.actorId,
        event_data: eventData as any,
        previous_hash: previousHash === '0' ? null : previousHash,
        created_at: event.timestamp || new Date(),
        source_ip: event.metadata?.sourceIp,
        user_agent: event.metadata?.userAgent,
        session_id: event.metadata?.sessionId,
        request_id: event.metadata?.requestId,
      },
    });
  }

  /**
   * Verify the integrity of a specific audit event
   */
  async verify(eventHash: string): Promise<boolean> {
    const event = await this.prisma.auditLog.findUnique({
      where: { event_hash: eventHash },
    });

    if (!event) {
      return false;
    }

    // Reconstruct the event and compute hash
    const auditEvent: Partial<AuditEvent> = {
      eventType: event.event_type,
      resourceId: event.resource_id,
      resourceType: event.resource_type,
      actorId: event.actor_id,
      eventData: event.event_data as Record<string, any>,
      timestamp: event.created_at,
    };

    const computedHash = this.computeHash(
      auditEvent as AuditEvent,
      event.previous_hash || '0'
    );

    return computedHash === event.event_hash;
  }

  /**
   * Retrieve the complete audit chain for a resource
   */
  async getChain(resourceId: string): Promise<AuditEvent[]> {
    const events = await this.prisma.auditLog.findMany({
      where: { resource_id: resourceId },
      orderBy: { created_at: 'asc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return events.map((e: any) => ({
      eventHash: e.event_hash,
      eventType: e.event_type,
      resourceId: e.resource_id,
      resourceType: e.resource_type,
      actorId: e.actor_id,
      eventData: e.event_data as Record<string, unknown>,
      previousHash: e.previous_hash || undefined,
      timestamp: e.created_at,
      metadata: {
        sourceIp: e.source_ip || undefined,
        userAgent: e.user_agent || undefined,
        sessionId: e.session_id || undefined,
        requestId: e.request_id || undefined,
      },
    }));
  }

  /**
   * Verify the integrity of an entire audit chain
   */
  async verifyChain(resourceId: string): Promise<boolean> {
    const events = await this.getChain(resourceId);

    if (events.length === 0) {
      return true; // Empty chain is valid
    }

    // Verify first event has no previous hash or previous hash is '0'
    if (events[0].previousHash && events[0].previousHash !== '0') {
      return false;
    }

    // Verify each subsequent event
    for (let i = 1; i < events.length; i++) {
      const currentEvent = events[i];
      const previousHash = events[i - 1].eventHash;

      if (currentEvent.previousHash !== previousHash) {
        return false;
      }

      // Verify the hash itself
      const computedHash = this.computeHash(currentEvent, previousHash);
      if (computedHash !== currentEvent.eventHash) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get detailed chain verification result
   */
  async verifyChainDetailed(resourceId: string): Promise<ChainVerificationResult> {
    const events = await this.getChain(resourceId);
    const invalidEvents: ChainVerificationResult['invalidEvents'] = [];

    if (events.length === 0) {
      return {
        valid: true,
        totalEvents: 0,
        invalidEvents: [],
        verifiedAt: new Date(),
      };
    }

    // Verify each event
    for (let i = 0; i < events.length; i++) {
      const currentEvent = events[i];
      const previousHash = i === 0 ? '0' : events[i - 1].eventHash;

      const expectedPreviousHash = i === 0 ? undefined : previousHash;
      if (currentEvent.previousHash !== expectedPreviousHash) {
        invalidEvents.push({
          eventHash: currentEvent.eventHash,
          expectedHash: expectedPreviousHash || '0',
          computedHash: currentEvent.previousHash || 'null',
          position: i,
        });
        continue;
      }

      const computedHash = this.computeHash(currentEvent, previousHash);
      if (computedHash !== currentEvent.eventHash) {
        invalidEvents.push({
          eventHash: currentEvent.eventHash,
          expectedHash: currentEvent.eventHash,
          computedHash,
          position: i,
        });
      }
    }

    return {
      valid: invalidEvents.length === 0,
      totalEvents: events.length,
      invalidEvents,
      verifiedAt: new Date(),
    };
  }

  /**
   * Compute SHA-256 hash of event + previous hash
   */
  private computeHash(event: Partial<AuditEvent>, previousHash: string): string {
    const data = JSON.stringify({
      timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp,
      eventType: event.eventType,
      resourceId: event.resourceId,
      resourceType: event.resourceType,
      actorId: event.actorId,
      eventData: event.eventData,
      previousHash,
    });

    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Redact sensitive fields from event data
   */
  private redactSensitiveFields(data: Record<string, any>): Record<string, any> {
    const sensitivePatterns = [
      'password',
      'secret',
      'token',
      'key',
      'credential',
      'authorization',
      'api_key',
      'apikey',
    ];

    const redacted: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      const isSensitive = sensitivePatterns.some((pattern) =>
        keyLower.includes(pattern)
      );

      if (isSensitive) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redactSensitiveFields(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanup(): Promise<number> {
    if (!this.config.retentionDays) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        created_at: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}
