#!/usr/bin/env tsx
/**
 * One-off script: Delete stale user records from staging database
 *
 * Keep: any @luh.tech email, admin@ectropy.com, demo@ectropy.com, test@ectropy.com
 * Delete: everything else (ectropytest@gmail.com, erik@luhtechnology.com, etc.)
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/database/clean-stale-users.ts --dry-run
 *   DATABASE_URL=... npx tsx scripts/database/clean-stale-users.ts --execute
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--execute');

const KEEP_EMAILS = [
  'admin@ectropy.com',
  'demo@ectropy.com',
  'test@ectropy.com',
];
const KEEP_DOMAIN = '@luh.tech';

async function main() {
  console.log(`\n🧹 Clean Stale Users`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}\n`);

  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, role: true, is_platform_admin: true, tenant_id: true, is_active: true, is_authorized: true },
    orderBy: { email: 'asc' },
  });

  console.log(`   Total users in database: ${allUsers.length}\n`);

  const keep: typeof allUsers = [];
  const remove: typeof allUsers = [];

  for (const u of allUsers) {
    const isKeepEmail = KEEP_EMAILS.includes(u.email);
    const isKeepDomain = u.email.endsWith(KEEP_DOMAIN);
    if (isKeepEmail || isKeepDomain) {
      keep.push(u);
      console.log(`   ✅ KEEP  ${u.email} (role=${u.role}, admin=${u.is_platform_admin}, tenant=${u.tenant_id?.slice(0, 8) ?? 'NULL'})`);
    } else {
      remove.push(u);
      console.log(`   🗑️  DEL  ${u.email} (role=${u.role}, admin=${u.is_platform_admin}, tenant=${u.tenant_id?.slice(0, 8) ?? 'NULL'})`);
    }
  }

  console.log(`\n   📊 Keep: ${keep.length}, Delete: ${remove.length}\n`);

  if (remove.length === 0) {
    console.log('   ✅ No stale users to delete.\n');
    await prisma.$disconnect();
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('   ⚠️  DRY RUN — no changes made. Run with --execute to apply.\n');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Delete stale users (FK cascade handles project_roles, etc.)
  const deleteIds = remove.map((u) => u.id);
  const result = await prisma.user.deleteMany({
    where: { id: { in: deleteIds } },
  });

  console.log(`   🗑️  Deleted ${result.count} stale user(s)\n`);

  // Verify erik@luh.tech state if present
  const erik = await prisma.user.findUnique({
    where: { email: 'erik@luh.tech' },
    select: { id: true, email: true, is_active: true, is_authorized: true, is_platform_admin: true, role: true },
  });

  if (erik) {
    console.log('   🔍 erik@luh.tech status:');
    console.log(`     is_active: ${erik.is_active}`);
    console.log(`     is_authorized: ${erik.is_authorized}`);
    console.log(`     is_platform_admin: ${erik.is_platform_admin}`);
    console.log(`     role: ${erik.role}`);
  } else {
    console.log('   ℹ️  erik@luh.tech not in DB yet — will be auto-created on first Google login');
  }

  // Final user count
  const finalCount = await prisma.user.count();
  console.log(`\n   📋 Final user count: ${finalCount}\n`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
