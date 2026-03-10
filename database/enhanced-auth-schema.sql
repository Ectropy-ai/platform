-- Enhanced Authentication Database Schema for Ectropy Platform
-- Production-ready schema with comprehensive security features

-- Enable extensions for enhanced security
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext"; -- Case-insensitive text

-- Users table with enhanced security features
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    password_history JSONB DEFAULT '[]'::jsonb, -- Store last 5 password hashes
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token TEXT,
    email_verification_expires_at TIMESTAMP,
    
    -- Role and permissions
    role VARCHAR(100) DEFAULT 'user',
    permissions JSONB DEFAULT '[]'::jsonb,
    
    -- Security tracking
    failed_login_attempts INTEGER DEFAULT 0,
    last_login_attempt TIMESTAMP,
    last_successful_login TIMESTAMP,
    last_password_change TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    account_locked_until TIMESTAMP,
    
    -- Two-factor authentication
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret TEXT,
    two_factor_backup_codes JSONB DEFAULT '[]'::jsonb,
    two_factor_last_used TIMESTAMP,
    
    -- Phone and SMS 2FA
    phone_number VARCHAR(20),
    phone_verified BOOLEAN DEFAULT FALSE,
    phone_verification_code VARCHAR(10),
    phone_verification_expires_at TIMESTAMP,
    
    -- Profile and metadata
    profile_data JSONB DEFAULT '{}'::jsonb,
    preferences JSONB DEFAULT '{}'::jsonb,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_phone_format CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9]\d{1,14}$'),
    CONSTRAINT chk_failed_attempts CHECK (failed_login_attempts >= 0)
);

-- User sessions table for enhanced session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    refresh_token TEXT UNIQUE,
    
    -- Device and location tracking
    device_fingerprint TEXT,
    ip_address INET,
    user_agent TEXT,
    device_info JSONB DEFAULT '{}'::jsonb,
    location_info JSONB DEFAULT '{}'::jsonb,
    
    -- Session lifecycle
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Security flags
    is_suspicious BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id),
    revocation_reason TEXT,
    
    -- Indexes for performance
    CONSTRAINT chk_expires_future CHECK (expires_at > created_at)
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_token_not_empty CHECK (LENGTH(token) > 10),
    CONSTRAINT chk_expires_future CHECK (expires_at > created_at)
);

-- Authentication events log for security monitoring
CREATE TABLE IF NOT EXISTS auth_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- login_success, login_failed, logout, 2fa_enabled, etc.
    
    -- Event details
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    device_fingerprint TEXT,
    
    -- Geolocation (if available)
    country_code CHAR(2),
    city VARCHAR(100),
    
    -- Risk assessment
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_factors JSONB DEFAULT '[]'::jsonb,
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Additional context
    session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
    related_event_id UUID REFERENCES auth_events(id)
);

-- Security incidents table for tracking potential threats
CREATE TABLE IF NOT EXISTS security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_type VARCHAR(50) NOT NULL, -- brute_force, suspicious_login, account_takeover, etc.
    severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    status VARCHAR(20) DEFAULT 'open', -- open, investigating, resolved, false_positive
    
    -- Affected entities
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    affected_accounts INTEGER DEFAULT 1,
    
    -- Incident details
    description TEXT,
    indicators JSONB DEFAULT '{}'::jsonb,
    evidence JSONB DEFAULT '{}'::jsonb,
    
    -- Response tracking
    assigned_to UUID REFERENCES users(id),
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT chk_status CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive'))
);

-- API keys table for service-to-service authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix VARCHAR(10) NOT NULL, -- First 8 chars for identification
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Owner and permissions
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    scopes JSONB DEFAULT '[]'::jsonb, -- Array of permission scopes
    rate_limit_per_hour INTEGER DEFAULT 1000,
    
    -- Lifecycle
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    last_used TIMESTAMP,
    usage_count BIGINT DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id)
);

-- Rate limiting tracking
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL, -- IP address, user ID, or API key
    identifier_type VARCHAR(20) NOT NULL, -- 'ip', 'user', 'api_key'
    endpoint VARCHAR(100) NOT NULL,
    
    -- Rate limiting data
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    window_size_seconds INTEGER NOT NULL,
    
    -- Metadata
    last_request TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(identifier, identifier_type, endpoint, window_start)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified) WHERE email_verified = true;
CREATE INDEX IF NOT EXISTS idx_users_2fa_enabled ON users(two_factor_enabled) WHERE two_factor_enabled = true;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active, expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_ip ON user_sessions(ip_address);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_id ON auth_events(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_type ON auth_events(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_ip ON auth_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_auth_events_risk ON auth_events(risk_score) WHERE risk_score > 50;

CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON security_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_security_incidents_user ON security_incidents(user_id);
CREATE INDEX IF NOT EXISTS idx_security_incidents_created ON security_incidents(created_at);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier, identifier_type, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start, window_size_seconds);

-- Functions for password history management
CREATE OR REPLACE FUNCTION check_password_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check if password is being changed
    IF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
        -- Update password_history by adding old hash and keeping last 5
        NEW.password_history := (
            SELECT jsonb_agg(hash)
            FROM (
                SELECT jsonb_array_elements_text(
                    COALESCE(OLD.password_history, '[]'::jsonb) || to_jsonb(OLD.password_hash)
                ) AS hash
                ORDER BY ordinality DESC
                LIMIT 5
            ) AS recent_hashes
        );
        
        NEW.last_password_change := CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for password history
DROP TRIGGER IF EXISTS trg_password_history ON users;
CREATE TRIGGER trg_password_history
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION check_password_history();

-- Function to clean up expired tokens and sessions
CREATE OR REPLACE FUNCTION cleanup_expired_auth_data()
RETURNS INTEGER AS $$
DECLARE
    cleaned_count INTEGER := 0;
BEGIN
    -- Clean up expired sessions
    DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    
    -- Clean up expired password reset tokens
    DELETE FROM password_reset_tokens WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS cleaned_count = cleaned_count + ROW_COUNT;
    
    -- Clean up expired email verification tokens
    UPDATE users 
    SET email_verification_token = NULL, 
        email_verification_expires_at = NULL
    WHERE email_verification_expires_at < CURRENT_TIMESTAMP;
    
    -- Clean up expired phone verification codes
    UPDATE users 
    SET phone_verification_code = NULL, 
        phone_verification_expires_at = NULL
    WHERE phone_verification_expires_at < CURRENT_TIMESTAMP;
    
    -- Clean up old auth events (keep last 90 days)
    DELETE FROM auth_events WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
    GET DIAGNOSTICS cleaned_count = cleaned_count + ROW_COUNT;
    
    -- Clean up old rate limit records (keep last 24 hours)
    DELETE FROM rate_limits WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours';
    GET DIAGNOSTICS cleaned_count = cleaned_count + ROW_COUNT;
    
    RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_security_incidents_updated_at
    BEFORE UPDATE ON security_incidents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY users_self_access ON users
    FOR ALL
    TO authenticated_user
    USING (id = current_setting('app.current_user_id')::uuid);

-- Admin users can see all data
CREATE POLICY users_admin_access ON users
    FOR ALL
    TO authenticated_user
    USING (EXISTS (
        SELECT 1 FROM users 
        WHERE id = current_setting('app.current_user_id')::uuid 
        AND role = 'admin'
    ));

-- Sessions policy - users can only see their own sessions
CREATE POLICY sessions_user_access ON user_sessions
    FOR ALL
    TO authenticated_user
    USING (user_id = current_setting('app.current_user_id')::uuid);

-- Auth events policy - users can see their own events
CREATE POLICY auth_events_user_access ON auth_events
    FOR SELECT
    TO authenticated_user
    USING (user_id = current_setting('app.current_user_id')::uuid);

-- Insert sample admin user (for development/testing)
-- Password: AdminPassword123! (should be changed in production)
INSERT INTO users (
    email, 
    username, 
    full_name, 
    password_hash, 
    role, 
    permissions,
    is_active,
    email_verified
) VALUES (
    'admin@ectropy.com',
    'admin',
    'System Administrator',
    '$2b$12$LQv3c1yqBwEHxPunCGGiEu.8rnFb6nqF5M6pjWL4y1cR5RQi1gMmK', -- AdminPassword123!
    'admin',
    '["read", "write", "admin", "user_management", "system_config"]'::jsonb,
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- Insert sample regular user (for development/testing)
-- Password: UserPassword123!
INSERT INTO users (
    email, 
    username, 
    full_name, 
    password_hash, 
    role, 
    permissions,
    is_active,
    email_verified
) VALUES (
    'user@ectropy.com',
    'user',
    'Regular User',
    '$2b$12$8IXKvTyFjmgpOOyU5kF.1OYEbEu0F8F5w0K5Rk5oA.V5L4K8L4K8G', -- UserPassword123!
    'user',
    '["read", "write"]'::jsonb,
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- Create roles for connection security
CREATE ROLE authenticated_user;
CREATE ROLE anonymous_user;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated_user, anonymous_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated_user;
GRANT SELECT ON users, auth_events TO anonymous_user; -- Limited access for login
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated_user, anonymous_user;