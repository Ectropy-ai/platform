-- Audit Triggers for Federated Construction Platform
-- Automatically logs all changes to core tables in the audit_log table
-- Ensures compliance, traceability, and immutability

-- Trigger function for audit logging
CREATE OR REPLACE FUNCTION audit_log_trigger() RETURNS TRIGGER AS $$
DECLARE
    user_id UUID := current_setting('app.user_id', true)::uuid;
    session_id TEXT := current_setting('app.session_id', true);
    ip_address INET := inet_client_addr();
    user_agent TEXT := current_setting('app.user_agent', true);
    changed_fields TEXT[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (
            user_id, action, target_table, target_id, details, operation, new_values, changed_fields, session_id, ip_address, user_agent, created_at
        ) VALUES (
            user_id, 'INSERT', TG_TABLE_NAME, NEW.id, NULL, 'insert', row_to_json(NEW), NULL, session_id, ip_address, user_agent, NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT array_agg(col) FROM (
            SELECT column_name AS col
            FROM information_schema.columns
            WHERE table_name = TG_TABLE_NAME
              AND (NEW.*)::jsonb -> column_name IS DISTINCT FROM (OLD.*)::jsonb -> column_name
        ) sub INTO changed_fields;
        INSERT INTO audit_log (
            user_id, action, target_table, target_id, details, operation, old_values, new_values, changed_fields, session_id, ip_address, user_agent, created_at
        ) VALUES (
            user_id, 'UPDATE', TG_TABLE_NAME, NEW.id, NULL, 'update', row_to_json(OLD), row_to_json(NEW), changed_fields, session_id, ip_address, user_agent, NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (
            user_id, action, target_table, target_id, details, operation, old_values, changed_fields, session_id, ip_address, user_agent, created_at
        ) VALUES (
            user_id, 'DELETE', TG_TABLE_NAME, OLD.id, NULL, 'delete', row_to_json(OLD), NULL, session_id, ip_address, user_agent, NOW()
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit triggers to core tables
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_projects') THEN
        CREATE TRIGGER audit_projects AFTER INSERT OR UPDATE OR DELETE ON projects
            FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_users') THEN
        CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
            FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_project_roles') THEN
        CREATE TRIGGER audit_project_roles AFTER INSERT OR UPDATE OR DELETE ON project_roles
            FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_elements') THEN
        CREATE TRIGGER audit_elements AFTER INSERT OR UPDATE OR DELETE ON construction_elements
            FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_element_docs') THEN
        CREATE TRIGGER audit_element_docs AFTER INSERT OR UPDATE OR DELETE ON element_documents
            FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_element_rels') THEN
        CREATE TRIGGER audit_element_rels AFTER INSERT OR UPDATE OR DELETE ON element_relationships
            FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
    END IF;
END $$;

-- All audit logic is centralized here for maintainability and compliance.
-- See core_schema.sql for audit_log table definition.
