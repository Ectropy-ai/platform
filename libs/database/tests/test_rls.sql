-- Test Cases: Row-Level Security (RLS)
-- Validates that RLS policies enforce project and element-level access

\echo '=== Testing Row-Level Security ==='

-- Test 1: Set user context for architect (should only see elements they have access to)
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000102', true);

-- Test 2: Query elements as architect (should only return Demo Wall, not Demo Column)
SELECT 
    id, 
    element_name, 
    element_type,
    'architect access' as access_level
FROM construction_elements 
WHERE project_id = '00000000-0000-0000-0000-000000001001'
ORDER BY element_name;

-- Test 3: Set user context for owner (should see all elements in project)
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000101', true);

-- Test 4: Query elements as owner (should return all elements)
SELECT 
    id, 
    element_name, 
    element_type,
    'owner access' as access_level
FROM construction_elements 
WHERE project_id = '00000000-0000-0000-0000-000000001001'
ORDER BY element_name;

-- Test 5: Set user context for contractor 
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000103', true);

-- Test 6: Query elements as contractor (should see both elements)
SELECT 
    id, 
    element_name, 
    element_type,
    'contractor access' as access_level
FROM construction_elements 
WHERE project_id = '00000000-0000-0000-0000-000000001001'
ORDER BY element_name;

-- Test 7: Try to access KPIs (should be restricted by RLS)
SELECT 
    kpi_name, 
    target_value, 
    actual_value,
    'KPI access test' as test_type
FROM project_kpis 
WHERE project_id = '00000000-0000-0000-0000-000000001001'
ORDER BY kpi_name;

\echo '=== Row-Level Security Tests Complete ==='
