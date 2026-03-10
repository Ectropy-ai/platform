/**
 * Audit Logger Interface - Abstraction for Immutable Logging
 * 
 * This interface provides a migration path from PostgreSQL to blockchain-based
 * audit logging. Both implementations satisfy this interface, enabling seamless
 * transition when scale justifies blockchain infrastructure.
 */

export interface AuditLogger {
  /**
   * Log an audit event with cryptographic hash chaining
   * @param event - The audit event to log
   */
  log(event: AuditEvent): Promise<void>;

  /**
   * Verify the integrity of a specific audit event
   * @param eventId - The event hash to verify
   * @returns true if the event exists and hash is valid
   */
  verify(eventId: string): Promise<boolean>;

  /**
   * Retrieve the complete audit chain for a resource
   * @param resourceId - The resource identifier
   * @returns Chronologically ordered audit events
   */
  getChain(resourceId: string): Promise<AuditEvent[]>;

  /**
   * Verify the integrity of an entire audit chain
   * @param resourceId - The resource identifier
   * @returns true if all hashes in the chain are valid
   */
  verifyChain(resourceId: string): Promise<boolean>;
}

export interface AuditEvent {
  /** SHA-256 hash of event + previous hash */
  eventHash: string;
  
  /** Type of event (e.g., 'user_login', 'data_access', 'permission_change') */
  eventType: string;
  
  /** Unique identifier of the resource being audited */
  resourceId: string;
  
  /** Type of resource (e.g., 'project', 'user', 'document') */
  resourceType: string;
  
  /** Identifier of the actor performing the action */
  actorId: string;
  
  /** Event-specific data (should not contain sensitive information) */
  eventData: Record<string, any>;
  
  /** Hash of the previous event in the chain (null for first event) */
  previousHash?: string;
  
  /** Timestamp when the event occurred */
  timestamp: Date;
  
  /** Optional metadata */
  metadata?: {
    /** IP address of the actor */
    sourceIp?: string;
    
    /** User agent string */
    userAgent?: string;
    
    /** Session identifier */
    sessionId?: string;
    
    /** Request identifier for correlation */
    requestId?: string;
  };
}

/**
 * Configuration for audit logger implementations
 */
export interface AuditLoggerConfig {
  /** Enable cryptographic verification */
  enableVerification?: boolean;
  
  /** Retention period in days */
  retentionDays?: number;
  
  /** Compliance frameworks to adhere to */
  complianceFrameworks?: string[];
  
  /** Redact sensitive fields from event data */
  redactSensitiveFields?: boolean;
}

/**
 * Result of chain verification
 */
export interface ChainVerificationResult {
  /** Whether the entire chain is valid */
  valid: boolean;
  
  /** Total events in chain */
  totalEvents: number;
  
  /** Events with hash mismatches */
  invalidEvents: Array<{
    eventHash: string;
    expectedHash: string;
    computedHash: string;
    position: number;
  }>;
  
  /** Timestamp of verification */
  verifiedAt: Date;
}
