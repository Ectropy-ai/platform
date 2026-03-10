-- Test Cases: Audit Logging
-- Validates that all changes are logged in audit_log

\echo '=== Testing Audit Logging ==='

-- Test 1: Insert a new element (should trigger audit)
INSERT INTO construction_elements (
    id, 
    project_id, 
    element_name, 
    element_type, 
    properties, 
    access_control, 
    created_by
) VALUES (
    '00000000-0000-0000-0000-000000010003', 
    '00000000-0000-0000-0000-000000001001', 
    'Test Audit Element', 
    'beam', 
    '{"material":"steel", "grade": "S355"}', 
    '{"read_roles":["OWNER"], "write_roles":["OWNER"], "admin_roles":["OWNER"]}', 
    '00000000-0000-0000-0000-000000000101'
);

-- Test 2: Update the element (should trigger audit)
UPDATE construction_elements 
SET properties = '{"material":"concrete", "grade": "C30"}' 
WHERE id = '00000000-0000-0000-0000-000000010003';

-- Test 3: Check audit log entries for INSERT operation
SELECT 
    table_name,
    record_id,
    operation,
    CASE 
        WHEN new_values IS NOT NULL THEN 'INSERT recorded'
        ELSE 'INSERT not recorded'
    END as insert_status
FROM audit_log 
WHERE record_id = '00000000-0000-0000-0000-000000010003' 
    AND operation = 'INSERT';

-- Test 4: Check audit log entries for UPDATE operation
SELECT 
    table_name,
    record_id,
    operation,
    CASE 
        WHEN old_values IS NOT NULL AND new_values IS NOT NULL THEN 'UPDATE recorded'
        ELSE 'UPDATE not recorded'
    END as update_status
FROM audit_log 
WHERE record_id = '00000000-0000-0000-0000-000000010003' 
    AND operation = 'UPDATE';

-- Test 5: Delete the element (should trigger audit)
DELETE FROM construction_elements WHERE id = '00000000-0000-0000-0000-000000010003';

-- Test 6: Check audit log entries for DELETE operation
SELECT 
    table_name,
    record_id,
    operation,
    CASE 
        WHEN old_values IS NOT NULL THEN 'DELETE recorded'
        ELSE 'DELETE not recorded'
    END as delete_status
FROM audit_log 
WHERE record_id = '00000000-0000-0000-0000-000000010003' 
    AND operation = 'DELETE';

-- Test 7: Count total audit entries for the test element
SELECT COUNT(*) as total_audit_entries
FROM audit_log 
WHERE record_id = '00000000-0000-0000-0000-000000010003';

\echo '=== Audit Logging Tests Complete ==='
