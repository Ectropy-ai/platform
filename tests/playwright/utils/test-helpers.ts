/**
 * ENTERPRISE TEST UTILITIES
 *
 * Reusable test helpers for:
 * - API testing with proper authentication
 * - Health check validation
 * - Performance measurement
 * - Security validation
 * - Database state management
 *
 * Design Principles:
 * - Type-safe (full TypeScript)
 * - Reusable across test files
 * - Observable (detailed logging available)
 * - Self-documenting
 */

import { expect, Page, APIRequestContext } from '@playwright/test';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface HealthCheckResponse {
  status: string;
  timestamp?: string;
  uptime?: number;
  version?: string;
  [key: string]: any;
}

export interface PerformanceMetrics {
  responseTime: number;
  startTime: number;
  endTime: number;
  statusCode: number;
  url: string;
}

export interface SecurityHeaders {
  'x-frame-options'?: string;
  'x-content-type-options'?: string;
  'x-xss-protection'?: string;
  'strict-transport-security'?: string;
  'content-security-policy'?: string;
}

export interface TestUser {
  email: string;
  password: string;
  roles: string[];
}

// =============================================================================
// URL RESOLUTION UTILITIES
// =============================================================================

/**
 * Get test URL for the specified path
 * Uses PLAYWRIGHT_BASE_URL if set, falls back to localhost
 *
 * This function enables tests to run against both local and remote environments
 * by respecting the PLAYWRIGHT_BASE_URL environment variable.
 *
 * @param path - URL path (e.g., '/dashboard', '/architect')
 * @returns Full URL (e.g., 'https://staging.ectropy.ai/dashboard')
 *
 * @example
 * ```typescript
 * // Local development (PLAYWRIGHT_BASE_URL not set)
 * const url = getTestURL('/dashboard');
 * // Returns: 'http://localhost:3000/dashboard'
 *
 * // Staging validation (PLAYWRIGHT_BASE_URL=https://staging.ectropy.ai)
 * const url = getTestURL('/dashboard');
 * // Returns: 'https://staging.ectropy.ai/dashboard'
 * ```
 */
export function getTestURL(path: string = ''): string {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

  // Handle empty path
  if (!path) {
    return baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
  }

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Remove trailing slash from baseURL
  const normalizedBase = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;

  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Get API URL for the specified endpoint
 * Uses PLAYWRIGHT_BASE_URL if set, falls back to localhost:4000
 *
 * On staging/production/dev-server, API is accessible via nginx on port 80.
 * On local Docker, API runs on port 4000.
 *
 * ENTERPRISE FIX (2026-01-01): Added support for dev server IP addresses
 * - Dev server: 146.190.42.28 → http://146.190.42.28:4000
 * - Staging: staging.ectropy.ai → https://staging.ectropy.ai/api/...
 * - Local: localhost → http://localhost:4000
 *
 * @param endpoint - API endpoint (e.g., '/api/v1/projects', '/health')
 * @returns Full API URL
 *
 * @example
 * ```typescript
 * // Local Docker
 * const url = getAPIURL('/api/v1/projects');
 * // Returns: 'http://localhost:4000/api/v1/projects'
 *
 * // Dev server (IP) - nginx reverse proxy on port 80
 * const url = getAPIURL('/v1/projects');  // PLAYWRIGHT_BASE_URL=http://146.190.42.28
 * // Returns: 'http://146.190.42.28/api/v1/projects' (/api prefix added automatically)
 *
 * // Staging (domain) - nginx reverse proxy on port 443
 * const url = getAPIURL('/v1/projects');  // PLAYWRIGHT_BASE_URL=https://staging.ectropy.ai
 * // Returns: 'https://staging.ectropy.ai/api/v1/projects' (/api prefix added automatically)
 *
 * // For API request context baseURL (no endpoint)
 * const baseURL = getAPIURL();  // PLAYWRIGHT_BASE_URL=http://146.190.42.28
 * // Returns: 'http://146.190.42.28/api' (ready for appending paths like /v1/projects)
 * ```
 */
export function getAPIURL(endpoint: string = ''): string {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

  // ENTERPRISE PATTERN: All remote environments use nginx reverse proxy with /api prefix
  // - Staging/Production (staging.ectropy.ai) → https://staging.ectropy.ai/api/*
  // - Dev server (146.190.42.28) → http://146.190.42.28/api/*
  // - Local Docker → http://localhost:4000/* (direct access, no /api prefix)

  const isLocalhost =
    baseURL.includes('localhost') || baseURL.includes('127.0.0.1');

  if (!isLocalhost) {
    // Remote environment: Use nginx routing with /api prefix
    const normalizedBase = baseURL.endsWith('/')
      ? baseURL.slice(0, -1)
      : baseURL;

    if (!endpoint) {
      // Return base URL with /api for use as API request context baseURL
      return `${normalizedBase}/api`;
    }

    // Return full URL with /api prefix
    const normalizedEndpoint = endpoint.startsWith('/')
      ? endpoint
      : `/${endpoint}`;
    return `${normalizedBase}/api${normalizedEndpoint}`;
  }

  // Local Docker: Direct access to API Gateway on port 4000 (no /api prefix)
  if (!endpoint) {
    return 'http://localhost:4000';
  }

  const normalizedEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;
  return `http://localhost:4000${normalizedEndpoint}`;
}

/**
 * Get Speckle URL for the specified path
 * Uses PLAYWRIGHT_BASE_URL if set, falls back to localhost:3001
 *
 * On staging/production, Speckle is accessible under /speckle via nginx.
 * On local development, Speckle runs on port 3001.
 *
 * @param path - Speckle path (e.g., '/graphql', '/projects')
 * @returns Full Speckle URL
 *
 * @example
 * ```typescript
 * // Local development
 * const url = getSpeckleURL('/graphql');
 * // Returns: 'http://localhost:3001/graphql'
 *
 * // Staging
 * const url = getSpeckleURL('/graphql');
 * // Returns: 'https://staging.ectropy.ai/speckle/graphql'
 * ```
 */
export function getSpeckleURL(path: string = ''): string {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

  // If staging/production, Speckle is under /speckle via nginx
  if (
    baseURL.includes('staging.ectropy.ai') ||
    baseURL.includes('ectropy.ai')
  ) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const normalizedBase = baseURL.endsWith('/')
      ? baseURL.slice(0, -1)
      : baseURL;
    return `${normalizedBase}/speckle${normalizedPath}`;
  }

  // Local development: Speckle on port 3001
  if (!path) {
    return 'http://localhost:3001';
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `http://localhost:3001${normalizedPath}`;
}

/**
 * Get MCP Server URL for the specified path
 * Uses PLAYWRIGHT_BASE_URL if set, falls back to localhost:3001
 *
 * On staging/production, MCP is accessible under /mcp via nginx (if configured).
 * On local development, MCP runs on port 3001.
 *
 * @param path - MCP path (e.g., '/health', '/graphql')
 * @returns Full MCP URL
 *
 * @example
 * ```typescript
 * // Local development
 * const url = getMCPURL('/health');
 * // Returns: 'http://localhost:3001/health'
 *
 * // Staging
 * const url = getMCPURL('/health');
 * // Returns: 'https://staging.ectropy.ai/mcp/health'
 * ```
 */
export function getMCPURL(path: string = ''): string {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

  // If staging/production, MCP is under /mcp via nginx
  if (
    baseURL.includes('staging.ectropy.ai') ||
    baseURL.includes('ectropy.ai')
  ) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const normalizedBase = baseURL.endsWith('/')
      ? baseURL.slice(0, -1)
      : baseURL;
    return `${normalizedBase}/mcp${normalizedPath}`;
  }

  // Local development: MCP on port 3001
  if (!path) {
    return 'http://localhost:3001';
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `http://localhost:3001${normalizedPath}`;
}

// =============================================================================
// HEALTH CHECK UTILITIES
// =============================================================================

/**
 * Check if a service is healthy
 */
export async function checkServiceHealth(
  request: APIRequestContext,
  url: string,
  expectedStatus: string = 'healthy'
): Promise<{ healthy: boolean; response?: HealthCheckResponse }> {
  try {
    const response = await request.get(url);

    if (!response.ok()) {
      return { healthy: false };
    }

    const data: HealthCheckResponse = await response.json();

    const healthy =
      data.status === expectedStatus ||
      data.status === 'ok' ||
      data.status === 'healthy';

    return { healthy, response: data };
  } catch (error) {
    console.error(`Health check failed for ${url}:`, error);
    return { healthy: false };
  }
}

/**
 * Wait for service to become healthy (with retries)
 */
export async function waitForServiceHealth(
  request: APIRequestContext,
  url: string,
  options: {
    maxAttempts?: number;
    intervalMs?: number;
    expectedStatus?: string;
  } = {}
): Promise<void> {
  const {
    maxAttempts = 30,
    intervalMs = 2000,
    expectedStatus = 'healthy',
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { healthy } = await checkServiceHealth(request, url, expectedStatus);

    if (healthy) {
      return;
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `Service ${url} failed to become healthy after ${maxAttempts} attempts`
  );
}

// =============================================================================
// PERFORMANCE MONITORING
// =============================================================================

/**
 * Measure API response time
 */
export async function measureResponseTime(
  request: APIRequestContext,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  options?: {
    headers?: Record<string, string>;
    data?: any;
  }
): Promise<PerformanceMetrics> {
  const startTime = Date.now();

  const response = await request.fetch(url, {
    method,
    headers: options?.headers,
    data: options?.data,
  });

  const endTime = Date.now();
  const responseTime = endTime - startTime;

  return {
    responseTime,
    startTime,
    endTime,
    statusCode: response.status(),
    url,
  };
}

/**
 * Assert response time is within acceptable threshold
 */
export async function assertPerformance(
  metrics: PerformanceMetrics,
  thresholdMs: number,
  message?: string
): Promise<void> {
  expect(
    metrics.responseTime,
    message ||
      `Response time ${metrics.responseTime}ms should be < ${thresholdMs}ms`
  ).toBeLessThan(thresholdMs);
}

// =============================================================================
// SECURITY VALIDATION
// =============================================================================

/**
 * Validate security headers are present
 */
export async function validateSecurityHeaders(
  request: APIRequestContext,
  url: string,
  requiredHeaders: Array<keyof SecurityHeaders> = [
    'x-frame-options',
    'x-content-type-options',
  ]
): Promise<{ valid: boolean; missing: string[]; headers: SecurityHeaders }> {
  const response = await request.get(url);
  const headers = response.headers() as SecurityHeaders;

  const missing: string[] = [];

  for (const headerName of requiredHeaders) {
    if (!headers[headerName]) {
      missing.push(headerName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    headers,
  };
}

/**
 * Test for SQL injection vulnerability
 */
export async function testSQLInjection(
  request: APIRequestContext,
  endpoint: string,
  paramName: string = 'id'
): Promise<{ vulnerable: boolean; error?: string }> {
  const sqlPayloads = [
    "' OR '1'='1",
    "1' OR '1'='1' --",
    "' UNION SELECT NULL--",
    '1; DROP TABLE users--',
  ];

  for (const payload of sqlPayloads) {
    try {
      const response = await request.get(
        `${endpoint}?${paramName}=${encodeURIComponent(payload)}`
      );

      // If server returns 500 or includes SQL error messages, potentially vulnerable
      if (response.status() === 500) {
        const body = await response.text();
        if (
          body.includes('SQL') ||
          body.includes('syntax error') ||
          body.includes('mysql') ||
          body.includes('postgres')
        ) {
          return {
            vulnerable: true,
            error: `SQL injection detected with payload: ${payload}`,
          };
        }
      }
    } catch (error) {
      // Connection errors are not SQL injection
      continue;
    }
  }

  return { vulnerable: false };
}

/**
 * Test for XSS vulnerability
 */
export async function testXSS(
  page: Page,
  inputSelector: string,
  xssPayload: string = '<script>alert("XSS")</script>'
): Promise<{ vulnerable: boolean; error?: string }> {
  // Setup alert handler (if XSS succeeds, this will catch it)
  let alertTriggered = false;

  page.on('dialog', async (dialog) => {
    if (dialog.message() === 'XSS') {
      alertTriggered = true;
    }
    await dialog.dismiss();
  });

  try {
    await page.fill(inputSelector, xssPayload);
    await page.waitForTimeout(1000); // Give time for alert to trigger

    if (alertTriggered) {
      return {
        vulnerable: true,
        error: 'XSS vulnerability detected: alert() executed',
      };
    }

    // Also check if script tag is visible in DOM (stored XSS)
    const scriptVisible = await page.locator(inputSelector).evaluate((el) => {
      return el.innerHTML.includes('<script>');
    });

    if (scriptVisible) {
      return {
        vulnerable: true,
        error: 'XSS vulnerability detected: script tag stored in DOM',
      };
    }

    return { vulnerable: false };
  } catch (error) {
    return {
      vulnerable: false,
      error: `Error during XSS test: ${error}`,
    };
  }
}

// =============================================================================
// AUTHENTICATION UTILITIES
// =============================================================================

/**
 * Create mock authenticated session for testing
 * (Bypasses OAuth for E2E tests)
 */
export async function createMockSession(
  request: APIRequestContext,
  user: Partial<TestUser> = {}
): Promise<{ sessionId: string; cookies: string }> {
  const testUser: TestUser = {
    email: user.email || 'test@ectropy.com',
    password: user.password || 'test-password-123',
    roles: user.roles || ['owner', 'admin'],
  };

  // In a real implementation, this would:
  // 1. Create test user in database
  // 2. Generate session token
  // 3. Set session cookie
  //
  // For now, we'll mock this (requires backend support)

  return {
    sessionId: 'mock-session-id-for-testing',
    cookies: 'oauth_session=mock-session-id',
  };
}

/**
 * Make authenticated API request
 */
export async function authenticatedRequest(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  options: {
    sessionId?: string;
    headers?: Record<string, string>;
    data?: any;
  } = {}
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.sessionId) {
    headers['Cookie'] = `oauth_session=${options.sessionId}`;
  }

  const response = await request.fetch(url, {
    method,
    headers,
    data: options.data,
  });

  return response;
}

// =============================================================================
// DATABASE UTILITIES
// =============================================================================

/**
 * Execute SQL query in test database
 */
export async function executeSql(
  query: string,
  database: string = 'ectropy_test'
): Promise<string> {
  const { execSync } = await import('child_process');

  const result = execSync(
    `docker exec ectropy-postgres-test psql -U postgres -d ${database} -c "${query}" -t`,
    { encoding: 'utf-8', stdio: 'pipe' }
  );

  return result.trim();
}

/**
 * Clean database (for test isolation)
 */
export async function cleanDatabase(): Promise<void> {
  try {
    // Drop all tables (cascade)
    await executeSql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    // Run migrations (would need Prisma CLI here)
    // execSync('docker exec ectropy-api-gateway-test npx prisma migrate deploy');
  } catch (error) {
    console.error('Failed to clean database:', error);
    throw error;
  }
}

/**
 * Seed test data
 */
export async function seedTestData(): Promise<void> {
  // In a real implementation, this would:
  // 1. Create test users
  // 2. Create test projects
  // 3. Create test construction elements
  // 4. Set known IDs for testing

  console.log('Seeding test data...');
}

// =============================================================================
// ASSERTION UTILITIES
// =============================================================================

/**
 * Assert API response structure
 */
export function assertApiResponse(
  response: any,
  expectedStructure: Record<string, string>
): void {
  for (const [key, type] of Object.entries(expectedStructure)) {
    expect(response).toHaveProperty(key);
    expect(typeof response[key]).toBe(type);
  }
}

/**
 * Assert paginated response
 */
export function assertPaginatedResponse(response: any): void {
  expect(response).toHaveProperty('data');
  expect(response).toHaveProperty('total');
  expect(response).toHaveProperty('page');
  expect(response).toHaveProperty('pageSize');

  expect(Array.isArray(response.data)).toBe(true);
  expect(typeof response.total).toBe('number');
  expect(typeof response.page).toBe('number');
  expect(typeof response.pageSize).toBe('number');
}

// =============================================================================
// WAIT UTILITIES
// =============================================================================

/**
 * Wait for condition to be true (with timeout)
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    message?: string;
  } = {}
): Promise<void> {
  const {
    timeoutMs = 30000,
    intervalMs = 500,
    message = 'Condition not met',
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`${message} (timeout after ${timeoutMs}ms)`);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // URL Resolution
  getTestURL,
  getAPIURL,
  getSpeckleURL,
  getMCPURL,

  // Health checks
  checkServiceHealth,
  waitForServiceHealth,

  // Performance
  measureResponseTime,
  assertPerformance,

  // Security
  validateSecurityHeaders,
  testSQLInjection,
  testXSS,

  // Authentication
  createMockSession,
  authenticatedRequest,

  // Database
  executeSql,
  cleanDatabase,
  seedTestData,

  // Assertions
  assertApiResponse,
  assertPaginatedResponse,

  // Utilities
  waitForCondition,
};
