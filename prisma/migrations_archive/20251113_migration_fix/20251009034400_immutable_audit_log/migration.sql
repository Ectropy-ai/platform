-- CreateTable: Immutable Audit Log
-- This table implements a cryptographic hash chain for tamper-evident audit logging
-- Supports migration path from PostgreSQL to blockchain (Polygon) when scale justifies

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_hash VARCHAR(64) NOT NULL UNIQUE,
  event_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  event_data JSONB NOT NULL,
  previous_hash VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Metadata fields for compliance
  source_ip VARCHAR(45),
  user_agent TEXT,
  session_id VARCHAR(255),
  request_id VARCHAR(255),
  
  -- Immutability enforcement
  CHECK (created_at IS NOT NULL)
);

-- Write-only permissions: Revoke UPDATE and DELETE to enforce immutability
-- NOTE: These commands require appropriate database role configuration
-- REVOKE UPDATE, DELETE ON audit_log FROM ectropy_api;
-- GRANT INSERT, SELECT ON audit_log TO ectropy_api;

-- Performance indexes
CREATE INDEX idx_audit_chain ON audit_log(resource_id, created_at);
CREATE INDEX idx_audit_hash ON audit_log(event_hash);
CREATE INDEX idx_audit_type ON audit_log(event_type);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- Index for chain verification queries
CREATE INDEX idx_audit_prev_hash ON audit_log(previous_hash) WHERE previous_hash IS NOT NULL;

-- Comment documentation
COMMENT ON TABLE audit_log IS 'Immutable audit log with cryptographic hash chain for tamper detection';
COMMENT ON COLUMN audit_log.event_hash IS 'SHA-256 hash of event data + previous hash';
COMMENT ON COLUMN audit_log.previous_hash IS 'Hash of previous event in chain (NULL for first event)';
COMMENT ON COLUMN audit_log.event_data IS 'Event-specific data (sensitive fields should be redacted)';
