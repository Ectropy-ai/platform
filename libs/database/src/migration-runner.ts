/**
 * Automated Database Migration Runner for Ectropy Platform
 * Handles PostgreSQL migrations with transaction safety and rollback support
 */

import { Pool, PoolClient } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

export interface Migration {
  id: string;
  name: string;
  filepath: string;
  checksum: string;
  appliedAt?: Date;
  executionTime?: number;
}

export interface MigrationResult {
  success: boolean;
  migrationsApplied: number;
  migrationsSkipped: number;
  totalTime: number;
  appliedMigrations: Migration[];
  errors: string[];
}

export class DatabaseMigrationRunner {
  private pool: Pool;
  private migrationsDir: string;
  private tableName: string;

  constructor(connectionString?: string, migrationsDir?: string) {
    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.migrationsDir = migrationsDir || path.join(process.cwd(), 'migrations');
    this.tableName = 'schema_migrations';
  }

  /**
   * Run all pending migrations
   */
  public async runMigrations(): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migrationsApplied: 0,
      migrationsSkipped: 0,
      totalTime: 0,
      appliedMigrations: [],
      errors: [],
    };

    let client: PoolClient | null = null;

    try {
      console.log('🔄 Starting database migrations...');
      
      client = await this.pool.connect();
      
      // Ensure migrations table exists
      await this.createMigrationsTable(client);
      
      // Get all migration files
      const availableMigrations = await this.loadMigrationFiles();
      console.log(`📂 Found ${availableMigrations.length} migration files`);
      
      // Get applied migrations
      const appliedMigrations = await this.getAppliedMigrations(client);
      const appliedIds = new Set(appliedMigrations.map(m => m.id));
      
      // Filter pending migrations
      const pendingMigrations = availableMigrations.filter(m => !appliedIds.has(m.id));
      console.log(`⏳ ${pendingMigrations.length} migrations pending`);
      
      if (pendingMigrations.length === 0) {
        console.log('✅ No pending migrations');
        result.success = true;
        result.totalTime = Date.now() - startTime;
        return result;
      }

      // Apply migrations in transaction
      await client.query('BEGIN');
      
      try {
        for (const migration of pendingMigrations) {
          console.log(`🔧 Applying migration: ${migration.name}`);
          
          const migrationStartTime = Date.now();
          const sql = await fs.readFile(migration.filepath, 'utf8');
          
          // Execute migration SQL
          await client.query(sql);
          
          const executionTime = Date.now() - migrationStartTime;
          
          // Record migration
          await this.recordMigration(client, migration, executionTime);
          
          migration.appliedAt = new Date();
          migration.executionTime = executionTime;
          result.appliedMigrations.push(migration);
          result.migrationsApplied++;
          
          console.log(`✅ Applied migration: ${migration.name} (${executionTime}ms)`);
        }
        
        await client.query('COMMIT');
        console.log(`🎉 Successfully applied ${result.migrationsApplied} migrations`);
        result.success = true;
        
      } catch (error) {
        await client.query('ROLLBACK');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(errorMessage);
        console.error('❌ Migration failed, rolled back:', errorMessage);
        throw error;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMessage);
      console.error('❌ Migration runner failed:', errorMessage);
    } finally {
      if (client) {
        client.release();
      }
      result.totalTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Get migration status
   */
  public async getMigrationStatus(): Promise<{
    available: Migration[];
    applied: Migration[];
    pending: Migration[];
  }> {
    let client: PoolClient | null = null;
    
    try {
      client = await this.pool.connect();
      
      // Ensure migrations table exists
      await this.createMigrationsTable(client);
      
      const available = await this.loadMigrationFiles();
      const applied = await this.getAppliedMigrations(client);
      const appliedIds = new Set(applied.map(m => m.id));
      const pending = available.filter(m => !appliedIds.has(m.id));
      
      return { available, applied, pending };
      
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Rollback last migration
   */
  public async rollbackLastMigration(): Promise<boolean> {
    let client: PoolClient | null = null;
    
    try {
      client = await this.pool.connect();
      
      // Get last applied migration
      const lastMigration = await client.query(
        `SELECT * FROM ${this.tableName} ORDER BY applied_at DESC LIMIT 1`
      );
      
      if (lastMigration.rows.length === 0) {
        console.log('ℹ️ No migrations to rollback');
        return false;
      }
      
      const migration = lastMigration.rows[0];
      console.log(`⏪ Rolling back migration: ${migration.name}`);
      
      // Look for rollback file
      const rollbackFile = migration.filepath.replace('.sql', '.rollback.sql');
      
      try {
        const rollbackSQL = await fs.readFile(rollbackFile, 'utf8');
        
        await client.query('BEGIN');
        
        // Execute rollback
        await client.query(rollbackSQL);
        
        // Remove from migrations table
        await client.query(
          `DELETE FROM ${this.tableName} WHERE id = $1`,
          [migration.id]
        );
        
        await client.query('COMMIT');
        
        console.log(`✅ Successfully rolled back: ${migration.name}`);
        return true;
        
      } catch (rollbackError) {
        await client.query('ROLLBACK');
        console.error('❌ Rollback failed:', rollbackError);
        throw rollbackError;
      }
      
    } catch (error) {
      console.error('❌ Rollback operation failed:', error);
      return false;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Validate database connection
   */
  public async validateConnection(): Promise<boolean> {
    let client: PoolClient | null = null;
    
    try {
      client = await this.pool.connect();
      await client.query('SELECT 1');
      console.log('✅ Database connection valid');
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      return false;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Create the migrations tracking table
   */
  private async createMigrationsTable(client: PoolClient): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(255) NOT NULL,
        filepath VARCHAR(500) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        execution_time_ms INTEGER NOT NULL DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_applied_at 
      ON ${this.tableName} (applied_at);
    `;
    
    await client.query(createTableSQL);
  }

  /**
   * Load migration files from directory
   */
  private async loadMigrationFiles(): Promise<Migration[]> {
    try {
      const files = await fs.readdir(this.migrationsDir);
      const migrationFiles = files
        .filter(file => file.endsWith('.sql') && !file.endsWith('.rollback.sql'))
        .sort();
      
      const migrations: Migration[] = [];
      
      for (const file of migrationFiles) {
        const filepath = path.join(this.migrationsDir, file);
        const content = await fs.readFile(filepath, 'utf8');
        const checksum = createHash('sha256').update(content).digest('hex');
        
        // Extract ID from filename (format: YYYYMMDD_HHMMSS_description.sql)
        const id = file.replace('.sql', '');
        const name = id.split('_').slice(2).join('_').replace(/_/g, ' ');
        
        migrations.push({
          id,
          name,
          filepath,
          checksum,
        });
      }
      
      return migrations;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log(`📁 Creating migrations directory: ${this.migrationsDir}`);
        await fs.mkdir(this.migrationsDir, { recursive: true });
        return [];
      }
      throw error;
    }
  }

  /**
   * Get applied migrations from database
   */
  private async getAppliedMigrations(client: PoolClient): Promise<Migration[]> {
    const result = await client.query(
      `SELECT * FROM ${this.tableName} ORDER BY applied_at`
    );
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      filepath: row.filepath,
      checksum: row.checksum,
      appliedAt: row.applied_at,
      executionTime: row.execution_time_ms,
    }));
  }

  /**
   * Record applied migration
   */
  private async recordMigration(
    client: PoolClient, 
    migration: Migration, 
    executionTime: number
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${this.tableName} 
       (id, name, checksum, filepath, execution_time_ms) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        migration.id,
        migration.name,
        migration.checksum,
        migration.filepath,
        executionTime,
      ]
    );
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    await this.pool.end();
    console.log('✅ Database migration runner shutdown complete');
  }
}

/**
 * CLI interface for migrations
 */
export async function runMigrationsCLI(): Promise<void> {
  const runner = new DatabaseMigrationRunner();
  
  try {
    // Validate connection first
    const connectionValid = await runner.validateConnection();
    if (!connectionValid) {
      console.error('❌ Cannot connect to database. Check your DATABASE_URL environment variable.');
      process.exit(1);
    }
    
    // Check command line arguments
    const command = process.argv[2];
    
    switch (command) {
      case 'status':
        const status = await runner.getMigrationStatus();
        console.log('\n📊 Migration Status:');
        console.log(`   Available: ${status.available.length}`);
        console.log(`   Applied: ${status.applied.length}`);
        console.log(`   Pending: ${status.pending.length}`);
        
        if (status.pending.length > 0) {
          console.log('\n⏳ Pending migrations:');
          status.pending.forEach(m => console.log(`   • ${m.name}`));
        }
        break;
        
      case 'rollback':
        const rollbackSuccess = await runner.rollbackLastMigration();
        if (!rollbackSuccess) {
          process.exit(1);
        }
        break;
        
      case 'run':
      default:
        const result = await runner.runMigrations();
        if (!result.success) {
          console.error('❌ Migrations failed:', result.errors);
          process.exit(1);
        }
        break;
    }
    
  } catch (error) {
    console.error('❌ Migration CLI failed:', error);
    process.exit(1);
  } finally {
    await runner.shutdown();
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  runMigrationsCLI();
}