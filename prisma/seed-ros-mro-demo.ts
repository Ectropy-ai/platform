/**
 * ROS MRO Demo Seed Data
 *
 * Seeds voxels, decisions, and activity data for the ROS MRO coordination view demo.
 * Creates a realistic construction site with synthetic data matching the
 * demo-scenarios building profiles and decision templates.
 *
 * Usage: npx ts-node prisma/seed-ros-mro-demo.ts
 *
 * @module prisma/seed-ros-mro-demo
 */

import { Pool } from 'pg';

// ============================================================================
// CONFIGURATION
// ============================================================================

type BuildingType = 'office' | 'house' | 'duplex' | 'commercial';

const BUILDING_PROFILES: Record<BuildingType, {
  levels: { name: string; height: number; zones: string[] }[];
  systems: string[];
  voxelDensity: number;
}> = {
  office: {
    levels: [
      { name: 'Foundation', height: 0, zones: ['Core', 'Perimeter'] },
      { name: 'Lobby', height: 4.5, zones: ['Core', 'Entry', 'Retail'] },
      { name: 'Floor 2', height: 8.5, zones: ['Core', 'Open Office', 'Meeting'] },
      { name: 'Floor 3', height: 12.5, zones: ['Core', 'Open Office', 'Executive'] },
      { name: 'Mechanical', height: 16.5, zones: ['HVAC', 'Electrical'] },
    ],
    systems: ['STRUCT', 'MECH', 'ELEC', 'PLUMB', 'HVAC', 'FIRE'],
    voxelDensity: 15,
  },
  house: {
    levels: [
      { name: 'Foundation', height: 0, zones: ['Slab'] },
      { name: 'Ground Floor', height: 0.3, zones: ['Living', 'Kitchen', 'Garage'] },
      { name: 'Upper Floor', height: 3.3, zones: ['Master', 'Bedroom', 'Bath'] },
    ],
    systems: ['STRUCT', 'ELEC', 'PLUMB'],
    voxelDensity: 8,
  },
  duplex: {
    levels: [
      { name: 'Foundation', height: 0, zones: ['Slab', 'Party Wall'] },
      { name: 'Ground Floor', height: 0.3, zones: ['Unit A', 'Unit B'] },
      { name: 'Upper Floor', height: 3.3, zones: ['Unit A', 'Unit B'] },
    ],
    systems: ['STRUCT', 'ELEC', 'PLUMB', 'FIRE'],
    voxelDensity: 10,
  },
  commercial: {
    levels: [
      { name: 'Foundation', height: 0, zones: ['Slab'] },
      { name: 'Warehouse', height: 0.3, zones: ['Storage', 'Mezzanine', 'Loading'] },
      { name: 'Office', height: 6, zones: ['Admin', 'Break'] },
    ],
    systems: ['STRUCT', 'MECH', 'ELEC', 'FIRE'],
    voxelDensity: 12,
  },
};

const DECISION_TEMPLATES = [
  { type: 'RFI', prefix: 'Request for Information' },
  { type: 'CHANGE_ORDER', prefix: 'Change Order' },
  { type: 'VARIANCE', prefix: 'Variance Request' },
  { type: 'HOLD', prefix: 'Work Hold' },
  { type: 'APPROVAL', prefix: 'Approval Required' },
];

const DECISION_SUBJECTS = [
  'MEP Coordination',
  'Structural Support',
  'Fire Protection',
  'HVAC Routing',
  'Electrical Panel',
  'Plumbing Layout',
  'Foundation Detail',
  'Wall Assembly',
  'Ceiling Height',
  'Door Hardware',
];

const STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED', 'ON_HOLD'] as const;
const HEALTH_STATUSES = ['HEALTHY', 'AT_RISK', 'CRITICAL'] as const;

// Status distribution for realistic demo
const STATUS_WEIGHTS = {
  PLANNED: 30,
  IN_PROGRESS: 35,
  COMPLETE: 25,
  BLOCKED: 5,
  ON_HOLD: 5,
};

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/ectropy';
  return new Pool({ connectionString });
}

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

/**
 * Get or create demo project
 */
async function getOrCreateDemoProject(pool: Pool, buildingType: BuildingType): Promise<string> {
  const projectName = `ROS MRO Demo - ${buildingType.charAt(0).toUpperCase() + buildingType.slice(1)} Building`;

  const existing = await pool.query(`
    SELECT id FROM projects WHERE name = $1 LIMIT 1
  `, [projectName]);

  if (existing.rows.length > 0) {
    console.log('  Found existing demo project:', existing.rows[0].id);
    return existing.rows[0].id;
  }

  const result = await pool.query(`
    INSERT INTO projects (name, description, created_at, updated_at)
    VALUES ($1, $2, NOW(), NOW())
    RETURNING id
  `, [
    projectName,
    `Demo project for ROS MRO coordination view - ${buildingType} building profile`,
  ]);

  console.log('  Created demo project:', result.rows[0].id);
  return result.rows[0].id;
}

/**
 * Pick weighted random status
 */
function pickWeightedStatus(): typeof STATUSES[number] {
  const total = Object.values(STATUS_WEIGHTS).reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;

  for (const [status, weight] of Object.entries(STATUS_WEIGHTS)) {
    rand -= weight;
    if (rand <= 0) {
      return status as typeof STATUSES[number];
    }
  }
  return 'PLANNED';
}

/**
 * Calculate health status from voxel status
 */
function calculateHealthStatus(status: string): typeof HEALTH_STATUSES[number] {
  if (status === 'BLOCKED') {
    return Math.random() > 0.5 ? 'CRITICAL' : 'AT_RISK';
  }
  if (status === 'ON_HOLD') {
    return 'AT_RISK';
  }
  return 'HEALTHY';
}

/**
 * Seed voxels based on building profile
 */
async function seedVoxels(pool: Pool, projectId: string, buildingType: BuildingType): Promise<string[]> {
  console.log(`\n  Generating voxels for ${buildingType} building...`);

  // Clear existing voxels for this project
  await pool.query(`DELETE FROM voxels WHERE project_id = $1`, [projectId]);

  const profile = BUILDING_PROFILES[buildingType];
  const voxelIds: string[] = [];
  let index = 0;
  const resolution = 2.0; // 2m voxels

  for (const level of profile.levels) {
    for (const zone of level.zones) {
      // Create voxels per zone
      const voxelCount = Math.floor(profile.voxelDensity * (0.8 + Math.random() * 0.4));

      for (let v = 0; v < voxelCount; v++) {
        const system = profile.systems[Math.floor(Math.random() * profile.systems.length)];
        const status = pickWeightedStatus();
        const healthStatus = calculateHealthStatus(status);

        // Calculate coordinates within zone
        const x = (v % 5) * resolution + resolution / 2;
        const y = Math.floor(v / 5) * resolution + resolution / 2;
        const z = level.height + resolution / 2;
        const halfSize = resolution / 2;

        // Calculate percent complete
        let percentComplete: number | null = null;
        if (status === 'COMPLETE') {
          percentComplete = 100;
        } else if (status === 'IN_PROGRESS') {
          percentComplete = Math.floor(Math.random() * 70) + 10;
        } else if (status === 'PLANNED') {
          percentComplete = 0;
        }

        const voxelId = `VOX-${buildingType.toUpperCase().slice(0, 3)}-${level.name.replace(/\s/g, '')}-${String(index).padStart(3, '0')}`;
        const urn = `urn:ectropy:${projectId}:voxel:${voxelId}`;

        const result = await pool.query(`
          INSERT INTO voxels (
            project_id, voxel_id, urn, status, health_status,
            coord_x, coord_y, coord_z, resolution,
            min_x, max_x, min_y, max_y, min_z, max_z,
            building, level, zone, system,
            current_phase, percent_complete, decision_count,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22,
            NOW(), NOW()
          )
          RETURNING id
        `, [
          projectId,
          voxelId,
          urn,
          status,
          healthStatus,
          x, y, z, resolution,
          x - halfSize, x + halfSize,
          y - halfSize, y + halfSize,
          z - halfSize, z + halfSize,
          buildingType.charAt(0).toUpperCase() + buildingType.slice(1),
          level.name,
          zone,
          system,
          status === 'IN_PROGRESS' ? 'Installation' : status === 'COMPLETE' ? 'Complete' : 'Planning',
          percentComplete,
          Math.floor(Math.random() * 3),
        ]);

        voxelIds.push(result.rows[0].id);
        index++;
      }
    }
  }

  console.log(`    Created ${voxelIds.length} voxels`);
  return voxelIds;
}

/**
 * Seed decisions
 */
async function seedDecisions(pool: Pool, projectId: string, voxelIds: string[]): Promise<void> {
  console.log('\n  Seeding decisions...');

  await pool.query(`DELETE FROM pm_decisions WHERE project_id = $1`, [projectId]);

  const decisionStatuses = ['OPEN', 'PENDING', 'APPROVED', 'REJECTED', 'CLOSED'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const decisionCount = Math.floor(voxelIds.length * 0.3);

  for (let i = 0; i < decisionCount; i++) {
    const voxelId = voxelIds[Math.floor(Math.random() * voxelIds.length)];
    const template = DECISION_TEMPLATES[Math.floor(Math.random() * DECISION_TEMPLATES.length)];
    const subject = DECISION_SUBJECTS[Math.floor(Math.random() * DECISION_SUBJECTS.length)];
    const status = decisionStatuses[Math.floor(Math.random() * decisionStatuses.length)];
    const priority = priorities[Math.floor(Math.random() * priorities.length)];

    const decisionId = `DEC-${String(i + 1).padStart(4, '0')}`;
    const urn = `urn:ectropy:${projectId}:decision:${decisionId}`;

    await pool.query(`
      INSERT INTO pm_decisions (
        project_id, voxel_id, decision_id, urn, title, description,
        decision_type, status, priority, authority_required,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        NOW() - ($11 || ' days')::interval, NOW()
      )
    `, [
      projectId,
      voxelId,
      decisionId,
      urn,
      `${template.prefix} - ${subject}`,
      `${template.type} decision for ${subject.toLowerCase()} coordination.`,
      template.type,
      status,
      priority,
      Math.floor(Math.random() * 4) + 1,
      Math.floor(Math.random() * 30),
    ]);
  }

  // Update voxel decision counts
  await pool.query(`
    UPDATE voxels SET decision_count = (
      SELECT COUNT(*) FROM pm_decisions WHERE pm_decisions.voxel_id = voxels.id
    ) WHERE project_id = $1
  `, [projectId]);

  console.log(`    Created ${decisionCount} decisions`);
}

/**
 * Seed status history
 */
async function seedStatusHistory(pool: Pool, projectId: string, voxelIds: string[]): Promise<void> {
  console.log('\n  Seeding status history...');

  await pool.query(`
    DELETE FROM voxel_status_history WHERE voxel_id = ANY($1)
  `, [voxelIds]);

  const statuses = ['PLANNED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED', 'ON_HOLD'];
  const sources = ['API', 'WEB', 'MOBILE'];
  const names = ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Wilson', 'Tom Brown'];

  const historyVoxels = voxelIds.filter(() => Math.random() < 0.4);
  let historyCount = 0;

  for (const voxelId of historyVoxels) {
    const voxel = await pool.query(`SELECT status, health_status FROM voxels WHERE id = $1`, [voxelId]);
    if (voxel.rows.length === 0) continue;

    const currentStatus = voxel.rows[0].status;
    const entries = Math.floor(Math.random() * 3) + 1;

    let prevStatus = 'PLANNED';
    for (let i = 0; i < entries; i++) {
      const nextStatus = i === entries - 1 ? currentStatus : statuses[Math.floor(Math.random() * 4)];

      await pool.query(`
        INSERT INTO voxel_status_history (
          voxel_id, previous_status, new_status, previous_health, new_health,
          percent_complete, note, changed_by_name, source, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          NOW() - ($10 || ' hours')::interval
        )
      `, [
        voxelId,
        prevStatus,
        nextStatus,
        'HEALTHY',
        nextStatus === 'BLOCKED' ? 'AT_RISK' : 'HEALTHY',
        nextStatus === 'COMPLETE' ? 100 : Math.floor(Math.random() * 80),
        `Status updated to ${nextStatus}`,
        names[Math.floor(Math.random() * names.length)],
        sources[Math.floor(Math.random() * sources.length)],
        (entries - i) * 24 + Math.floor(Math.random() * 24),
      ]);

      prevStatus = nextStatus;
      historyCount++;
    }
  }

  console.log(`    Created ${historyCount} history entries`);
}

/**
 * Seed activity log
 */
async function seedActivityLog(pool: Pool, projectId: string, voxelIds: string[]): Promise<void> {
  console.log('\n  Seeding activity log...');

  await pool.query(`
    DELETE FROM audit_log WHERE project_id = $1 AND entity_type = 'voxel'
  `, [projectId]);

  const actions = [
    { type: 'status_change', message: 'Status changed', severity: 'info' },
    { type: 'decision_attached', message: 'Decision attached', severity: 'warning' },
    { type: 'inspection_completed', message: 'Inspection completed', severity: 'success' },
    { type: 'issue_detected', message: 'Coordination issue detected', severity: 'error' },
    { type: 'progress_updated', message: 'Progress updated', severity: 'info' },
  ];

  const activityCount = Math.floor(Math.random() * 15) + 20;

  for (let i = 0; i < activityCount; i++) {
    const voxelId = voxelIds[Math.floor(Math.random() * voxelIds.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];

    await pool.query(`
      INSERT INTO audit_log (
        project_id, entity_type, entity_id, action, details, timestamp
      ) VALUES (
        $1, 'voxel', $2, $3, $4,
        NOW() - ($5 || ' minutes')::interval
      )
    `, [
      projectId,
      voxelId,
      action.type,
      JSON.stringify({ message: action.message, severity: action.severity }),
      i * 10 + Math.floor(Math.random() * 10),
    ]);
  }

  console.log(`    Created ${activityCount} activity entries`);
}

/**
 * Grant project access
 */
async function grantProjectAccess(pool: Pool, projectId: string): Promise<void> {
  console.log('\n  Granting project access...');

  const users = await pool.query(`SELECT id FROM users LIMIT 10`);

  for (const user of users.rows) {
    const existing = await pool.query(`
      SELECT id FROM project_roles WHERE user_id = $1 AND project_id = $2
    `, [user.id, projectId]);

    if (existing.rows.length === 0) {
      await pool.query(`
        INSERT INTO project_roles (user_id, project_id, role, is_active, created_at, updated_at)
        VALUES ($1, $2, 'CONTRACTOR', true, NOW(), NOW())
      `, [user.id, projectId]);
    }
  }

  console.log(`    Granted access to ${users.rows.length} users`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Get building type from command line or default to office
  const buildingType = (process.argv[2] as BuildingType) || 'office';

  if (!BUILDING_PROFILES[buildingType]) {
    console.error(`Invalid building type: ${buildingType}`);
    console.error(`Valid types: ${Object.keys(BUILDING_PROFILES).join(', ')}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('ROS MRO Demo Data Seeding');
  console.log(`Building Type: ${buildingType}`);
  console.log('='.repeat(60));

  const pool = getPool();

  try {
    console.log('\n1. Setting up demo project...');
    const projectId = await getOrCreateDemoProject(pool, buildingType);

    console.log('\n2. Generating voxels...');
    const voxelIds = await seedVoxels(pool, projectId, buildingType);

    console.log('\n3. Generating decisions...');
    await seedDecisions(pool, projectId, voxelIds);

    console.log('\n4. Seeding status history...');
    await seedStatusHistory(pool, projectId, voxelIds);

    console.log('\n5. Seeding activity log...');
    await seedActivityLog(pool, projectId, voxelIds);

    console.log('\n6. Granting project access...');
    await grantProjectAccess(pool, projectId);

    console.log('\n' + '='.repeat(60));
    console.log('Seeding complete!');
    console.log(`Project ID: ${projectId}`);
    console.log(`Voxels created: ${voxelIds.length}`);
    console.log(`Building type: ${buildingType}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
