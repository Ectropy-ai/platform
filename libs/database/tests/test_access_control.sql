-- Test Cases: Access Control Functions
-- Validates element-level and field-level permissions

\echo '=== Testing Access Control Functions ==='

-- Test 1: Owner user should have read access to Demo Wall
SELECT check_element_access(
    ARRAY['OWNER'], 
    '00000000-0000-0000-0000-000000010001'::UUID, 
    'read'
) AS owner_can_read_wall;

-- Test 2: Owner user should have write access to Demo Wall
SELECT check_element_access(
    ARRAY['OWNER'], 
    '00000000-0000-0000-0000-000000010001'::UUID, 
    'write'
) AS owner_can_write_wall;

-- Test 3: Owner user should have admin access to Demo Wall
SELECT check_element_access(
    ARRAY['OWNER'], 
    '00000000-0000-0000-0000-000000010001'::UUID, 
    'admin'
) AS owner_can_admin_wall;

-- Test 4: Architect user should have read access to Demo Wall
SELECT check_element_access(
    ARRAY['ARCHITECT'], 
    '00000000-0000-0000-0000-000000010001'::UUID, 
    'read'
) AS architect_can_read_wall;

-- Test 5: Architect user should NOT have write access to Demo Wall
SELECT check_element_access(
    ARRAY['ARCHITECT'], 
    '00000000-0000-0000-0000-000000010001'::UUID, 
    'write'
) AS architect_can_write_wall;

-- Test 6: Contractor user should have read access to Demo Wall
SELECT check_element_access(
    ARRAY['CONTRACTOR'], 
    '00000000-0000-0000-0000-000000010001'::UUID, 
    'read'
) AS contractor_can_read_wall;

-- Test 7: Contractor user should have write access to Demo Wall
SELECT check_element_access(
    ARRAY['CONTRACTOR'], 
    '00000000-0000-0000-0000-000000010001'::UUID, 
    'write'
) AS contractor_can_write_wall;

-- Test 8: Contractor user should NOT have admin access to Demo Wall
SELECT check_element_access(
    ARRAY['CONTRACTOR'], 
    '00000000-0000-0000-0000-000000010001'::UUID, 
    'admin'
) AS contractor_can_admin_wall;

-- Test 9: Architect should NOT have read access to Demo Column (restricted access)
SELECT check_element_access(
    ARRAY['ARCHITECT'], 
    '00000000-0000-0000-0000-000000010002'::UUID, 
    'read'
) AS architect_can_read_column;

-- Test 10: Contractor should have read access to Demo Column
SELECT check_element_access(
    ARRAY['CONTRACTOR'], 
    '00000000-0000-0000-0000-000000010002'::UUID, 
    'read'
) AS contractor_can_read_column;

\echo '=== Access Control Tests Complete ==='
