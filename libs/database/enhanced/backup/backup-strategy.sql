-- Database Backup and Recovery Strategy
-- Phase 1.1: Production-Ready Backup Setup

-- Create backup role
CREATE ROLE backup_user LOGIN PASSWORD '<BACKUP_USER_PASSWORD>';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
GRANT USAGE ON SCHEMA public TO backup_user;

-- Create backup logging table
CREATE TABLE backup_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backup_type VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'running',
    file_path TEXT,
    file_size BIGINT,
    error_message TEXT,
    created_by VARCHAR(100) DEFAULT 'system'
);

-- Create backup status function
CREATE OR REPLACE FUNCTION log_backup_start(backup_type TEXT, file_path TEXT)
RETURNS UUID AS $$
DECLARE
    backup_id UUID;
BEGIN
    INSERT INTO backup_logs (backup_type, file_path, status)
    VALUES (backup_type, file_path, 'running')
    RETURNING id INTO backup_id;
    
    RETURN backup_id;
END;
$$ LANGUAGE plpgsql;

-- Create backup completion function
CREATE OR REPLACE FUNCTION log_backup_complete(backup_id UUID, file_size BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE backup_logs 
    SET 
        end_time = CURRENT_TIMESTAMP,
        status = 'completed',
        file_size = file_size
    WHERE id = backup_id;
END;
$$ LANGUAGE plpgsql;

-- Create backup error function
CREATE OR REPLACE FUNCTION log_backup_error(backup_id UUID, error_msg TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE backup_logs 
    SET 
        end_time = CURRENT_TIMESTAMP,
        status = 'failed',
        error_message = error_msg
    WHERE id = backup_id;
END;
$$ LANGUAGE plpgsql;

-- Create data retention policy
CREATE OR REPLACE FUNCTION cleanup_old_backups()
RETURNS VOID AS $$
BEGIN
    -- Keep backup logs for 90 days
    DELETE FROM backup_logs 
    WHERE start_time < CURRENT_TIMESTAMP - INTERVAL '90 days';
    
    -- Keep audit logs for 1 year
    DELETE FROM audit_logs 
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '1 year';
    
    -- Clean up old user sessions
    DELETE FROM user_sessions 
    WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (would be run by cron or similar)
-- SELECT cleanup_old_backups();

COMMIT;
