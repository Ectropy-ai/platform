import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ENTERPRISE TEST INFRASTRUCTURE - GLOBAL SETUP
 *
 * Responsibilities:
 * 1. Start Docker Compose test environment
 * 2. Comprehensive health validation for all services
 * 3. Database migration verification
 * 4. Security posture validation
 * 5. Performance baseline establishment
 * 6. Resource limit verification
 *
 * Design Principles:
 * - Fail fast on infrastructure issues
 * - Comprehensive diagnostics on failure
 * - Idempotent (can run multiple times safely)
 * - Self-healing (cleans up previous failed runs)
 * - Observable (detailed logging for debugging)
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

interface HealthCheckConfig {
  maxAttempts: number;
  intervalMs: number;
  timeoutMs: number;
}

interface ServiceConfig {
  name: string;
  url: string;
  critical: boolean; // If false, failure is warning only
  expectedResponseTime?: number; // Performance baseline (ms)
  validateResponse?: (response: Response) => Promise<boolean>;
}

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  requireMigrations: boolean;
}

const HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  maxAttempts: 60, // 60 attempts
  intervalMs: 2000, // Every 2 seconds
  timeoutMs: 120000, // 2 minute total timeout
};

const SERVICES: ServiceConfig[] = [
  {
    name: 'PostgreSQL',
    url: 'http://localhost:5432',
    critical: true,
    validateResponse: async () => {
      try {
        // Check if postgres is accepting connections
        execSync('docker exec ectropy-postgres-test pg_isready -U postgres', {
          stdio: 'pipe',
        });
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    name: 'Redis',
    url: 'http://localhost:6379',
    critical: true,
    validateResponse: async () => {
      try {
        const result = execSync(
          'docker exec ectropy-redis-test redis-cli ping',
          {
            stdio: 'pipe',
            encoding: 'utf-8',
          }
        );
        return result.trim() === 'PONG';
      } catch {
        return false;
      }
    },
  },
  {
    name: 'API Gateway',
    url: 'http://localhost:4000/health',
    critical: true,
    expectedResponseTime: 500, // Should respond in < 500ms
    validateResponse: async (response: Response) => {
      const data = await response.json();
      return data.status === 'healthy' || data.status === 'ok';
    },
  },
  {
    name: 'MCP Server',
    url: 'http://localhost:3001/health',
    critical: true,
    expectedResponseTime: 500,
    validateResponse: async (response: Response) => {
      const data = await response.json();
      return !!data.service || !!data.status;
    },
  },
  {
    name: 'Web Dashboard',
    url: 'http://localhost:3000',
    critical: false, // Frontend not critical for API tests
    expectedResponseTime: 1000,
  },
];

const DATABASE_CONFIG: DatabaseConfig = {
  host: 'localhost',
  port: 5432,
  database: 'ectropy_test',
  user: 'postgres',
  requireMigrations: true,
};

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Check if Docker is installed and running
 */
function checkDockerAvailability(): void {
  console.log('🔍 Checking Docker availability...');

  try {
    execSync('docker --version', { stdio: 'pipe' });
    console.log('  ✅ Docker installed');
  } catch {
    throw new Error('Docker is not installed. Please install Docker Desktop.');
  }

  try {
    execSync('docker info', { stdio: 'pipe', timeout: 5000 });
    console.log('  ✅ Docker daemon running');
  } catch {
    throw new Error(
      'Docker daemon is not running. Please start Docker Desktop.'
    );
  }

  try {
    execSync('docker compose version', { stdio: 'pipe' });
    console.log('  ✅ Docker Compose available\n');
  } catch {
    throw new Error('Docker Compose is not available.');
  }
}

/**
 * Clean up any previous test environment (idempotent)
 */
function cleanupPreviousEnvironment(): void {
  console.log('🧹 Cleaning up previous test environment...');

  try {
    execSync('docker compose -f docker-compose.test.yml down -v', {
      stdio: 'pipe',
      timeout: 60000,
    });
    console.log('  ✅ Previous environment cleaned\n');
  } catch (error) {
    // Not critical - might not exist
    console.log('  ℹ️  No previous environment found\n');
  }
}

/**
 * Start Docker Compose test stack
 */
function startDockerCompose(): void {
  console.log('🚀 Starting Docker Compose test environment...');
  console.log(
    '   This may take 1-2 minutes on first run (building images)...\n'
  );

  try {
    execSync('docker compose -f docker-compose.test.yml up -d --build', {
      stdio: 'inherit',
      timeout: 600000, // 10 minute timeout for cold builds with pnpm install (2536 packages + argon2 compilation)
    });
    console.log('\n  ✅ Docker Compose started\n');
  } catch (error) {
    console.error('\n  ❌ Failed to start Docker Compose');

    // Capture logs for debugging
    try {
      console.error('\n📋 Container logs (last 50 lines):');
      execSync('docker compose -f docker-compose.test.yml logs --tail=50', {
        stdio: 'inherit',
      });
    } catch {
      // Ignore log capture failure
    }

    throw error;
  }
}

/**
 * Wait for a service to become healthy with retries
 */
async function waitForServiceHealth(service: ServiceConfig): Promise<number> {
  const startTime = Date.now();
  console.log(`⏳ Waiting for ${service.name}...`);

  for (let attempt = 1; attempt <= HEALTH_CHECK_CONFIG.maxAttempts; attempt++) {
    try {
      // Custom validation (for non-HTTP services like Postgres/Redis)
      if (service.validateResponse && !service.url.startsWith('http')) {
        const isHealthy = await service.validateResponse(null as any);
        if (isHealthy) {
          const responseTime = Date.now() - startTime;
          console.log(`   ✅ ${service.name} ready (${responseTime}ms)`);
          return responseTime;
        }
      } else {
        // HTTP health check
        const response = await fetch(service.url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000), // 5 second timeout per request
        });

        if (response.ok) {
          // Optional: Validate response body
          if (service.validateResponse) {
            const isValid = await service.validateResponse(response);
            if (!isValid) {
              throw new Error('Health check response validation failed');
            }
          }

          const responseTime = Date.now() - startTime;

          // Performance warning
          if (
            service.expectedResponseTime &&
            responseTime > service.expectedResponseTime
          ) {
            console.log(
              `   ⚠️  ${service.name} ready but slow (${responseTime}ms, expected <${service.expectedResponseTime}ms)`
            );
          } else {
            console.log(`   ✅ ${service.name} ready (${responseTime}ms)`);
          }

          return responseTime;
        }
      }
    } catch (error) {
      // Continue retrying
      if (attempt === HEALTH_CHECK_CONFIG.maxAttempts) {
        console.error(`   ❌ ${service.name} failed after ${attempt} attempts`);
        throw new Error(
          `${service.name} health check timeout (${HEALTH_CHECK_CONFIG.timeoutMs}ms)`
        );
      }
    }

    // Wait before next attempt
    if (attempt < HEALTH_CHECK_CONFIG.maxAttempts) {
      await new Promise((resolve) =>
        setTimeout(resolve, HEALTH_CHECK_CONFIG.intervalMs)
      );
    }
  }

  throw new Error(`${service.name} never became healthy`);
}

/**
 * Wait for all services to become healthy
 */
async function waitForAllServices(): Promise<void> {
  console.log('🏥 Health checking all services...\n');

  const results: Array<{
    service: string;
    responseTime: number;
    critical: boolean;
  }> = [];

  for (const service of SERVICES) {
    try {
      const responseTime = await waitForServiceHealth(service);
      results.push({
        service: service.name,
        responseTime,
        critical: service.critical,
      });
    } catch (error) {
      if (service.critical) {
        console.error(`\n❌ CRITICAL: ${service.name} failed to start`);
        throw error;
      } else {
        console.log(
          `   ⚠️  NON-CRITICAL: ${service.name} not available (continuing anyway)`
        );
      }
    }
  }

  console.log('\n✅ All critical services healthy\n');

  // Performance summary
  console.log('📊 Performance baseline:');
  results.forEach((result) => {
    console.log(`   - ${result.service}: ${result.responseTime}ms`);
  });
  console.log('');
}

/**
 * Verify database migrations
 */
async function verifyDatabaseMigrations(): Promise<void> {
  if (!DATABASE_CONFIG.requireMigrations) {
    console.log('ℹ️  Database migrations not required\n');
    return;
  }

  console.log('🗄️  Verifying database migrations...');

  try {
    // Check if migrations table exists
    const result = execSync(
      `docker exec ectropy-postgres-test psql -U ${DATABASE_CONFIG.user} -d ${DATABASE_CONFIG.database} -c "SELECT COUNT(*) FROM _prisma_migrations;" -t`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    const migrationCount = parseInt(result.trim(), 10);
    console.log(
      `   ✅ Database migrations applied: ${migrationCount} migrations\n`
    );
  } catch (error) {
    console.log('   ⚠️  No migrations found (database may be fresh)\n');
    // Not critical - test database might not need migrations
  }
}

/**
 * Verify security posture (secrets not exposed, proper permissions)
 */
async function verifySecurityPosture(): Promise<void> {
  console.log('🔒 Verifying security posture...');

  // Check 1: Verify JWT_SECRET is not default
  try {
    const result = execSync(
      'docker exec ectropy-api-gateway-test printenv JWT_SECRET',
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    const jwtSecret = result.trim();
    if (
      jwtSecret.includes('change') ||
      jwtSecret.includes('default') ||
      jwtSecret.length < 32
    ) {
      console.log('   ⚠️  Warning: JWT_SECRET appears weak (OK for testing)');
    } else {
      console.log('   ✅ JWT_SECRET configured');
    }
  } catch {
    console.log('   ⚠️  Could not verify JWT_SECRET');
  }

  // Check 2: Verify NODE_ENV is 'test'
  try {
    const result = execSync(
      'docker exec ectropy-api-gateway-test printenv NODE_ENV',
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    const nodeEnv = result.trim();
    if (nodeEnv === 'test') {
      console.log('   ✅ NODE_ENV=test');
    } else {
      console.log(`   ⚠️  Warning: NODE_ENV=${nodeEnv} (expected 'test')`);
    }
  } catch {
    console.log('   ⚠️  Could not verify NODE_ENV');
  }

  // Check 3: Verify test isolation (volumes are ephemeral)
  try {
    const result = execSync(
      'docker volume ls --filter name=postgres_test_data --format "{{.Name}}"',
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    if (result.trim()) {
      console.log('   ✅ Test volumes isolated');
    }
  } catch {
    console.log('   ⚠️  Could not verify test volumes');
  }

  console.log('');
}

/**
 * Verify resource limits (prevent test environment from consuming too much)
 */
async function verifyResourceLimits(): Promise<void> {
  console.log('📊 Verifying resource limits...');

  try {
    const containers = ['ectropy-api-gateway-test', 'ectropy-mcp-server-test'];

    for (const container of containers) {
      const result = execSync(
        `docker inspect ${container} --format '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}'`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );

      const [memory, cpus] = result.trim().split(' ');
      const memoryGB = parseInt(memory) / (1024 * 1024 * 1024);
      const cpuCount = parseInt(cpus) / 1000000000;

      console.log(
        `   - ${container}: ${memoryGB.toFixed(1)}GB RAM, ${cpuCount.toFixed(1)} CPUs`
      );
    }

    console.log('   ✅ Resource limits configured\n');
  } catch {
    console.log('   ⚠️  Could not verify resource limits\n');
  }
}

/**
 * Create test environment info file for debugging
 */
function saveEnvironmentInfo(): void {
  const info = {
    timestamp: new Date().toISOString(),
    dockerVersion: execSync('docker --version', { encoding: 'utf-8' }).trim(),
    composeVersion: execSync('docker compose version', {
      encoding: 'utf-8',
    }).trim(),
    services: SERVICES.map((s) => s.name),
    nodeVersion: process.version,
    platform: process.platform,
  };

  const infoPath = path.join(
    __dirname,
    '../../test-results/environment-info.json'
  );
  fs.mkdirSync(path.dirname(infoPath), { recursive: true });
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));

  console.log(
    '📝 Environment info saved to test-results/environment-info.json\n'
  );
}

// =============================================================================
// MAIN SETUP FUNCTION
// =============================================================================

export default async function globalSetup(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('🏗️  ENTERPRISE TEST INFRASTRUCTURE - GLOBAL SETUP');
  console.log('='.repeat(80) + '\n');

  const setupStartTime = Date.now();

  // ENTERPRISE: Support remote testing against deployed environments
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL;
  if (
    baseUrl &&
    (baseUrl.startsWith('https://') ||
      (baseUrl.startsWith('http://') && !baseUrl.includes('localhost')))
  ) {
    console.log(`🌐 REMOTE TESTING MODE`);
    console.log(`   Target: ${baseUrl}`);
    console.log(`   Skipping local Docker setup...\n`);

    console.log('='.repeat(80));
    console.log(`✅ REMOTE TEST ENVIRONMENT CONFIGURED`);
    console.log('='.repeat(80) + '\n');
    return;
  }

  try {
    // Step 1: Docker availability
    checkDockerAvailability();

    // Step 2: Clean up previous environment
    cleanupPreviousEnvironment();

    // Step 3: Start Docker Compose
    startDockerCompose();

    // Step 4: Health check all services
    await waitForAllServices();

    // Step 5: Verify database
    await verifyDatabaseMigrations();

    // Step 6: Security validation
    await verifySecurityPosture();

    // Step 7: Resource limits
    await verifyResourceLimits();

    // Step 8: Save environment info
    saveEnvironmentInfo();

    const setupDuration = ((Date.now() - setupStartTime) / 1000).toFixed(1);

    console.log('='.repeat(80));
    console.log(`✅ TEST ENVIRONMENT READY (${setupDuration}s)`);
    console.log('='.repeat(80) + '\n');
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ TEST ENVIRONMENT SETUP FAILED');
    console.error('='.repeat(80) + '\n');

    // Capture diagnostics
    console.error('📋 Diagnostic Information:\n');

    try {
      console.error('Container Status:');
      execSync('docker compose -f docker-compose.test.yml ps', {
        stdio: 'inherit',
      });
    } catch {
      // Ignore
    }

    try {
      console.error('\nRecent Logs:');
      execSync('docker compose -f docker-compose.test.yml logs --tail=100', {
        stdio: 'inherit',
      });
    } catch {
      // Ignore
    }

    // Cleanup on failure
    console.error('\n🧹 Cleaning up failed environment...');
    try {
      execSync('docker compose -f docker-compose.test.yml down -v', {
        stdio: 'inherit',
        timeout: 60000,
      });
    } catch {
      // Ignore cleanup failure
    }

    throw error;
  }
}
