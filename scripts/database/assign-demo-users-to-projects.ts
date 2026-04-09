#!/usr/bin/env tsx
/**
 * One-off script: Clean orphaned projects + assign demo users to demo projects
 *
 * Phase 1: Delete all projects that are NOT the two demo projects
 *          (E2E Test Project, My First Project, etc.) — FK cascades handle children
 * Phase 2: Ensure all ectropy-demo tenant users have proper project_roles records
 *          with correct permissions. Safe to re-run (idempotent via upsert).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/database/assign-demo-users-to-projects.ts --dry-run
 *   DATABASE_URL=... npx tsx scripts/database/assign-demo-users-to-projects.ts --execute
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--execute');
const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/** The only two projects that should exist after cleanup */
const KEEP_PROJECTS = ['Demo Office Building', 'Sample Residential Complex'];

/** Permission sets by role */
const PERMISSIONS: Record<string, string[]> = {
  owner: ['read', 'write', 'admin', 'delete', 'manage_members'],
  admin: ['read', 'write', 'admin'],
  consultant: ['read', 'write'],
};

interface Assignment {
  userEmail: string;
  userId: string;
  projectName: string;
  projectId: string;
  role: string;
  permissions: string[];
  action: 'create' | 'update' | 'skip';
}

/**
 * Phase 1: Delete orphaned projects (E2E leftovers, My First Project, etc.)
 * All FK relations use onDelete: Cascade so child records are cleaned automatically.
 */
async function cleanOrphanedProjects(): Promise<number> {
  console.log('   🧹 Phase 1: Orphaned project cleanup\n');

  // Audit: list ALL projects in the database
  const allProjects = await prisma.project.findMany({
    select: { id: true, name: true, tenant_id: true, status: true },
    orderBy: { name: 'asc' },
  });

  console.log(`   Total projects in database: ${allProjects.length}`);
  for (const p of allProjects) {
    const keep = KEEP_PROJECTS.includes(p.name);
    console.log(`     ${keep ? '✅' : '🗑️ '} "${p.name}" (${p.status}, tenant=${p.tenant_id?.slice(0, 8) ?? 'NULL'})`);
  }

  const toDelete = allProjects.filter((p) => !KEEP_PROJECTS.includes(p.name));

  if (toDelete.length === 0) {
    console.log('\n   ✅ No orphaned projects to delete.\n');
    return 0;
  }

  console.log(`\n   📊 ${toDelete.length} orphaned project(s) to delete\n`);

  if (DRY_RUN) {
    return toDelete.length;
  }

  // Delete orphaned projects (FK cascade handles project_roles, speckle_streams, etc.)
  const result = await prisma.project.deleteMany({
    where: {
      name: { notIn: KEEP_PROJECTS },
    },
  });

  console.log(`   🗑️  Deleted ${result.count} orphaned project(s) (FK cascade cleaned children)\n`);
  return result.count;
}

async function main() {
  console.log(`\n🔗 Demo Database Cleanup & Role Assignment`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (use --execute to apply)' : 'EXECUTE'}\n`);

  // Phase 1: Clean orphaned projects
  const deleted = await cleanOrphanedProjects();

  // Phase 2: Assign demo users to demo projects
  console.log('   🔗 Phase 2: Project role assignment\n');

  // Find all users who should have access to demo projects:
  // - Demo tenant users (demo@ectropy.com, test@ectropy.com)
  // - Platform admins (admin@ectropy.com — tenant_id NULL, is_platform_admin=true)
  // - All other authorized users (erik@luhtechnology.com — different tenant but needs demo access)
  const users = await prisma.user.findMany({
    where: {
      is_active: true,
      is_authorized: true,
    },
    select: { id: true, email: true, role: true, is_platform_admin: true, tenant_id: true },
  });

  // Find all demo tenant projects (should be exactly 2 after cleanup)
  const projects = await prisma.project.findMany({
    where: { tenant_id: DEMO_TENANT_ID },
    select: { id: true, name: true, owner_id: true },
  });

  console.log(`   Found ${users.length} demo tenant user(s)`);
  console.log(`   Found ${projects.length} demo tenant project(s)\n`);

  if (users.length === 0 || projects.length === 0) {
    console.log('   ⚠️  No users or projects found. Run seed first.\n');
    await prisma.$disconnect();
    process.exit(0);
  }

  const assignments: Assignment[] = [];

  for (const project of projects) {
    for (const user of users) {
      // Determine role:
      //   owner    — if user owns the project
      //   admin    — platform admins OR non-demo-tenant users (erik, @luh.tech staff)
      //   consultant — demo tenant users who don't own the project
      const isOwner = project.owner_id === user.id;
      const isPlatformAdmin = (user as any).is_platform_admin === true;
      const isDemoTenant = (user as any).tenant_id === DEMO_TENANT_ID;
      const role = isOwner ? 'owner' : (isPlatformAdmin || !isDemoTenant) ? 'admin' : 'consultant';
      const permissions = PERMISSIONS[role] || PERMISSIONS.consultant;

      // Check existing role
      const existing = await prisma.projectRole.findFirst({
        where: {
          user_id: user.id,
          project_id: project.id,
        },
      });

      let action: Assignment['action'];
      if (!existing) {
        action = 'create';
      } else if (!existing.is_active || existing.permissions.length === 0) {
        action = 'update';
      } else {
        action = 'skip';
      }

      assignments.push({
        userEmail: user.email,
        userId: user.id,
        projectName: project.name,
        projectId: project.id,
        role,
        permissions,
        action,
      });
    }
  }

  const creates = assignments.filter((a) => a.action === 'create');
  const updates = assignments.filter((a) => a.action === 'update');
  const skips = assignments.filter((a) => a.action === 'skip');

  console.log(`   📊 ${creates.length} to create, ${updates.length} to update, ${skips.length} already correct\n`);

  if (creates.length === 0 && updates.length === 0) {
    console.log('   ✅ All project_roles are already correct.\n');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Log planned changes
  for (const a of [...creates, ...updates]) {
    console.log(`   ${a.action === 'create' ? '➕' : '🔄'} ${a.userEmail} → ${a.projectName} (${a.role}, permissions: [${a.permissions.join(',')}])`);
  }

  if (DRY_RUN) {
    console.log(`\n   ⚠️  DRY RUN — no changes made. Run with --execute to apply.\n`);
    await prisma.$disconnect();
    process.exit(0);
  }

  // Execute changes
  console.log(`\n   🔧 Applying changes...\n`);
  let applied = 0;

  for (const a of creates) {
    try {
      await prisma.projectRole.create({
        data: {
          user_id: a.userId,
          project_id: a.projectId,
          role: a.role as any,
          permissions: a.permissions,
          is_active: true,
        },
      });
      applied++;
      console.log(`     ✅ Created: ${a.userEmail} → ${a.projectName} (${a.role})`);
    } catch (err) {
      // Unique constraint violation = already exists with different role
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Unique constraint')) {
        console.log(`     ⏭️  Skipped (unique constraint): ${a.userEmail} → ${a.projectName}`);
      } else {
        console.log(`     ❌ Failed: ${a.userEmail} → ${a.projectName}: ${msg}`);
      }
    }
  }

  for (const a of updates) {
    try {
      await prisma.$executeRaw`
        UPDATE project_roles
        SET permissions = ${a.permissions}::text[],
            is_active = true
        WHERE user_id = ${a.userId}::uuid
          AND project_id = ${a.projectId}::uuid
      `;
      applied++;
      console.log(`     ✅ Updated: ${a.userEmail} → ${a.projectName} (permissions: [${a.permissions.join(',')}])`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`     ❌ Failed: ${a.userEmail} → ${a.projectName}: ${msg}`);
    }
  }

  console.log(`\n   🔗 Complete: ${applied}/${creates.length + updates.length} changes applied.\n`);

  // Final audit
  const finalProjects = await prisma.project.findMany({
    select: { name: true, status: true },
    orderBy: { name: 'asc' },
  });
  const finalRoles = await prisma.projectRole.count({ where: { is_active: true } });
  console.log('   📋 Final state:');
  console.log(`     Projects: ${finalProjects.length} (${finalProjects.map((p) => p.name).join(', ')})`);
  console.log(`     Active project_roles: ${finalRoles}\n`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
