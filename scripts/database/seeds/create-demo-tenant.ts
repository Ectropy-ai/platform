/**
 * Create Demo Tenant Seed
 *
 * Creates 'ectropy-demo' tenant with admin user and initial configuration.
 * Foundation for E2E testing and trial user onboarding.
 *
 * @module scripts/database/seeds/create-demo-tenant
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Demo Tenant Configuration
 */
const DEMO_TENANT = {
  name: 'Ectropy Demo',
  slug: 'ectropy-demo',
  description:
    'Demo tenant for E2E testing and trial user onboarding. Contains sample projects with BIM data and ROS MRO coordination views.',
  status: 'active',
  settings: {
    features: {
      bimViewer: true,
      rosMroCoordination: true,
      decisionLifecycle: true,
      contractManagement: true,
      scheduleManagement: true,
    },
    limits: {
      maxProjects: 10,
      maxUsers: 50,
      maxStorageGb: 100,
    },
    billing: {
      plan: 'trial',
      trialExpiresAt: null, // Never expires for demo
    },
  },
  metadata: {
    purpose: 'demo',
    createdBy: 'seed-orchestrator',
    environment: 'staging',
  },
};

/**
 * Demo Admin User Configuration
 */
const DEMO_ADMIN_USER = {
  email: 'admin@ectropy-demo.local',
  name: 'Demo Admin',
  role: 'admin',
  status: 'active',
  settings: {
    notifications: {
      email: false,
      inApp: true,
    },
    preferences: {
      theme: 'light',
      language: 'en',
    },
  },
  metadata: {
    purpose: 'demo',
    createdBy: 'seed-orchestrator',
  },
};

/**
 * Main seed function
 */
async function main() {
  console.log('Creating ectropy-demo tenant...');

  // Check if demo tenant already exists
  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: DEMO_TENANT.slug },
  });

  if (existingTenant) {
    console.log(
      `✓ Demo tenant '${DEMO_TENANT.slug}' already exists (ID: ${existingTenant.id})`
    );
    console.log('Skipping creation (idempotent check passed)');
    return;
  }

  // Create demo tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: DEMO_TENANT.name,
      slug: DEMO_TENANT.slug,
      description: DEMO_TENANT.description,
      status: DEMO_TENANT.status,
      settings: DEMO_TENANT.settings,
      metadata: DEMO_TENANT.metadata,
    },
  });

  console.log(`✓ Created tenant: ${tenant.name} (ID: ${tenant.id})`);

  // Create demo admin user
  const user = await prisma.user.create({
    data: {
      email: DEMO_ADMIN_USER.email,
      name: DEMO_ADMIN_USER.name,
      role: DEMO_ADMIN_USER.role,
      status: DEMO_ADMIN_USER.status,
      settings: DEMO_ADMIN_USER.settings,
      metadata: DEMO_ADMIN_USER.metadata,
      tenants: {
        connect: { id: tenant.id },
      },
    },
  });

  console.log(`✓ Created admin user: ${user.name} (${user.email})`);

  console.log('');
  console.log('=========================================');
  console.log('✓ DEMO TENANT CREATION COMPLETE');
  console.log('=========================================');
  console.log(`Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Admin: ${user.name} (${user.email})`);
  console.log(`Status: ${tenant.status}`);
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

export { DEMO_TENANT, DEMO_ADMIN_USER };
