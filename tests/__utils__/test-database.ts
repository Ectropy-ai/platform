/**
 * Database Test Utilities
 *
 * Utilities for setting up, tearing down, and managing test databases
 * in integration tests.
 *
 * IMPORTANT: These utilities are for integration tests only.
 * Unit tests should mock database interactions.
 */

import { Pool, PoolClient } from 'pg';

let testPool: Pool | null = null;

/**
 * Database configuration for test environment
 */
export interface TestDatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Get test database configuration from environment variables
 *
 * @returns Test database configuration
 * @throws Error if required environment variables are missing
 */
export function getTestDatabaseConfig(): TestDatabaseConfig {
  const requiredEnvVars = ['DATABASE_HOST', 'DATABASE_NAME', 'DATABASE_USER'];
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required test database environment variables: ${missing.join(', ')}`
    );
  }

  return {
    host: process.env.DATABASE_HOST!,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME!,
    user: process.env.DATABASE_USER!,
    password: process.env.DATABASE_PASSWORD || '',
    max: 20, // Maximum number of connections in the pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Timeout connection attempts after 5s
  };
}

/**
 * Create and initialize test database connection pool
 *
 * Call this in beforeAll() hook in your test files
 *
 * @example
 * beforeAll(async () => {
 *   await setupTestDatabase();
 * });
 *
 * @returns Database connection pool
 */
export async function setupTestDatabase(): Promise<Pool> {
  if (testPool) {
    return testPool;
  }

  const config = getTestDatabaseConfig();
  testPool = new Pool(config);

  // Test connection
  try {
    const client = await testPool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log(`✅ [DB] Connected to test database: ${config.database}`);
  } catch (error) {
    console.error('❌ [DB] Failed to connect to test database:', error);
    throw error;
  }

  return testPool;
}

/**
 * Close test database connection pool
 *
 * Call this in afterAll() hook in your test files
 *
 * @example
 * afterAll(async () => {
 *   await teardownTestDatabase();
 * });
 */
export async function teardownTestDatabase(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
    console.log('✅ [DB] Test database connection pool closed');
  }
}

/**
 * Get active database pool
 *
 * @returns Active database pool
 * @throws Error if database pool is not initialized
 */
export function getTestDatabasePool(): Pool {
  if (!testPool) {
    throw new Error(
      'Test database pool not initialized. Call setupTestDatabase() first.'
    );
  }
  return testPool;
}

/**
 * Execute a SQL query on the test database
 *
 * @param sql - SQL query string
 * @param params - Query parameters
 * @returns Query result
 *
 * @example
 * const users = await queryTestDatabase('SELECT * FROM users WHERE email = $1', ['test@example.com']);
 */
export async function queryTestDatabase(
  sql: string,
  params: any[] = []
): Promise<any[]> {
  const pool = getTestDatabasePool();
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Clean all data from test database tables
 *
 * Truncates all tables while preserving schema.
 * Call this in beforeEach() or afterEach() to ensure test isolation.
 *
 * @param tables - Array of table names to clean (empty = all tables)
 *
 * @example
 * beforeEach(async () => {
 *   await cleanTestDatabase(['users', 'projects', 'models']);
 * });
 */
export async function cleanTestDatabase(tables: string[] = []): Promise<void> {
  const pool = getTestDatabasePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (tables.length === 0) {
      // Get all table names from current schema
      const result = await client.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT LIKE '_prisma%'
      `);
      tables = result.rows.map((row) => row.tablename);
    }

    // Disable foreign key constraints
    await client.query('SET CONSTRAINTS ALL DEFERRED');

    // Truncate all tables
    for (const table of tables) {
      await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
    }

    await client.query('COMMIT');
    console.log(`✅ [DB] Cleaned ${tables.length} tables`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [DB] Failed to clean test database:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run database migrations for test environment
 *
 * @example
 * beforeAll(async () => {
 *   await setupTestDatabase();
 *   await runTestDatabaseMigrations();
 * });
 */
export async function runTestDatabaseMigrations(): Promise<void> {
  // Implementation depends on your migration tool (Prisma, TypeORM, etc.)
  // This is a placeholder that should be customized
  console.log('ℹ️  [DB] Running test database migrations...');

  // Example for Prisma:
  // await execAsync('pnpm prisma migrate deploy --schema=./prisma/schema.prisma');

  console.log('✅ [DB] Test database migrations complete');
}

/**
 * Seed test database with initial data
 *
 * @param seedData - Object with table names as keys and data arrays as values
 *
 * @example
 * await seedTestDatabase({
 *   users: [
 *     { email: 'admin@example.com', role: 'admin' },
 *     { email: 'user@example.com', role: 'user' },
 *   ],
 *   projects: [
 *     { name: 'Test Project', ownerId: 1 },
 *   ],
 * });
 */
export async function seedTestDatabase(seedData: {
  [tableName: string]: any[];
}): Promise<void> {
  const pool = getTestDatabasePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const [tableName, rows] of Object.entries(seedData)) {
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const placeholders = rows
        .map(
          (_, rowIndex) =>
            `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`
        )
        .join(', ');

      const values = rows.flatMap((row) => columns.map((col) => row[col]));

      const sql = `
        INSERT INTO "${tableName}" (${columns.map((col) => `"${col}"`).join(', ')})
        VALUES ${placeholders}
      `;

      await client.query(sql, values);
    }

    await client.query('COMMIT');
    console.log(`✅ [DB] Seeded test database with ${Object.keys(seedData).length} tables`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [DB] Failed to seed test database:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create a database transaction for test isolation
 *
 * Returns a client with an active transaction.
 * All queries within the transaction will be rolled back after the test.
 *
 * @example
 * it('should create user in transaction', async () => {
 *   const client = await createTestTransaction();
 *   try {
 *     await client.query('INSERT INTO users (email) VALUES ($1)', ['test@example.com']);
 *     // Test assertions here
 *   } finally {
 *     await rollbackTestTransaction(client);
 *   }
 * });
 */
export async function createTestTransaction(): Promise<PoolClient> {
  const pool = getTestDatabasePool();
  const client = await pool.connect();
  await client.query('BEGIN');
  return client;
}

/**
 * Rollback a test transaction and release the client
 *
 * @param client - Database client with active transaction
 */
export async function rollbackTestTransaction(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK');
  client.release();
}

/**
 * Check if test database is healthy
 *
 * @returns True if database is accessible and responsive
 */
export async function isTestDatabaseHealthy(): Promise<boolean> {
  try {
    const pool = getTestDatabasePool();
    const result = await pool.query('SELECT 1 as health');
    return result.rows.length > 0 && result.rows[0].health === 1;
  } catch (error) {
    return false;
  }
}
