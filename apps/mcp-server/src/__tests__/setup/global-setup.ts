/**
 * Global Test Setup
 * Runs once before all tests
 */

export async function setup() {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.MCP_SERVER_STDIO_PORT = '3901'; // Different ports for testing
  process.env.MCP_SERVER_EXPRESS_PORT = '3902';
  process.env.DATABASE_HOST = 'localhost';
  process.env.DATABASE_PORT = '5432';
  process.env.DATABASE_NAME = 'ectropy_test';
  process.env.DATABASE_USER = 'postgres';
  process.env.DATABASE_PASSWORD = 'postgres';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.VALIDATION_ONLY = 'true'; // Run tests in validation-only mode (no DB required)
  process.env.MCP_API_KEY = 'test-api-key-for-testing-purposes-only-min-32-chars';
  process.env.REQUIRE_API_KEY = 'false'; // Don't require API key in tests
  process.env.ENABLE_RATE_LIMITING = 'false'; // Disable rate limiting in tests

  console.log('🧪 Test Environment Initialized');
  console.log('   Stdio Port: 3901');
  console.log('   Express Port: 3902');
  console.log('   Validation Only: true');
}

export async function teardown() {
  console.log('🧹 Test Environment Cleanup Complete');
}
