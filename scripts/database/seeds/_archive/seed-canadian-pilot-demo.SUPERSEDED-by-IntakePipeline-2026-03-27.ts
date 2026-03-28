/**
 * Clean PostgreSQL Seed — Canadian Pilot Demo
 *
 * Seeds the demo project (dc1eaa5b-7553-46ec-92a5-e20762a60c71) with
 * 4 voxels, 8 decisions, and 2 inspections. PostgreSQL only — no filesystem
 * writes. Implements DEC-003 single-store architecture.
 *
 * Usage:
 *   npx ts-node scripts/database/seeds/seed-canadian-pilot-demo.ts
 *   npx ts-node scripts/database/seeds/seed-canadian-pilot-demo.ts --dry-run
 *
 * Idempotent: Existing rows are skipped (Prisma P2002 unique constraint catch).
 * Safe to run multiple times — no data is overwritten.
 *
 * Prerequisites:
 *   - authority_levels table must be seeded (run seed-decision-lifecycle.ts first)
 *   - Demo project must exist (run create-demo-projects.ts first)
 *   - DATABASE_URL environment variable must be set
 *
 * @module scripts/database/seeds/seed-canadian-pilot-demo
 */

import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ID = 'dc1eaa5b-7553-46ec-92a5-e20762a60c71';
// Prisma client — only instantiated for live runs (dry-run skips DB)
let prisma: PrismaClient;

/** Build a URN from type and identifier (all lowercase, full project UUID for buildURN compat) */
function urn(nodeType: string, identifier: string): string {
  return `urn:luhtech:${PROJECT_ID}:${nodeType}:${identifier.toLowerCase()}`;
}

// ============================================================================
// Voxel Data (4 rows)
// ============================================================================

const VOXELS = [
  {
    urn: urn('voxel', 'VOX-L3-HVAC-001'),
    project_id: PROJECT_ID,
    voxel_id: 'VOX-L3-HVAC-001',
    status: 'BLOCKED' as const,
    health_status: 'CRITICAL' as const,
    coord_x: 12.5, coord_y: 8.2, coord_z: 10.8, resolution: 1.0,
    min_x: 12.0, max_x: 13.0, min_y: 7.7, max_y: 8.7, min_z: 10.3, max_z: 11.3,
    building: 'Main', level: 'Level 3', zone: 'B3', system: 'HVAC',
    estimated_cost: 42000.00, estimated_hours: 120,
    planned_start: new Date('2026-03-10T08:00:00Z'),
    planned_end: new Date('2026-03-24T17:00:00Z'),
    actual_start: new Date('2026-03-10T08:00:00Z'),
    graph_metadata: { inEdges: [], outEdges: [] },
    meta: { seededBy: 'seed-canadian-pilot-demo' },
  },
  {
    urn: urn('voxel', 'VOX-L2-ELEC-014'),
    project_id: PROJECT_ID,
    voxel_id: 'VOX-L2-ELEC-014',
    status: 'IN_PROGRESS' as const,
    health_status: 'AT_RISK' as const,
    coord_x: 7.1, coord_y: 14.3, coord_z: 7.2, resolution: 1.0,
    min_x: 6.6, max_x: 7.6, min_y: 13.8, max_y: 14.8, min_z: 6.7, max_z: 7.7,
    building: 'Main', level: 'Level 2', zone: 'South', system: 'Electrical',
    estimated_cost: 18500.00, actual_cost: 9200.00,
    estimated_hours: 85, actual_hours: 38,
    planned_start: new Date('2026-03-08T08:00:00Z'),
    planned_end: new Date('2026-03-20T17:00:00Z'),
    actual_start: new Date('2026-03-08T08:00:00Z'),
    graph_metadata: { inEdges: [], outEdges: [] },
    meta: { seededBy: 'seed-canadian-pilot-demo' },
  },
  {
    urn: urn('voxel', 'VOX-L1-MECH-007'),
    project_id: PROJECT_ID,
    voxel_id: 'VOX-L1-MECH-007',
    status: 'IN_PROGRESS' as const,
    health_status: 'HEALTHY' as const,
    coord_x: 3.4, coord_y: 6.1, coord_z: 3.6, resolution: 1.0,
    min_x: 2.9, max_x: 3.9, min_y: 5.6, max_y: 6.6, min_z: 3.1, max_z: 4.1,
    building: 'Main', level: 'Level 1', zone: 'North', system: 'Mechanical',
    estimated_cost: 31000.00, actual_cost: 14800.00,
    estimated_hours: 160, actual_hours: 72,
    planned_start: new Date('2026-03-05T08:00:00Z'),
    planned_end: new Date('2026-03-28T17:00:00Z'),
    actual_start: new Date('2026-03-05T08:00:00Z'),
    graph_metadata: { inEdges: [], outEdges: [] },
    meta: { seededBy: 'seed-canadian-pilot-demo' },
  },
  {
    urn: urn('voxel', 'VOX-RF-STRUCT-003'),
    project_id: PROJECT_ID,
    voxel_id: 'VOX-RF-STRUCT-003',
    status: 'COMPLETE' as const,
    health_status: 'HEALTHY' as const,
    coord_x: 15.0, coord_y: 10.0, coord_z: 14.4, resolution: 2.0,
    min_x: 14.0, max_x: 16.0, min_y: 9.0, max_y: 11.0, min_z: 13.4, max_z: 15.4,
    building: 'Main', level: 'Roof', zone: 'North', system: 'Structural',
    estimated_cost: 95000.00, actual_cost: 97200.00,
    estimated_hours: 320, actual_hours: 334,
    planned_start: new Date('2026-02-15T08:00:00Z'),
    planned_end: new Date('2026-03-08T17:00:00Z'),
    actual_start: new Date('2026-02-15T08:00:00Z'),
    actual_end: new Date('2026-03-09T14:00:00Z'),
    graph_metadata: { inEdges: [], outEdges: [] },
    meta: { seededBy: 'seed-canadian-pilot-demo' },
  },
];

// ============================================================================
// Decision Data (8 rows) — authority_level_id resolved at runtime
// ============================================================================

interface DecisionSeed {
  decisionId: string;
  type: 'ESCALATION' | 'APPROVAL' | 'PROPOSAL' | 'DEFERRAL';
  status: 'PENDING' | 'APPROVED';
  authorityRequired: number;
  authorityCurrent: number;
  primaryVoxelUrn: string | null;
  title: string;
  description: string;
  budgetEstimated: number;
  delayDays: number;
}

const DECISIONS: DecisionSeed[] = [
  {
    decisionId: 'DEC-2026-0001',
    type: 'ESCALATION', status: 'PENDING',
    authorityRequired: 3, authorityCurrent: 2,
    primaryVoxelUrn: urn('voxel', 'VOX-L3-HVAC-001'),
    title: 'HVAC Duct Routing Conflict — Grid B3 Level 3',
    description: 'HVAC supply duct (24"x16") conflicts with W8x31 structural beam at grid B3, Level 3. Contractor stopped work pending PM decision. Budget exposure: $45,000 reroute, $8,500 sleeve.',
    budgetEstimated: 45000.00, delayDays: 5,
  },
  {
    decisionId: 'DEC-2026-0002',
    type: 'APPROVAL', status: 'APPROVED',
    authorityRequired: 4, authorityCurrent: 4,
    primaryVoxelUrn: urn('voxel', 'VOX-L3-HVAC-001'),
    title: 'W8x31 Beam Penetration — Mechanical Sleeve Approved',
    description: 'Structural engineer approved 8" mechanical sleeve at W8x31 grid B3 per detail S-214. Web penetration 18" from nearest weld. No reinforcement required. Engineer of record signed off 2026-03-13.',
    budgetEstimated: 8500.00, delayDays: 0,
  },
  {
    decisionId: 'DEC-2026-0003',
    type: 'PROPOSAL', status: 'PENDING',
    authorityRequired: 2, authorityCurrent: 1,
    primaryVoxelUrn: urn('voxel', 'VOX-L2-ELEC-014'),
    title: 'Electrical Panel Relocation — Level 2 South Wing',
    description: 'Panel LP-2S conflicts with egress corridor width (44" clear). 36" west relocation proposed. Under inspection hold INSP-2026-0001.',
    budgetEstimated: 12200.00, delayDays: 2,
  },
  {
    decisionId: 'DEC-2026-0004',
    type: 'DEFERRAL', status: 'APPROVED',
    authorityRequired: 3, authorityCurrent: 3,
    primaryVoxelUrn: null,
    title: 'Level 2 Concrete Pour — 3-Day Schedule Adjustment',
    description: 'Pour deferred 3 days, forecast freezing temperatures. PM approved per contract clause 8.3.2. No budget impact.',
    budgetEstimated: 0, delayDays: 3,
  },
  {
    decisionId: 'DEC-2026-0005',
    type: 'APPROVAL', status: 'APPROVED',
    authorityRequired: 1, authorityCurrent: 1,
    primaryVoxelUrn: urn('voxel', 'VOX-RF-STRUCT-003'),
    title: 'Fall Protection Anchor Points — Roof Perimeter',
    description: '6 D-ring anchors approved for north roof perimeter. OHS compliant, within foreman authority under $2,000.',
    budgetEstimated: 1200.00, delayDays: 0,
  },
  {
    decisionId: 'DEC-2026-0006',
    type: 'ESCALATION', status: 'PENDING',
    authorityRequired: 4, authorityCurrent: 2,
    primaryVoxelUrn: urn('voxel', 'VOX-L3-HVAC-001'),
    title: 'MEP Coordination Gap — Level 3 Sprinkler vs Ductwork',
    description: '3 clash points: sprinkler branches vs HVAC duct at columns C4, D4, D5. Architect/engineer coordination required for RFI-047. Estimated $28,000 rework if unresolved before framing.',
    budgetEstimated: 28000.00, delayDays: 7,
  },
  {
    decisionId: 'DEC-2026-0007',
    type: 'PROPOSAL', status: 'PENDING',
    authorityRequired: 3, authorityCurrent: 2,
    primaryVoxelUrn: null,
    title: 'Fire Suppression Riser Relocation — Stairwell C',
    description: 'Riser conflicts with updated BC Building Code stair width. 14" south relocation. Requires PM approval, permit revision, Fire Marshal notification.',
    budgetEstimated: 15800.00, delayDays: 4,
  },
  {
    decisionId: 'DEC-2026-0008',
    type: 'APPROVAL', status: 'APPROVED',
    authorityRequired: 5, authorityCurrent: 5,
    primaryVoxelUrn: null,
    title: 'Foundation Waterproofing Membrane Substitution — Owner Approved',
    description: 'Tremco Paraseal LG unavailable (12-week lead). Owner approved Cetco Voltex DS substitution. Engineer confirmed equivalency. Delta: +$6,400 expedited shipping.',
    budgetEstimated: 6400.00, delayDays: 0,
  },
];

// ============================================================================
// Inspection Data (2 rows)
// ============================================================================

const INSPECTIONS = [
  {
    urn: urn('inspection', 'INSP-2026-0001'),
    project_id: PROJECT_ID,
    inspection_id: 'INSP-2026-0001',
    inspection_type: 'ROUGH_IN' as const,
    status: 'FAILED' as const,
    result_outcome: 'FAILED',
    scheduled_date: new Date('2026-03-12T09:00:00Z'),
    reinspection_required: true,
    findings: {
      inspectorName: 'City of Vancouver — Building Inspection Services',
      violations: [
        { code: 'NEC 300.11', description: 'Conduit supports missing — 14 runs exceeding 6ft span', severity: 'MAJOR' },
        { code: 'NEC 314.25', description: 'Junction box cover plate missing at JB-2S-04', severity: 'MAJOR' },
        { code: 'NEC 314.16', description: 'Box fill violation — 22 AWG count exceeds volume at JB-2S-09', severity: 'MINOR' },
      ],
      reinspectionRequired: true,
      holdPlaced: true,
      holdLinkedVoxel: 'VOX-L2-ELEC-014',
    },
    graph_metadata: { inEdges: [], outEdges: [] },
    meta: {
      seededBy: 'seed-canadian-pilot-demo',
      voxelRef: urn('voxel', 'VOX-L2-ELEC-014'),
    },
  },
  {
    urn: urn('inspection', 'INSP-2026-0002'),
    project_id: PROJECT_ID,
    inspection_id: 'INSP-2026-0002',
    inspection_type: 'SAFETY' as const,
    status: 'SCHEDULED' as const,
    result_outcome: null,
    scheduled_date: new Date('2026-03-17T10:00:00Z'),
    reinspection_required: false,
    findings: null,
    graph_metadata: { inEdges: [], outEdges: [] },
    meta: { seededBy: 'seed-canadian-pilot-demo' },
  },
];

// ============================================================================
// Seed Logic
// ============================================================================

/** Insert a single row, skip if unique constraint fires (P2002) */
async function createOrSkip<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ created: boolean }> {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] ✓ ${label}`);
    return { created: true };
  }
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    return { created: true };
  } catch (e: any) {
    if (e.code === 'P2002') {
      console.log(`  ✓ ${label} (already exists — skipped)`);
      return { created: false };
    }
    console.error(`  ✗ ${label}: ${e.message}`);
    throw e;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SEED: Canadian Pilot Demo — PostgreSQL Only (DEC-003)');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // ── DATABASE_URL validation ──────────────────────────────────────────
  if (!DRY_RUN && !process.env.DATABASE_URL) {
    console.error('✗ DATABASE_URL is not set. Cannot connect to PostgreSQL.');
    process.exit(1);
  }
  console.log(`✓ DATABASE_URL ${DRY_RUN ? '(dry-run — not required)' : 'set — connecting...'}`);

  if (!DRY_RUN) {
    prisma = new PrismaClient();
  }

  if (DRY_RUN) {
    console.log();
    console.log('── DRY-RUN: Data Preview ────────────────────────────────');
    console.log();
    console.log(`Project ID: ${PROJECT_ID}`);
    console.log();

    console.log('VOXELS (4):');
    for (const v of VOXELS) {
      console.log(`  [DRY-RUN] ✓ ${v.voxel_id} | ${v.status} | ${v.health_status} | ${v.building} ${v.level} ${v.zone} ${v.system}`);
      console.log(`             URN: ${v.urn}`);
      console.log(`             Coords: (${v.coord_x}, ${v.coord_y}, ${v.coord_z}) res=${v.resolution}`);
      console.log(`             Cost: est=$${v.estimated_cost} actual=$${v.actual_cost ?? 'null'}`);
    }
    console.log();

    console.log('DECISIONS (8):');
    for (const d of DECISIONS) {
      console.log(`  [DRY-RUN] ✓ ${d.decisionId} | ${d.type} | ${d.status} | auth=${d.authorityCurrent}/${d.authorityRequired}`);
      console.log(`             URN: ${urn('pm-decision', d.decisionId)}`);
      console.log(`             Title: ${d.title}`);
      console.log(`             Budget: $${d.budgetEstimated} | Delay: ${d.delayDays}d`);
      console.log(`             Voxel: ${d.primaryVoxelUrn ?? 'null'}`);
    }
    console.log();

    console.log('INSPECTIONS (2):');
    for (const i of INSPECTIONS) {
      console.log(`  [DRY-RUN] ✓ ${i.inspection_id} | ${i.inspection_type} | ${i.status} | outcome=${i.result_outcome ?? 'null'}`);
      console.log(`             URN: ${i.urn}`);
      console.log(`             Scheduled: ${i.scheduled_date.toISOString()}`);
      if (i.findings) {
        console.log(`             Findings: ${(i.findings as any).violations?.length ?? 0} violations`);
      }
    }
    console.log();
    console.log('── DRY-RUN COMPLETE — no database writes performed ─────');
    console.log('   Approve this output, then re-run without --dry-run.');
    return;
  }

  // ── Prerequisite: authority_levels — auto-seed if empty ──────────────
  const authLevelCount = await prisma.authorityLevel.count();
  if (authLevelCount === 0) {
    console.log('  authority_levels empty — seeding L0-L6 hierarchy...');
    const AUTHORITY_LEVELS = [
      { level: 0, name: 'FIELD' as const, title: 'Field Worker', urn: 'urn:luhtech:ectropy:authority-level:pm-level-0', budget_limit: 0, auto_approve: true, schedule_authority: 'none', schedule_authority_hours: 0 },
      { level: 1, name: 'FOREMAN' as const, title: 'Foreman', urn: 'urn:luhtech:ectropy:authority-level:pm-level-1', budget_limit: 2000, auto_approve: false, schedule_authority: '4 hours', schedule_authority_hours: 4 },
      { level: 2, name: 'SUPERINTENDENT' as const, title: 'Superintendent', urn: 'urn:luhtech:ectropy:authority-level:pm-level-2', budget_limit: 10000, auto_approve: false, schedule_authority: '1 day', schedule_authority_hours: 8 },
      { level: 3, name: 'PM' as const, title: 'Project Manager', urn: 'urn:luhtech:ectropy:authority-level:pm-level-3', budget_limit: 50000, auto_approve: false, schedule_authority: '1 week', schedule_authority_hours: 40 },
      { level: 4, name: 'ARCHITECT' as const, title: 'Architect / Engineer of Record', urn: 'urn:luhtech:ectropy:authority-level:pm-level-4', budget_limit: 250000, auto_approve: false, schedule_authority: 'design scope', schedule_authority_hours: 160 },
      { level: 5, name: 'OWNER' as const, title: 'Owner / Client Representative', urn: 'urn:luhtech:ectropy:authority-level:pm-level-5', budget_limit: null, budget_limit_scope: 'project', auto_approve: false, schedule_authority: 'project scope', schedule_authority_hours: null },
      { level: 6, name: 'REGULATORY' as const, title: 'Authority Having Jurisdiction (AHJ)', urn: 'urn:luhtech:ectropy:authority-level:pm-level-6', budget_limit: null, budget_limit_scope: 'code', auto_approve: false, schedule_authority: 'code scope', schedule_authority_hours: null },
    ];
    for (const al of AUTHORITY_LEVELS) {
      await createOrSkip(`L${al.level} ${al.name} (${al.title})`, () =>
        prisma.authorityLevel.create({ data: al as any }),
      );
    }
    console.log();
  }
  console.log(`✓ authority_levels: ${await prisma.authorityLevel.count()} rows`);

  // ── Self-contained: Ensure tenant, user, project exist ──────────────
  // INTERIM FIX: Makes seed portable across environments without
  // depending on create-demo-tenant.ts → create-demo-projects.ts chain.
  // Will be replaced by Demo Bundle Cache (DEC-006) in Phase 5.

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'ectropy-demo' },
    create: {
      slug: 'ectropy-demo',
      name: 'Ectropy Demo',
      status: 'ACTIVE',
      subscription_tier: 'PROFESSIONAL',
      data_region: 'us-west-2',
    },
    update: {},
  });
  console.log(`✓ Tenant: ${tenant.name} (${tenant.id})`);

  const demoUser = await prisma.user.upsert({
    where: { email: 'erik@luh.tech' },
    create: {
      email: 'erik@luh.tech',
      full_name: 'Erik Luhtala',
      role: 'admin',
      roles: ['admin'],
      is_authorized: true,
      is_platform_admin: false,
      tenant_id: tenant.id,
    },
    update: {},
  });
  console.log(`✓ User: ${demoUser.email} (${demoUser.id})`);

  const project = await prisma.project.upsert({
    where: { id: PROJECT_ID },
    create: {
      id: PROJECT_ID,
      tenant_id: tenant.id,
      owner_id: demoUser.id,
      name: 'Construction Site Alpha',
      description: 'Multi-story office building — BIM coordination, decision lifecycle, ROS MRO demo.',
      status: 'active',
    },
    update: {},
  });
  console.log(`✓ Project: ${project.name} (${PROJECT_ID})`);

  // ── SpeckleStream linkage (BIM viewer needs this to resolve project → stream) ──
  const speckleStream = await prisma.speckleStream.upsert({
    where: { construction_project_id: project.id },
    create: {
      construction_project_id: project.id,
      stream_id: '9a5215cc88',
      stream_name: 'Demo Office Building',  // The actual BIM geometry stream loaded by the viewer
    },
    update: {},
  });
  console.log(`✓ SpeckleStream: ${speckleStream.stream_name} (${speckleStream.stream_id})`);

  // ── Assign demo user as project owner (required for /my-role and voxel access) ──
  const projectRole = await prisma.projectRole.upsert({
    where: {
      user_id_project_id_role: {
        user_id: demoUser.id,
        project_id: project.id,
        role: 'owner',
      },
    },
    create: {
      user_id: demoUser.id,
      project_id: project.id,
      role: 'owner',
      permissions: ['read', 'write', 'admin'],
      voting_power: 100,
      is_active: true,
    },
    update: {},
  });
  console.log(`✓ ProjectRole: ${projectRole.role} for ${demoUser.email} on ${project.name}`);

  // ── Build authority level → ID map ──────────────────────────────────
  const authorityLevels = await prisma.authorityLevel.findMany({
    select: { id: true, level: true, name: true },
    orderBy: { level: 'asc' },
  });
  const authLevelMap = new Map(authorityLevels.map((al) => [al.level, al.id]));
  console.log(`✓ Authority levels mapped: ${authorityLevels.map((al) => `L${al.level}→id:${al.id}`).join(', ')}`);
  console.log();

  // ── Seed Voxels ─────────────────────────────────────────────────────
  console.log('── Voxels (4) ───────────────────────────────────────────');
  let voxelCreated = 0;
  for (const v of VOXELS) {
    const result = await createOrSkip(
      `${v.voxel_id} [${v.status}/${v.health_status}]`,
      () => prisma.voxel.create({ data: v as any }),
    );
    if (result.created) voxelCreated++;
  }
  console.log();

  // ── Seed Decisions ──────────────────────────────────────────────────
  console.log('── Decisions (8) ────────────────────────────────────────');
  let decisionCreated = 0;
  for (const d of DECISIONS) {
    const authLevelId = authLevelMap.get(d.authorityRequired) ?? null;
    const data = {
      urn: urn('pm-decision', d.decisionId),
      project_id: PROJECT_ID,
      decision_id: d.decisionId,
      title: d.title,
      description: d.description,
      type: d.type,
      status: d.status,
      authority_required: d.authorityRequired,
      authority_current: d.authorityCurrent,
      authority_level_id: authLevelId,
      primary_voxel_urn: d.primaryVoxelUrn,
      budget_estimated: d.budgetEstimated,
      budget_currency: 'CAD',
      delay_days: d.delayDays,
      critical_path: d.delayDays > 0,
      graph_metadata: { inEdges: [], outEdges: [] },
      meta: { seededBy: 'seed-canadian-pilot-demo' },
    };
    const result = await createOrSkip(
      `${d.decisionId} [${d.type}/${d.status}] auth=${d.authorityCurrent}/${d.authorityRequired} (level_id=${authLevelId})`,
      () => prisma.pMDecision.create({ data: data as any }),
    );
    if (result.created) decisionCreated++;
  }
  console.log();

  // ── Seed Inspections ────────────────────────────────────────────────
  console.log('── Inspections (2) ──────────────────────────────────────');
  let inspectionCreated = 0;
  for (const i of INSPECTIONS) {
    const result = await createOrSkip(
      `${i.inspection_id} [${i.inspection_type}/${i.status}]`,
      () => prisma.inspection.create({ data: i as any }),
    );
    if (result.created) inspectionCreated++;
  }
  console.log();

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SEED COMPLETE — Canadian Pilot Demo');
  console.log(`  Voxels:      ${voxelCreated} created / ${VOXELS.length - voxelCreated} skipped`);
  console.log(`  Decisions:   ${decisionCreated} created / ${DECISIONS.length - decisionCreated} skipped`);
  console.log(`  Inspections: ${inspectionCreated} created / ${INSPECTIONS.length - inspectionCreated} skipped`);
  console.log('  Storage:     PostgreSQL only (DEC-003)');
  console.log('═══════════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('✗ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
