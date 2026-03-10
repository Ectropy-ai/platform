-- Access Control Utility Functions for Federated Construction Platform
-- This file contains reusable PL/pgSQL functions for element-level and field-level access control.
-- All functions are documented for maintainability and future extension.

-- Function: check_element_field_access
-- Checks if a user has access to a specific field of a construction element for a given operation
CREATE OR REPLACE FUNCTION check_element_field_access(
    user_id UUID,
    element_id UUID,
    op access_operation,
    field_name TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    perms JSONB;
    role_names TEXT[];
    allowed_roles TEXT[];
    has_permission BOOLEAN := FALSE;
BEGIN
    SELECT access_control FROM construction_elements WHERE id = element_id INTO perms;
    IF perms IS NULL THEN RETURN FALSE; END IF;
    SELECT ARRAY_AGG(role_name) FROM project_roles WHERE user_id = user_id AND project_id = (SELECT project_id FROM construction_elements WHERE id = element_id) AND is_active = TRUE INTO role_names;
    IF role_names IS NULL THEN RETURN FALSE; END IF;
    -- Get allowed roles for the field and operation
    allowed_roles := ARRAY(SELECT jsonb_array_elements_text(perms->'field_permissions'->field_name->(op::text || '_roles')));
    IF allowed_roles IS NULL OR array_length(allowed_roles, 1) = 0 THEN
        -- Fallback to element-level roles if no field-level override
        allowed_roles := ARRAY(SELECT jsonb_array_elements_text(perms->(op::text || '_roles')));
    END IF;
    has_permission := EXISTS (
        SELECT 1 FROM unnest(allowed_roles) AS allowed_role
        WHERE allowed_role = ANY(role_names)
    );
    RETURN has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Usage Example:
-- SELECT check_element_field_access('<user-uuid>', '<element-uuid>', 'read', 'properties');

-- Function: get_accessible_elements
-- Returns a set of element IDs the user can access for a given operation in a project
CREATE OR REPLACE FUNCTION get_accessible_elements(
    user_id UUID,
    project_id UUID,
    op access_operation
) RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY
    SELECT id FROM construction_elements
    WHERE project_id = project_id
      AND check_element_access(user_id, id, op);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: update_element_with_permissions
-- Updates an element if the user has the required permission
-- (This is a stub for use in application logic or triggers)
-- Add more logic as needed for field-level updates

-- All access control logic is centralized here for maintainability.
-- See core_schema.sql for RLS integration and usage patterns.
