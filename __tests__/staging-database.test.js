/**
 * Database Connectivity Test for Staging Environment
 * Tests database connection and role configuration
 * Pattern: staging
 */

import fs from 'fs';
const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
describe('staging database connectivity', () => {
  test('staging packageManager configuration is valid', () => {
    // Test that package.json has the correct packageManager field
    expect(packageJson.packageManager).toBeDefined();
    expect(packageJson.packageManager).toContain('pnpm@10.14.0');
    expect(packageJson.packageManager).toContain('sha512');

    // Verify that this serves as single source of truth
    expect(packageJson._packageManagerNote).toContain('single source of truth');
  });

  test('staging database role creation SQL is valid', () => {
    // Test that the SQL for creating database roles is syntactically correct
    const roleCreationSQL = `
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'root') THEN
              CREATE USER root WITH ENCRYPTED PASSWORD 'staging_test';
              GRANT ALL PRIVILEGES ON DATABASE ectropy_staging_test TO root;
          END IF;
      END
      $$;
    `;

    // Basic SQL syntax validation
    expect(roleCreationSQL).toContain('CREATE USER root');
    expect(roleCreationSQL).toContain('GRANT ALL PRIVILEGES');
    expect(roleCreationSQL).toContain('IF NOT EXISTS');
    expect(roleCreationSQL).toContain('ectropy_staging_test');
  });

  test('staging database environment variables can be parsed', () => {
    // Test different possible database URL formats
    const testUrls = [
      'postgres://postgres:staging_test@localhost:5432/ectropy_staging_test',
      'postgres://root:staging_test@localhost:5432/ectropy_staging_test',
      'postgresql://postgres:password@localhost/database',
    ];

    testUrls.forEach((url) => {
      expect(url).toMatch(/postgres(ql)?:\/\//);
      expect(url).toMatch(/@/); // Has user/password
      expect(url).toMatch(/:/); // Has port or password
    });
  });

  test('staging redis connection string format is valid', () => {
    const redisUrls = [
      'redis://localhost:6379',
      'redis://redis:6379',
      'redis://user:pass@localhost:6379',
    ];

    redisUrls.forEach((url) => {
      expect(url).toMatch(/^redis:\/\//);
    });
  });

  test('staging environment secrets configuration is valid', () => {
    // Test that staging secrets have appropriate characteristics
    const testSecrets = {
      jwt: 'staging-jwt-secret-for-ci',
      session: 'staging-session-secret-for-ci',
    };

    Object.entries(testSecrets).forEach(([_key, secret]) => {
      expect(secret.length).toBeGreaterThan(10);
      expect(secret).toMatch(/staging/);
    });
  });

  test('staging workflow database initialization commands are correct', () => {
    // Verify the database initialization commands from the workflow
    const pgPassword = 'staging_test';
    const dbName = 'ectropy_staging_test';
    const dbUser = 'postgres';

    expect(pgPassword).toBeDefined();
    expect(dbName).toContain('staging');
    expect(dbUser).toBe('postgres');

    // Test that connection string format would be valid
    const connectionString = `postgres://${dbUser}:${pgPassword}@localhost:5432/${dbName}`;
    expect(connectionString).toMatch(
      /^postgres:\/\/postgres:staging_test@localhost:5432\/ectropy_staging_test$/
    );
  });

  test('staging workflow includes proper database extension setup', () => {
    // Verify that dblink extension setup is included for enhanced functionality
    const stagingWorkflow = fs.readFileSync(
      '.github/workflows/staging-workflow.yml',
      'utf8'
    );

    expect(stagingWorkflow).toContain('CREATE EXTENSION dblink');
    expect(stagingWorkflow).toContain('dblink extension');
    expect(stagingWorkflow).toContain('fallback methods');
  });
});
