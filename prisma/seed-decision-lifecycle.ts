/**
 * M3 Decision Lifecycle Seed Data
 * 
 * Seeds the 7-tier authority cascade and sample data for pilot testing.
 * Source: .roadmap/features/decision-lifecycle/graph-architecture.json
 * 
 * @module prisma/seed-decision-lifecycle
 */

import { PrismaClient, AuthorityLevelName, VoxelStatus, PMDecisionType, PMDecisionStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Authority Level Seed Data
 * From: graph-architecture.json authorityCascade
 */
const authorityLevels = [
  {
    level: 0,
    name: AuthorityLevelName.FIELD,
    title: 'Field Worker',
    budget_limit: null,
    budget_limit_scope: null,
    variance_tolerance: '0"',
    schedule_authority: '0 days',
    schedule_authority_hours: 0,
    auto_approve: true,
    permissions: ['CAPTURE_DECISION'],
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-0',
    graph_metadata: {
      inEdges: [],
      outEdges: ['urn:luhtech:ectropy:authority-level:pm-level-1'],
    },
  },
  {
    level: 1,
    name: AuthorityLevelName.FOREMAN,
    title: 'Foreman',
    budget_limit: 500,
    budget_limit_scope: null,
    variance_tolerance: '1/8"',
    schedule_authority: '4 hours',
    schedule_authority_hours: 4,
    auto_approve: false,
    permissions: ['CAPTURE_DECISION', 'APPROVE_DECISION', 'REJECT_DECISION', 'ESCALATE_DECISION'],
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-1',
    graph_metadata: {
      inEdges: ['urn:luhtech:ectropy:authority-level:pm-level-0'],
      outEdges: ['urn:luhtech:ectropy:authority-level:pm-level-2'],
    },
  },
  {
    level: 2,
    name: AuthorityLevelName.SUPERINTENDENT,
    title: 'Superintendent',
    budget_limit: 5000,
    budget_limit_scope: null,
    variance_tolerance: '1/4"',
    schedule_authority: '1 day',
    schedule_authority_hours: 24,
    auto_approve: false,
    permissions: [
      'CAPTURE_DECISION', 'APPROVE_DECISION', 'REJECT_DECISION', 'ESCALATE_DECISION',
      'CREATE_TOLERANCE_OVERRIDE', 'MODIFY_SCHEDULE', 'REQUEST_INSPECTION'
    ],
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-2',
    graph_metadata: {
      inEdges: ['urn:luhtech:ectropy:authority-level:pm-level-1'],
      outEdges: ['urn:luhtech:ectropy:authority-level:pm-level-3'],
    },
  },
  {
    level: 3,
    name: AuthorityLevelName.PM,
    title: 'Project Manager',
    budget_limit: 50000,
    budget_limit_scope: null,
    variance_tolerance: '1/2"',
    schedule_authority: '1 week',
    schedule_authority_hours: 168,
    auto_approve: false,
    permissions: [
      'CAPTURE_DECISION', 'APPROVE_DECISION', 'REJECT_DECISION', 'ESCALATE_DECISION',
      'CREATE_TOLERANCE_OVERRIDE', 'CREATE_PRE_APPROVAL', 'MODIFY_SCHEDULE', 'REQUEST_INSPECTION'
    ],
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-3',
    graph_metadata: {
      inEdges: ['urn:luhtech:ectropy:authority-level:pm-level-2'],
      outEdges: ['urn:luhtech:ectropy:authority-level:pm-level-4'],
    },
  },
  {
    level: 4,
    name: AuthorityLevelName.ARCHITECT,
    title: 'Architect/Engineer',
    budget_limit: null,
    budget_limit_scope: 'design',
    variance_tolerance: 'visible',
    schedule_authority: '2 weeks',
    schedule_authority_hours: 336,
    auto_approve: false,
    permissions: ['APPROVE_DECISION', 'REJECT_DECISION', 'ESCALATE_DECISION', 'APPROVE_DESIGN_CHANGE'],
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-4',
    graph_metadata: {
      inEdges: ['urn:luhtech:ectropy:authority-level:pm-level-3'],
      outEdges: ['urn:luhtech:ectropy:authority-level:pm-level-5'],
    },
  },
  {
    level: 5,
    name: AuthorityLevelName.OWNER,
    title: 'Owner Representative',
    budget_limit: null,
    budget_limit_scope: 'project',
    variance_tolerance: 'major',
    schedule_authority: '1 month',
    schedule_authority_hours: 720,
    auto_approve: false,
    permissions: ['APPROVE_DECISION', 'REJECT_DECISION', 'ESCALATE_DECISION'],
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-5',
    graph_metadata: {
      inEdges: ['urn:luhtech:ectropy:authority-level:pm-level-4'],
      outEdges: ['urn:luhtech:ectropy:authority-level:pm-level-6'],
    },
  },
  {
    level: 6,
    name: AuthorityLevelName.REGULATORY,
    title: 'Authority Having Jurisdiction',
    budget_limit: null,
    budget_limit_scope: 'code',
    variance_tolerance: 'safety',
    schedule_authority: 'any',
    schedule_authority_hours: null,
    auto_approve: false,
    permissions: ['APPROVE_DECISION', 'REJECT_DECISION', 'APPROVE_CODE_VARIANCE', 'COMPLETE_INSPECTION'],
    urn: 'urn:luhtech:ectropy:authority-level:pm-level-6',
    graph_metadata: {
      inEdges: ['urn:luhtech:ectropy:authority-level:pm-level-5'],
      outEdges: [],
    },
  },
];

/**
 * Sample Pilot Project Data
 * For Canadian Plant Facility pilot (March 2026)
 */
async function seedPilotData(projectId: string) {
  console.log('Seeding pilot data for project:', projectId);

  // Create sample participants
  const participants = [
    {
      urn: `urn:luhtech:${projectId}:participant:john-doe-pm`,
      project_id: projectId,
      participant_id: 'john-doe-pm',
      name: 'John Doe',
      email: 'john.doe@example.com',
      company: 'General Contractor Inc.',
      trade: null,
      authority_level_id: 4, // PM level
    },
    {
      urn: `urn:luhtech:${projectId}:participant:mike-smith-super`,
      project_id: projectId,
      participant_id: 'mike-smith-super',
      name: 'Mike Smith',
      email: 'mike.smith@example.com',
      company: 'General Contractor Inc.',
      trade: null,
      authority_level_id: 3, // Superintendent
    },
    {
      urn: `urn:luhtech:${projectId}:participant:jane-wilson-foreman`,
      project_id: projectId,
      participant_id: 'jane-wilson-foreman',
      name: 'Jane Wilson',
      email: 'jane.wilson@example.com',
      company: 'Mechanical Sub Inc.',
      trade: 'HVAC',
      authority_level_id: 2, // Foreman
    },
    {
      urn: `urn:luhtech:${projectId}:participant:bob-jones-field`,
      project_id: projectId,
      participant_id: 'bob-jones-field',
      name: 'Bob Jones',
      email: null,
      company: 'Drywall Pros LLC',
      trade: 'Drywall',
      authority_level_id: 1, // Field
    },
  ];

  // Create sample voxels (mechanical room scenario from FEATURE.json)
  const voxels = [
    {
      urn: `urn:luhtech:${projectId}:voxel:VOX-L2-MECH-047`,
      project_id: projectId,
      voxel_id: 'VOX-L2-MECH-047',
      status: VoxelStatus.IN_PROGRESS,
      coord_x: 45.5,
      coord_y: 23.0,
      coord_z: 6.5,
      resolution: 1.0,
      min_x: 45.0,
      max_x: 46.0,
      min_y: 22.5,
      max_y: 23.5,
      min_z: 6.0,
      max_z: 7.0,
      building: 'Main Building',
      level: 'Level 2',
      zone: 'Mechanical Room',
      system: 'HVAC',
      grid_reference: 'D-7',
      graph_metadata: {
        inEdges: [],
        outEdges: [],
      },
    },
    {
      urn: `urn:luhtech:${projectId}:voxel:VOX-L2-MECH-048`,
      project_id: projectId,
      voxel_id: 'VOX-L2-MECH-048',
      status: VoxelStatus.PLANNED,
      coord_x: 46.5,
      coord_y: 23.0,
      coord_z: 6.5,
      resolution: 1.0,
      min_x: 46.0,
      max_x: 47.0,
      min_y: 22.5,
      max_y: 23.5,
      min_z: 6.0,
      max_z: 7.0,
      building: 'Main Building',
      level: 'Level 2',
      zone: 'Mechanical Room',
      system: 'HVAC',
      grid_reference: 'D-8',
      graph_metadata: {
        inEdges: [],
        outEdges: [],
      },
    },
    {
      urn: `urn:luhtech:${projectId}:voxel:VOX-L2-CORR-101`,
      project_id: projectId,
      voxel_id: 'VOX-L2-CORR-101',
      status: VoxelStatus.PLANNED,
      coord_x: 44.5,
      coord_y: 23.0,
      coord_z: 6.5,
      resolution: 1.0,
      min_x: 44.0,
      max_x: 45.0,
      min_y: 22.5,
      max_y: 23.5,
      min_z: 6.0,
      max_z: 7.0,
      building: 'Main Building',
      level: 'Level 2',
      zone: 'Corridor',
      system: null,
      grid_reference: 'D-6',
      graph_metadata: {
        inEdges: [],
        outEdges: [],
      },
    },
  ];

  // Create sample decision (valve substitution scenario)
  const decisions = [
    {
      urn: `urn:luhtech:${projectId}:pm-decision:DEC-2026-0001`,
      project_id: projectId,
      decision_id: 'DEC-2026-0001',
      title: 'Valve Substitution - 1" Wider Body',
      description: 'Engineering substituted valve model due to 8-week lead time on original. New valve body is 1 inch wider and will protrude into wall cavity.',
      type: PMDecisionType.APPROVAL,
      status: PMDecisionStatus.APPROVED,
      authority_required: 2, // Superintendent required
      authority_current: 3, // PM approved
      primary_voxel_urn: `urn:luhtech:${projectId}:voxel:VOX-L2-MECH-047`,
      question: 'Should we approve the valve substitution that will protrude 1" into the adjacent wall cavity?',
      rationale: 'Lead time savings of 6 weeks justifies the 1" protrusion which can be accommodated by furring out the wall.',
      options: [
        {
          id: 'OPT-A',
          description: 'Approve substitution and notify drywall trade',
          consequences: ['Wall furring required', 'Drywall crew needs notification'],
          selected: true,
          estimatedCost: 500,
          estimatedDelay: 0,
        },
        {
          id: 'OPT-B',
          description: 'Reject substitution and wait for original valve',
          consequences: ['8-week schedule delay', 'Critical path impact'],
          selected: false,
          estimatedCost: 0,
          estimatedDelay: 56,
        },
      ],
      selected_option: 'OPT-A',
      budget_estimated: 500,
      budget_currency: 'USD',
      delay_days: 0,
      critical_path: false,
      graph_metadata: {
        inEdges: [`urn:luhtech:${projectId}:voxel:VOX-L2-MECH-047`],
        outEdges: [],
        edges: [
          {
            from: `urn:luhtech:${projectId}:voxel:VOX-L2-MECH-047`,
            to: `urn:luhtech:${projectId}:pm-decision:DEC-2026-0001`,
            type: 'contains',
          },
        ],
      },
    },
  ];

  return { participants, voxels, decisions };
}

/**
 * Main seed function
 */
async function main() {
  console.log('Starting M3 Decision Lifecycle seed...');

  // Seed authority levels
  console.log('Seeding authority levels...');
  for (const level of authorityLevels) {
    await prisma.authorityLevel.upsert({
      where: { level: level.level },
      update: level,
      create: level,
    });
  }
  console.log(`Seeded ${authorityLevels.length} authority levels`);

  // Check for existing projects to seed pilot data
  const projects = await prisma.project.findMany({
    where: { status: 'active' },
    take: 1,
  });

  if (projects.length > 0) {
    const pilotData = await seedPilotData(projects[0].id);
    console.log('Pilot data templates generated (apply manually if needed)');
  } else {
    console.log('No active projects found. Skipping pilot data seed.');
    console.log('Create a project first, then run seed again for sample data.');
  }

  console.log('M3 Decision Lifecycle seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export { authorityLevels, seedPilotData };
