#!/usr/bin/env tsx
/**
 * P0-SECURITY: Purge "Stop Claude" prompt injection from database
 *
 * Scans all text/varchar columns in all tables for injection patterns.
 * Replaces injected content with clean values.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/database/purge-injection.ts --dry-run
 *   DATABASE_URL=... npx tsx scripts/database/purge-injection.ts --execute
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--execute');

// Patterns to detect prompt injection
const INJECTION_PATTERNS = [
  'stop claude',
  'ignore previous',
  'ignore all previous',
  'disregard previous',
  'you are now',
  'new instructions',
  'system prompt',
  'jailbreak',
  'do anything now',
  'DAN mode',
];

// Build SQL ILIKE clause
const likeClause = INJECTION_PATTERNS.map((p) => `col_value ILIKE '%${p}%'`).join(' OR ');

interface Finding {
  table: string;
  column: string;
  id: string;
  snippet: string;
}

async function getTextColumns(): Promise<Array<{ table_name: string; column_name: string }>> {
  const result = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying')
      AND table_name NOT LIKE '_prisma%'
    ORDER BY table_name, column_name
  `;
  return result;
}

async function scanColumn(
  table: string,
  column: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    // Use dynamic SQL to scan each column
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; col_value: string }>>(
      `SELECT id::text, "${column}" AS col_value
       FROM "${table}"
       WHERE "${column}" IS NOT NULL
         AND (${INJECTION_PATTERNS.map((p) => `"${column}" ILIKE '%${p.replace(/'/g, "''")}%'`).join(' OR ')})
       LIMIT 100`,
    );

    for (const row of rows) {
      findings.push({
        table,
        column,
        id: row.id,
        snippet: (row.col_value || '').substring(0, 120),
      });
    }
  } catch {
    // Table may not have 'id' column or other schema issues — skip
  }
  return findings;
}

async function purgeRow(table: string, column: string, id: string): Promise<void> {
  // Replace injected content with a sanitized marker
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "${column}" = '[content removed — injection purge]' WHERE id = $1::uuid`,
    id,
  );
}

async function main() {
  console.log(`\n🔒 P0-SECURITY: Database Injection Purge`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (use --execute to apply)' : 'EXECUTE'}\n`);

  const columns = await getTextColumns();
  console.log(`   Scanning ${columns.length} text columns across all tables...\n`);

  const allFindings: Finding[] = [];

  for (const { table_name, column_name } of columns) {
    const findings = await scanColumn(table_name, column_name);
    if (findings.length > 0) {
      console.log(`  ❌ ${table_name}.${column_name}: ${findings.length} injection(s)`);
      for (const f of findings) {
        console.log(`     id=${f.id}  snippet="${f.snippet}..."`);
      }
      allFindings.push(...findings);
    }
  }

  if (allFindings.length === 0) {
    console.log(`  ✅ No injection patterns found.\n`);
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`\n  📊 Total: ${allFindings.length} infected field(s)\n`);

  if (DRY_RUN) {
    console.log(`  ⚠️  DRY RUN — no changes made. Run with --execute to purge.\n`);
    await prisma.$disconnect();
    process.exit(0);
  }

  // Execute purge
  console.log(`  🧹 Purging ${allFindings.length} field(s)...\n`);
  let purged = 0;
  for (const f of allFindings) {
    try {
      await purgeRow(f.table, f.column, f.id);
      purged++;
      console.log(`     ✅ ${f.table}.${f.column} id=${f.id}`);
    } catch (err) {
      console.log(`     ❌ ${f.table}.${f.column} id=${f.id}: ${err}`);
    }
  }

  console.log(`\n  🔒 Purge complete: ${purged}/${allFindings.length} fields cleaned.\n`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
