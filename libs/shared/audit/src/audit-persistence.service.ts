/**
 * ENTERPRISE PRODUCTION-READY AUDIT PERSISTENCE
 *
 * Database-backed audit logging with cryptographic hash chaining for immutability.
 * Provides compliance-ready audit trails with 7-year retention (SOX, CMMC, GDPR).
 *
 * SECURITY FEATURES:
 * - PostgreSQL persistence (survives server restarts)
 * - Cryptographic hash chaining (tamper detection)
 * - Automatic event deduplication (event_hash unique constraint)
 * - Compliance metadata tracking (source IP, user agent, session ID, request ID)
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import { logger } from '@ectropy/shared/utils';

export class AuditPersistenceService {
  private pool?: Pool;

  constructor(pool?: Pool) {
    this.pool = pool;
  }

  /**
   * Persist an audit event to PostgreSQL with hash chaining
   * ENTERPRISE SECURITY FIX: Replaced in-memory storage with database persistence
   */
  async saveEvent(event: any): Promise<void> {
    if (!this.pool) {
      logger.warn('Audit persistence disabled - no database pool provided');
      return;
    }

    try {
      // Extract fields from InternalAuditEvent
      const resourceId = event.resource || event.id || 'system';
      const resourceType = event.category || 'audit_event';
      const actorId = event.userId || 'system';
      const eventType = event.eventType || event.action || 'unknown';

      // Get previous event hash for this resource (hash chaining)
      const previousEventQuery = await this.pool.query(
        `SELECT event_hash FROM audit_log
         WHERE resource_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [resourceId]
      );

      const previousHash = previousEventQuery.rows[0]?.event_hash || '0';

      // Compute cryptographic hash (SHA-256)
      const eventData = {
        timestamp: event.timestamp || new Date().toISOString(),
        eventType,
        resourceId,
        resourceType,
        actorId,
        eventData: event.details || {},
        previousHash,
      };

      const eventHash = createHash('sha256')
        .update(JSON.stringify(eventData))
        .digest('hex');

      // Insert into audit_log table with metadata
      await this.pool.query(
        `INSERT INTO audit_log (
          event_hash, event_type, resource_id, resource_type, actor_id,
          event_data, previous_hash, created_at,
          source_ip, user_agent, session_id, request_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (event_hash) DO NOTHING`,
        [
          eventHash,
          eventType,
          resourceId,
          resourceType,
          actorId,
          JSON.stringify(event.details || {}),
          previousHash === '0' ? null : previousHash,
          event.timestamp ? new Date(event.timestamp) : new Date(),
          event.sourceIp || null,
          event.userAgent || null,
          event.sessionId || null,
          event.metadata?.requestId || null,
        ]
      );

      logger.debug('Audit event persisted to database', {
        eventHash,
        eventType,
        resourceId,
      });
    } catch (error) {
      logger.error('Failed to persist audit event to database', {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - audit logging should never crash the application
    }
  }

  /**
   * Retrieve persisted audit events with filtering
   * ENTERPRISE COMPLIANCE: Support for audit trail retrieval
   */
  async getEvents(filter?: {
    resourceId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    if (!this.pool) {
      logger.warn('Audit persistence disabled - no database pool provided');
      return [];
    }

    try {
      let query = 'SELECT * FROM audit_log WHERE 1=1';
      const params: any[] = [];
      let paramCount = 1;

      if (filter?.resourceId) {
        query += ` AND resource_id = $${paramCount++}`;
        params.push(filter.resourceId);
      }

      if (filter?.eventType) {
        query += ` AND event_type = $${paramCount++}`;
        params.push(filter.eventType);
      }

      if (filter?.startDate) {
        query += ` AND created_at >= $${paramCount++}`;
        params.push(filter.startDate);
      }

      if (filter?.endDate) {
        query += ` AND created_at <= $${paramCount++}`;
        params.push(filter.endDate);
      }

      query += ' ORDER BY created_at DESC';

      if (filter?.limit) {
        query += ` LIMIT $${paramCount++}`;
        params.push(filter.limit);
      }

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Failed to retrieve audit events from database', {
        filter,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Verify the integrity of an audit event chain
   * ENTERPRISE SECURITY: Tamper detection via hash chain verification
   */
  async verifyChain(resourceId: string): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      const result = await this.pool.query(
        `SELECT event_hash, event_type, resource_id, resource_type, actor_id,
                event_data, previous_hash, created_at
         FROM audit_log
         WHERE resource_id = $1
         ORDER BY created_at ASC`,
        [resourceId]
      );

      const events = result.rows;

      if (events.length === 0) {
        return true; // Empty chain is valid
      }

      // Verify each event's hash
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const previousHash = i === 0 ? '0' : events[i - 1].event_hash;

        const eventData = {
          timestamp: event.created_at.toISOString(),
          eventType: event.event_type,
          resourceId: event.resource_id,
          resourceType: event.resource_type,
          actorId: event.actor_id,
          eventData: event.event_data,
          previousHash,
        };

        const computedHash = createHash('sha256')
          .update(JSON.stringify(eventData))
          .digest('hex');

        if (computedHash !== event.event_hash) {
          logger.error('Audit chain integrity violation detected', {
            resourceId,
            eventHash: event.event_hash,
            computedHash,
            position: i,
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to verify audit chain', {
        resourceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
