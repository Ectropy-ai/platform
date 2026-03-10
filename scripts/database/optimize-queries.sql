-- =============================================================================
-- ECTROPY PLATFORM - DATABASE PERFORMANCE OPTIMIZATION
-- =============================================================================
-- Advanced query optimization and performance tuning
-- This script implements priority #4: PERFORMANCE OPTIMIZATION
-- =============================================================================

-- Enable timing for performance monitoring
\timing on

-- Display current database statistics
\echo '🔍 CURRENT DATABASE PERFORMANCE ANALYSIS'
\echo '========================================'

-- Database size and table statistics
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS data_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Current active connections and slow queries
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
    AND state = 'active'
ORDER BY duration DESC;

\echo ''
\echo '📈 IMPLEMENTING PERFORMANCE OPTIMIZATIONS'
\echo '========================================='

-- =============================================================================
-- INDEX OPTIMIZATION
-- =============================================================================

\echo 'Creating performance indexes...'

-- Essential indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_project_id 
    ON elements(project_id) 
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_type 
    ON elements(type) 
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_created_at 
    ON elements(created_at DESC) 
    WHERE deleted_at IS NULL;

-- GIN index for JSONB properties (efficient for BIM data)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_properties_gin 
    ON elements USING gin(properties) 
    WHERE deleted_at IS NULL AND properties IS NOT NULL;

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_project_type 
    ON elements(project_id, type) 
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_project_created 
    ON elements(project_id, created_at DESC) 
    WHERE deleted_at IS NULL;

-- Projects table optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_owner_id 
    ON projects(owner_id) 
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_status 
    ON projects(status) 
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_updated_at 
    ON projects(updated_at DESC) 
    WHERE deleted_at IS NULL;

-- Users table optimization  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_hash 
    ON users(email) 
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_login 
    ON users(last_login_at DESC) 
    WHERE deleted_at IS NULL;

-- Audit logs optimization (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_timestamp 
                 ON audit_logs(timestamp DESC)';
        EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id 
                 ON audit_logs(user_id, timestamp DESC)';
        EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action 
                 ON audit_logs(action, timestamp DESC)';
    END IF;
END
$$;

-- Sessions table optimization (if exists)  
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_sessions') THEN
        EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expires_at 
                 ON user_sessions(expires_at) WHERE expires_at > NOW()';
        EXECUTE 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_id 
                 ON user_sessions(user_id) WHERE expires_at > NOW()';
    END IF;
END
$$;

\echo 'Indexes created successfully!'

-- =============================================================================
-- QUERY OPTIMIZATION FUNCTIONS
-- =============================================================================

\echo 'Creating optimization functions...'

-- Function to analyze table statistics
CREATE OR REPLACE FUNCTION analyze_table_performance(table_name TEXT)
RETURNS TABLE(
    metric TEXT,
    value TEXT,
    recommendation TEXT
) AS $$
DECLARE
    table_size BIGINT;
    index_usage NUMERIC;
    seq_scans BIGINT;
    index_scans BIGINT;
BEGIN
    -- Get table size
    SELECT pg_total_relation_size(table_name) INTO table_size;
    
    -- Get index usage stats
    SELECT 
        COALESCE(
            ROUND(
                100 * idx_scan / NULLIF(seq_scan + idx_scan, 0), 2
            ), 0
        ),
        seq_scan,
        idx_scan
    INTO index_usage, seq_scans, index_scans
    FROM pg_stat_user_tables 
    WHERE relname = table_name;
    
    -- Return analysis
    RETURN QUERY VALUES 
        ('Table Size', pg_size_pretty(table_size), 
         CASE WHEN table_size > 1073741824 THEN 'Consider partitioning for tables >1GB' 
              ELSE 'Size is optimal' END),
        ('Index Usage %', index_usage::TEXT || '%',
         CASE WHEN index_usage < 50 THEN 'Add indexes for frequently queried columns'
              WHEN index_usage > 95 THEN 'Excellent index usage'
              ELSE 'Good index usage' END),
        ('Sequential Scans', seq_scans::TEXT,
         CASE WHEN seq_scans > 10000 THEN 'High seq scans - review query patterns'
              ELSE 'Sequential scan count is acceptable' END);
END;
$$ LANGUAGE plpgsql;

-- Function to identify slow queries
CREATE OR REPLACE FUNCTION get_slow_queries()
RETURNS TABLE(
    query_text TEXT,
    calls BIGINT,
    total_time NUMERIC,
    mean_time NUMERIC,
    max_time NUMERIC
) AS $$
BEGIN
    -- Enable pg_stat_statements if not already enabled
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    ) THEN
        RAISE NOTICE 'pg_stat_statements extension not found. Creating...';
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not create pg_stat_statements extension: %', SQLERRM;
        END;
    END IF;
    
    -- Return slow query data if extension is available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        RETURN QUERY
        SELECT 
            query,
            calls::BIGINT,
            total_exec_time::NUMERIC,
            mean_exec_time::NUMERIC,
            max_exec_time::NUMERIC
        FROM pg_stat_statements 
        WHERE mean_exec_time > 100 -- queries taking more than 100ms on average
        ORDER BY mean_exec_time DESC
        LIMIT 10;
    ELSE
        RAISE NOTICE 'pg_stat_statements not available - cannot analyze slow queries';
    END IF;
END;
$$ LANGUAGE plpgsql;

\echo 'Optimization functions created!'

-- =============================================================================
-- TABLE STATISTICS UPDATE
-- =============================================================================

\echo 'Updating table statistics...'

-- Analyze all tables for accurate query planning
ANALYZE users;
ANALYZE projects;
ANALYZE elements;

-- Analyze system tables if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        EXECUTE 'ANALYZE audit_logs';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_sessions') THEN
        EXECUTE 'ANALYZE user_sessions';
    END IF;
END
$$;

\echo 'Statistics updated!'

-- =============================================================================
-- PERFORMANCE MONITORING VIEWS
-- =============================================================================

\echo 'Creating performance monitoring views...'

-- View for table performance metrics
CREATE OR REPLACE VIEW v_table_performance AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins,
    n_tup_upd,
    n_tup_del,
    ROUND(100 * idx_scan / NULLIF(seq_scan + idx_scan, 0), 2) AS index_usage_pct
FROM pg_stat_user_tables pst
JOIN pg_tables pt ON pst.relname = pt.tablename
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- View for index usage statistics
CREATE OR REPLACE VIEW v_index_usage AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    CASE 
        WHEN idx_scan = 0 THEN 'Unused - Consider dropping'
        WHEN idx_scan < 100 THEN 'Low usage'
        WHEN idx_scan < 1000 THEN 'Moderate usage'
        ELSE 'High usage'
    END AS usage_category
FROM pg_stat_user_indexes psi
JOIN pg_indexes pi ON psi.indexrelname = pi.indexname
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- View for connection and activity monitoring
CREATE OR REPLACE VIEW v_activity_monitor AS
SELECT 
    pid,
    usename,
    application_name,
    client_addr,
    state,
    EXTRACT(EPOCH FROM (now() - query_start))::INT AS query_duration_seconds,
    EXTRACT(EPOCH FROM (now() - state_change))::INT AS state_duration_seconds,
    LEFT(query, 100) AS query_preview
FROM pg_stat_activity
WHERE state != 'idle'
    AND pid != pg_backend_pid()
ORDER BY query_start;

\echo 'Performance monitoring views created!'

-- =============================================================================
-- OPTIMIZATION VERIFICATION
-- =============================================================================

\echo ''
\echo '✅ OPTIMIZATION VERIFICATION'
\echo '============================'

-- Show index creation results
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Performance analysis for main tables
\echo ''
\echo 'Performance analysis for main tables:'
SELECT * FROM analyze_table_performance('users');
SELECT * FROM analyze_table_performance('projects');  
SELECT * FROM analyze_table_performance('elements');

-- Display slow queries if available
\echo ''
\echo 'Slow query analysis (queries >100ms average):'
SELECT * FROM get_slow_queries();

-- =============================================================================
-- MAINTENANCE RECOMMENDATIONS
-- =============================================================================

\echo ''
\echo '🛠️ ONGOING MAINTENANCE RECOMMENDATIONS'
\echo '======================================'

-- Create maintenance function
CREATE OR REPLACE FUNCTION generate_maintenance_report()
RETURNS TEXT AS $$
DECLARE
    report TEXT := '';
    rec RECORD;
    total_db_size BIGINT;
BEGIN
    report := report || E'# Database Maintenance Report - ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || E'\n\n';
    
    -- Database size summary
    SELECT pg_database_size(current_database()) INTO total_db_size;
    report := report || '## Database Size: ' || pg_size_pretty(total_db_size) || E'\n\n';
    
    -- Table maintenance recommendations
    report := report || E'## Table Maintenance Recommendations:\n\n';
    
    FOR rec IN 
        SELECT tablename, n_dead_tup, n_live_tup,
               ROUND(100 * n_dead_tup::NUMERIC / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
        FROM pg_stat_user_tables 
        WHERE n_dead_tup > 0
        ORDER BY dead_pct DESC
    LOOP
        IF rec.dead_pct > 20 THEN
            report := report || '- **' || rec.tablename || '**: ' || rec.dead_pct || '% dead tuples - VACUUM FULL recommended' || E'\n';
        ELSIF rec.dead_pct > 10 THEN
            report := report || '- **' || rec.tablename || '**: ' || rec.dead_pct || '% dead tuples - VACUUM recommended' || E'\n';
        END IF;
    END LOOP;
    
    -- Index recommendations
    report := report || E'\n## Index Recommendations:\n\n';
    
    FOR rec IN
        SELECT indexname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) as size
        FROM pg_stat_user_indexes
        WHERE idx_scan = 0 AND pg_relation_size(indexrelid) > 1048576 -- unused indexes > 1MB
    LOOP
        report := report || '- **' || rec.indexname || '**: Unused index (' || rec.size || ') - Consider dropping' || E'\n';
    END LOOP;
    
    -- Query performance recommendations
    report := report || E'\n## Query Performance:\n\n';
    
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        FOR rec IN
            SELECT LEFT(query, 80) as query_preview, calls, 
                   ROUND(mean_exec_time::NUMERIC, 2) as avg_time_ms
            FROM pg_stat_statements
            WHERE mean_exec_time > 500
            ORDER BY mean_exec_time DESC
            LIMIT 5
        LOOP
            report := report || '- Slow query (' || rec.avg_time_ms || 'ms avg, ' || rec.calls || ' calls): ' || rec.query_preview || '...' || E'\n';
        END LOOP;
    ELSE
        report := report || '- Enable pg_stat_statements extension for detailed query analysis' || E'\n';
    END IF;
    
    RETURN report;
END;
$$ LANGUAGE plpgsql;

-- Generate and display maintenance report
SELECT generate_maintenance_report();

-- =============================================================================
-- SCHEDULED MAINTENANCE SETUP
-- =============================================================================

\echo ''
\echo '⏰ AUTOMATED MAINTENANCE SETUP'
\echo '=============================='

-- Create automated maintenance function
CREATE OR REPLACE FUNCTION run_maintenance_tasks()
RETURNS TEXT AS $$
DECLARE
    result TEXT := '';
    rec RECORD;
BEGIN
    result := result || 'Maintenance run at ' || now() || E'\n';
    
    -- Update statistics
    ANALYZE;
    result := result || '✅ Statistics updated' || E'\n';
    
    -- Auto-vacuum heavily updated tables
    FOR rec IN 
        SELECT tablename
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 1000 
            AND (n_dead_tup::FLOAT / NULLIF(n_live_tup, 0)) > 0.1
    LOOP
        EXECUTE 'VACUUM ANALYZE ' || rec.tablename;
        result := result || '✅ Vacuumed table: ' || rec.tablename || E'\n';
    END LOOP;
    
    -- Cleanup old sessions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_sessions') THEN
        DELETE FROM user_sessions WHERE expires_at < NOW() - INTERVAL '7 days';
        GET DIAGNOSTICS rec = ROW_COUNT;
        result := result || '✅ Cleaned up ' || rec || ' expired sessions' || E'\n';
    END IF;
    
    -- Cleanup old audit logs (keep 1 year)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '1 year';
        GET DIAGNOSTICS rec = ROW_COUNT;
        result := result || '✅ Cleaned up ' || rec || ' old audit logs' || E'\n';
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

\echo 'Automated maintenance function created!'
\echo ''
\echo '💡 USAGE INSTRUCTIONS'
\echo '===================='
\echo 'To use the optimization features:'
\echo '1. Monitor performance: SELECT * FROM v_table_performance;'
\echo '2. Check index usage: SELECT * FROM v_index_usage;'
\echo '3. View active queries: SELECT * FROM v_activity_monitor;'
\echo '4. Generate maintenance report: SELECT generate_maintenance_report();'
\echo '5. Run maintenance tasks: SELECT run_maintenance_tasks();'
\echo ''
\echo 'Set up regular maintenance with cron:'
\echo 'psql -d ectropy_dev -c "SELECT run_maintenance_tasks();" >> /var/log/db-maintenance.log'
\echo ''
\echo '✅ DATABASE OPTIMIZATION COMPLETED!'

COMMIT;