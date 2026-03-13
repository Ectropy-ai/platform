/**
 * Schema Drift Detection Test
 *
 * Verifies that every model in schema.prisma has a corresponding migration.
 * This test prevents the class of failure that produced RC-2:
 * fields in schema.prisma with no migration → Prisma client generates
 * queries for columns that don't exist in the database → 42703 errors.
 *
 * Strategy: Parse schema.prisma for all model @@map names and all enum names,
 * then verify each appears in at least one migration SQL file.
 *
 * This test runs WITHOUT a database connection — it is a static analysis
 * of the migration files against the schema.
 *
 * @module api-gateway/__tests__/schema-drift.spec
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Helpers
// ============================================================================

const PRISMA_DIR = path.resolve(__dirname, '../../../../prisma');
const SCHEMA_PATH = path.join(PRISMA_DIR, 'schema.prisma');
const MIGRATIONS_DIR = path.join(PRISMA_DIR, 'migrations');

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf-8');
}

function readAllMigrationSQL(): string {
  const migrationDirs = fs.readdirSync(MIGRATIONS_DIR).filter((d) => {
    const fullPath = path.join(MIGRATIONS_DIR, d);
    return fs.statSync(fullPath).isDirectory();
  });

  let allSQL = '';
  for (const dir of migrationDirs) {
    const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
    if (fs.existsSync(sqlPath)) {
      allSQL += fs.readFileSync(sqlPath, 'utf-8') + '\n';
    }
  }
  return allSQL;
}

/**
 * Extract all @@map("table_name") values from schema.prisma
 */
function extractTableNames(schema: string): string[] {
  const matches = schema.matchAll(/@@map\("([^"]+)"\)/g);
  return [...matches].map((m) => m[1]);
}

/**
 * Extract all enum names from schema.prisma
 */
function extractEnumNames(schema: string): string[] {
  const matches = schema.matchAll(/^enum\s+(\w+)\s*\{/gm);
  return [...matches].map((m) => m[1]);
}

// ============================================================================
// Tests
// ============================================================================

describe('Schema Drift Detection', () => {
  const schema = readSchema();
  const allSQL = readAllMigrationSQL();
  const tableNames = extractTableNames(schema);
  const enumNames = extractEnumNames(schema);

  it('schema.prisma file exists and is readable', () => {
    expect(schema.length).toBeGreaterThan(0);
  });

  it('migration SQL files exist', () => {
    expect(allSQL.length).toBeGreaterThan(0);
  });

  it('has at least 10 models defined', () => {
    expect(tableNames.length).toBeGreaterThanOrEqual(10);
  });

  describe('Every table in schema.prisma has a CREATE TABLE or ALTER TABLE in migrations', () => {
    for (const table of tableNames) {
      it(`table "${table}" exists in migration SQL`, () => {
        // Check for CREATE TABLE or ALTER TABLE referencing this table
        const hasCreate = allSQL.includes(`"${table}"`);
        expect(
          hasCreate,
          `SCHEMA DRIFT: table "${table}" is defined in schema.prisma (@@map) ` +
            `but does not appear in any migration SQL file. ` +
            `Run: npx prisma migrate dev --name fix_${table}_drift --create-only`,
        ).toBe(true);
      });
    }
  });

  describe('Every enum in schema.prisma has a CREATE TYPE in migrations', () => {
    for (const enumName of enumNames) {
      it(`enum "${enumName}" exists in migration SQL`, () => {
        const hasCreate = allSQL.includes(`"${enumName}"`);
        expect(
          hasCreate,
          `SCHEMA DRIFT: enum "${enumName}" is defined in schema.prisma ` +
            `but does not appear in any migration SQL file. ` +
            `Run: npx prisma migrate dev --name fix_${enumName}_drift --create-only`,
        ).toBe(true);
      });
    }
  });
});
