-- Maple Ridge Commerce Centre — Takt-based voxel status seed
-- Applies takt zone status distribution to existing COARSE cells
-- Project: dc1eaa5b-7553-46ec-92a5-e20762a60c71
-- Run against staging DB via api-gateway container

-- ZONE A: Level 0 North (z: -0.1→1.1, x: -8→0) → COMPLETE
UPDATE voxels
SET status = 'COMPLETE',
    percent_complete = 100,
    level = 'Level 0',
    system = CASE
      WHEN system = 'UNKNOWN' THEN 'STRUCTURAL'
      ELSE system
    END,
    updated_at = NOW()
WHERE project_id = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71'
  AND coord_z BETWEEN -0.1 AND 1.1
  AND coord_x BETWEEN -8.0 AND 0.0;

-- ZONE B: Level 0 South (z: -0.1→1.1, x: 0→8) → COMPLETE
UPDATE voxels
SET status = 'COMPLETE',
    percent_complete = 100,
    level = 'Level 0',
    updated_at = NOW()
WHERE project_id = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71'
  AND coord_z BETWEEN -0.1 AND 1.1
  AND coord_x BETWEEN 0.0 AND 8.0;

-- ZONE C: Level 1 North (z: 1.1→2.1, x: -8→0) → COMPLETE
UPDATE voxels
SET status = 'COMPLETE',
    percent_complete = 100,
    level = 'Level 1',
    updated_at = NOW()
WHERE project_id = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71'
  AND coord_z BETWEEN 1.1 AND 2.1
  AND coord_x BETWEEN -8.0 AND 0.0;

-- ZONE D: Level 1 South (z: 1.1→2.1, x: 0→8) → IN_PROGRESS + 3 BLOCKED at clash zone
UPDATE voxels
SET status = 'IN_PROGRESS',
    percent_complete = 45,
    level = 'Level 1',
    updated_at = NOW()
WHERE project_id = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71'
  AND coord_z BETWEEN 1.1 AND 2.1
  AND coord_x BETWEEN 0.0 AND 8.0;

-- BLOCKED cells at Grid B3 clash zone (x: 1.5→3.5, z: 1.4→1.9)
UPDATE voxels
SET status = 'BLOCKED',
    percent_complete = 0,
    updated_at = NOW()
WHERE project_id = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71'
  AND coord_z BETWEEN 1.4 AND 1.9
  AND coord_x BETWEEN 1.5 AND 3.5
  AND coord_y BETWEEN -2.0 AND 2.0;

-- ZONE E: Level 2 North (z: 2.1→3.1, x: -8→0) → PLANNED
UPDATE voxels
SET status = 'PLANNED',
    percent_complete = 0,
    level = 'Level 2',
    updated_at = NOW()
WHERE project_id = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71'
  AND coord_z BETWEEN 2.1 AND 3.1
  AND coord_x BETWEEN -8.0 AND 0.0;

-- ZONE F: Level 2 South (z: 2.1→3.1, x: 0→8) → PLANNED
UPDATE voxels
SET status = 'PLANNED',
    percent_complete = 0,
    level = 'Level 2',
    updated_at = NOW()
WHERE project_id = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71'
  AND coord_z BETWEEN 2.1 AND 3.1
  AND coord_x BETWEEN 0.0 AND 8.0;

-- Verify distribution
SELECT status, level, COUNT(*) as cell_count
FROM voxels
WHERE project_id = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71'
GROUP BY status, level
ORDER BY level, status;
