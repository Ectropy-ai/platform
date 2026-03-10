/**
 * Create Demo Projects Seed
 *
 * Creates 2 demo projects for ectropy-demo tenant:
 * 1. Construction Site Alpha (Office Building)
 * 2. Infrastructure Beta (Bridge)
 *
 * Supports E2E testing and trial user onboarding with BIM data.
 *
 * @module scripts/database/seeds/create-demo-projects
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Demo Project 1: Construction Site Alpha
 * Office building with BIM coordination and decision lifecycle demo
 */
const PROJECT_ALPHA = {
  name: 'Construction Site Alpha',
  slug: 'construction-site-alpha',
  description:
    'Multi-story office building in downtown core. Demonstrates BIM coordination, decision lifecycle, and ROS MRO views for complex MEP systems.',
  status: 'active',
  metadata: {
    projectType: 'commercial',
    buildingType: 'office',
    totalFloors: 12,
    grossAreaSqFt: 150000,
    estimatedValue: 45000000,
    location: {
      address: '123 Demo Street',
      city: 'Vancouver',
      province: 'BC',
      country: 'Canada',
      postalCode: 'V6B 1A1',
    },
    schedule: {
      startDate: '2025-01-15',
      estimatedCompletion: '2026-12-31',
      currentPhase: 'construction',
    },
    stakeholders: [
      { role: 'Owner', company: 'Demo Properties Inc.' },
      { role: 'General Contractor', company: 'BuildCo Construction' },
      { role: 'Architect', company: 'Design Partners Architecture' },
      { role: 'Structural Engineer', company: 'Structural Solutions' },
      { role: 'MEP Engineer', company: 'Mechanical Excellence' },
    ],
    purpose: 'demo',
    createdBy: 'seed-orchestrator',
  },
};

/**
 * Demo Project 2: Infrastructure Beta
 * Bridge infrastructure project with civil engineering focus
 */
const PROJECT_BETA = {
  name: 'Infrastructure Beta',
  slug: 'infrastructure-beta',
  description:
    'Pedestrian and cyclist bridge spanning 200m over highway. Showcases civil BIM, structural analysis, and as-built documentation workflows.',
  status: 'active',
  metadata: {
    projectType: 'infrastructure',
    buildingType: 'bridge',
    spanLengthM: 200,
    widthM: 8,
    estimatedValue: 12000000,
    location: {
      address: 'Highway 99 Crossing',
      city: 'Richmond',
      province: 'BC',
      country: 'Canada',
      postalCode: 'V7A 1A1',
    },
    schedule: {
      startDate: '2025-03-01',
      estimatedCompletion: '2026-09-30',
      currentPhase: 'design-development',
    },
    stakeholders: [
      { role: 'Owner', company: 'City of Richmond' },
      { role: 'General Contractor', company: 'Infrastructure Builders Ltd.' },
      { role: 'Civil Engineer', company: 'Civil Design Associates' },
      { role: 'Structural Engineer', company: 'Bridge Engineering Corp.' },
    ],
    purpose: 'demo',
    createdBy: 'seed-orchestrator',
  },
};

/**
 * Main seed function
 */
async function main() {
  console.log('Creating demo projects...');

  // Find ectropy-demo tenant
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'ectropy-demo' },
  });

  if (!tenant) {
    console.error('❌ Demo tenant "ectropy-demo" not found');
    console.error('Run create-demo-tenant seed first');
    process.exit(1);
  }

  console.log(`✓ Found tenant: ${tenant.name} (ID: ${tenant.id})`);

  // Check if projects already exist (idempotency)
  const existingProjects = await prisma.project.findMany({
    where: {
      tenant_id: tenant.id,
      slug: {
        in: [PROJECT_ALPHA.slug, PROJECT_BETA.slug],
      },
    },
  });

  if (existingProjects.length >= 2) {
    console.log(
      `✓ Demo projects already exist (${existingProjects.length} found)`
    );
    console.log('Skipping creation (idempotent check passed)');
    existingProjects.forEach((p) => {
      console.log(`  - ${p.name} (${p.slug})`);
    });
    return;
  }

  // Create Project Alpha
  const alphaExists = existingProjects.find(
    (p) => p.slug === PROJECT_ALPHA.slug
  );
  let projectAlpha;

  if (alphaExists) {
    console.log(`✓ Project Alpha already exists: ${alphaExists.name}`);
    projectAlpha = alphaExists;
  } else {
    projectAlpha = await prisma.project.create({
      data: {
        tenant_id: tenant.id,
        name: PROJECT_ALPHA.name,
        slug: PROJECT_ALPHA.slug,
        description: PROJECT_ALPHA.description,
        status: PROJECT_ALPHA.status,
        metadata: PROJECT_ALPHA.metadata,
      },
    });
    console.log(
      `✓ Created Project Alpha: ${projectAlpha.name} (ID: ${projectAlpha.id})`
    );
  }

  // Create Project Beta
  const betaExists = existingProjects.find((p) => p.slug === PROJECT_BETA.slug);
  let projectBeta;

  if (betaExists) {
    console.log(`✓ Project Beta already exists: ${betaExists.name}`);
    projectBeta = betaExists;
  } else {
    projectBeta = await prisma.project.create({
      data: {
        tenant_id: tenant.id,
        name: PROJECT_BETA.name,
        slug: PROJECT_BETA.slug,
        description: PROJECT_BETA.description,
        status: PROJECT_BETA.status,
        metadata: PROJECT_BETA.metadata,
      },
    });
    console.log(
      `✓ Created Project Beta: ${projectBeta.name} (ID: ${projectBeta.id})`
    );
  }

  console.log('');
  console.log('=========================================');
  console.log('✓ DEMO PROJECTS CREATION COMPLETE');
  console.log('=========================================');
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Projects: ${projectAlpha.name}, ${projectBeta.name}`);
  console.log('');
  console.log('Next steps:');
  console.log('  - Run seed-ros-mro-demo to add voxel grid and activity items');
  console.log('  - Upload IFC models for BIM viewer visualization');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export { PROJECT_ALPHA, PROJECT_BETA };
