/**
 * Schema Migration Runner
 *
 * Transforms data between schema versions with validation and rollback support.
 *
 * Usage:
 *   npx ts-node scripts/schema-migration/migrate.ts <schema> <from> <to> [--dry-run]
 *
 * Examples:
 *   npx ts-node scripts/schema-migration/migrate.ts consequence v1 v3 --dry-run
 *   npx ts-node scripts/schema-migration/migrate.ts voxel v1 v3
 *
 * @see .roadmap/ALIGNMENT_ANALYSIS.json GAP-012
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Types
interface MigrationResult {
  success: boolean;
  sourceVersion: string;
  targetVersion: string;
  recordsProcessed: number;
  recordsFailed: number;
  errors: string[];
  backupPath?: string;
}

interface MigrationFunction<TSource, TTarget> {
  (source: TSource): TTarget;
}

interface Migration {
  name: string;
  sourceVersion: string;
  targetVersion: string;
  schema: string;
  migrate: MigrationFunction<unknown, unknown>;
  validate: (data: unknown) => boolean;
}

// Registry of available migrations
const migrations: Map<string, Migration> = new Map();

/**
 * Register a migration
 */
export function registerMigration(migration: Migration): void {
  const key = `${migration.schema}-${migration.sourceVersion}-${migration.targetVersion}`;
  migrations.set(key, migration);
  console.log(`Registered migration: ${key}`);
}

/**
 * Get a migration by schema and versions
 */
export function getMigration(schema: string, from: string, to: string): Migration | undefined {
  return migrations.get(`${schema}-${from}-${to}`);
}

/**
 * List available migrations
 */
export function listMigrations(): string[] {
  return Array.from(migrations.keys());
}

/**
 * Create a backup before migration
 */
export function createBackup(filePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(path.dirname(filePath), '.migration-backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.backup`);
  fs.copyFileSync(filePath, backupPath);

  console.log(`Created backup: ${backupPath}`);
  return backupPath;
}

/**
 * Restore from backup
 */
export function restoreBackup(backupPath: string, originalPath: string): void {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${backupPath}`);
  }

  fs.copyFileSync(backupPath, originalPath);
  console.log(`Restored from backup: ${backupPath}`);
}

/**
 * Run a migration on a file
 */
export async function runMigration(
  schema: string,
  fromVersion: string,
  toVersion: string,
  inputPath: string,
  outputPath?: string,
  dryRun = false
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    sourceVersion: fromVersion,
    targetVersion: toVersion,
    recordsProcessed: 0,
    recordsFailed: 0,
    errors: [],
  };

  // Find migration
  const migration = getMigration(schema, fromVersion, toVersion);
  if (!migration) {
    result.errors.push(`No migration found for ${schema} ${fromVersion} -> ${toVersion}`);
    return result;
  }

  // Read input
  if (!fs.existsSync(inputPath)) {
    result.errors.push(`Input file not found: ${inputPath}`);
    return result;
  }

  const inputData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  // Create backup (unless dry run)
  if (!dryRun && outputPath === inputPath) {
    result.backupPath = createBackup(inputPath);
  }

  // Handle array vs single object
  const isArray = Array.isArray(inputData);
  const items = isArray ? inputData : [inputData];

  const migratedItems: unknown[] = [];

  for (const item of items) {
    try {
      const migrated = migration.migrate(item);

      // Validate output
      if (!migration.validate(migrated)) {
        result.recordsFailed++;
        result.errors.push(`Validation failed for item: ${JSON.stringify(item).slice(0, 100)}...`);
        continue;
      }

      migratedItems.push(migrated);
      result.recordsProcessed++;
    } catch (err) {
      result.recordsFailed++;
      result.errors.push(`Migration error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Write output (unless dry run)
  if (!dryRun) {
    const output = isArray ? migratedItems : migratedItems[0];
    const finalPath = outputPath || inputPath;
    fs.writeFileSync(finalPath, JSON.stringify(output, null, 2));
    console.log(`Wrote migrated data to: ${finalPath}`);
  } else {
    console.log('\n=== DRY RUN - No files modified ===\n');
    console.log('Sample migrated output:');
    console.log(JSON.stringify(migratedItems[0], null, 2).slice(0, 500) + '...');
  }

  result.success = result.recordsFailed === 0;
  return result;
}

/**
 * Create a schema validator using AJV
 */
export function createValidator(schemaPath: string): (data: unknown) => boolean {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  return ajv.compile(schema);
}

/**
 * Generate URN from legacy ID
 */
export function generateUrn(venture: string, nodeType: string, id: string): string {
  return `urn:luhtech:${venture}:${nodeType}:${id}`;
}

/**
 * Add graph metadata to an entity
 */
export function addGraphMetadata(
  entity: Record<string, unknown>,
  nodeType: string,
  inEdges: Array<{ type: string; target: string }> = [],
  outEdges: Array<{ type: string; target: string }> = []
): Record<string, unknown> {
  return {
    ...entity,
    graphMetadata: {
      nodeType,
      inEdges,
      outEdges,
    },
  };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3 || args.includes('--help')) {
    console.log(`
Schema Migration Tool

Usage:
  npx ts-node scripts/schema-migration/migrate.ts <schema> <from> <to> [options]

Options:
  --input <path>   Input file path (required)
  --output <path>  Output file path (default: same as input)
  --dry-run        Preview migration without writing files
  --list           List available migrations

Examples:
  npx ts-node scripts/schema-migration/migrate.ts consequence v1 v3 --input data.json --dry-run
  npx ts-node scripts/schema-migration/migrate.ts --list
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  if (args.includes('--list')) {
    console.log('Available migrations:');
    listMigrations().forEach(m => console.log(`  - ${m}`));
    process.exit(0);
  }

  // Load migrations
  const migrationsDir = path.join(__dirname, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .forEach(f => require(path.join(migrationsDir, f)));
  }

  const [schema, from, to] = args;
  const dryRun = args.includes('--dry-run');
  const inputIdx = args.indexOf('--input');
  const outputIdx = args.indexOf('--output');

  const inputPath = inputIdx !== -1 ? args[inputIdx + 1] : undefined;
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : inputPath;

  if (!inputPath) {
    console.error('Error: --input is required');
    process.exit(1);
  }

  runMigration(schema, from, to, inputPath, outputPath, dryRun)
    .then(result => {
      console.log('\n=== Migration Result ===');
      console.log(`Success: ${result.success}`);
      console.log(`Records processed: ${result.recordsProcessed}`);
      console.log(`Records failed: ${result.recordsFailed}`);
      if (result.backupPath) {
        console.log(`Backup: ${result.backupPath}`);
      }
      if (result.errors.length > 0) {
        console.log('Errors:');
        result.errors.forEach(e => console.log(`  - ${e}`));
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

export { MigrationResult, Migration, MigrationFunction };
