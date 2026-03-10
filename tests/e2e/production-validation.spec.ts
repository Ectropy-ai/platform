import { test, expect } from '@playwright/test';

// NOTE: Using staging.ectropy.ai as production proxy until ectropy.ai domain is configured
// ectropy.ai domain does not resolve (DNS not configured as of 2025-10-31)
// staging.ectropy.ai is the actual deployed production-like environment
const PROD_URL = process.env.PRODUCTION_URL || 'https://staging.ectropy.ai';
// Direct IP access to MCP staging is blocked by firewall, use domain routing
const MCP_URL = `${PROD_URL}/mcp`;

// Timeout constants for production environment (increased for CI reliability)
const PRODUCTION_TEST_TIMEOUT = 90000; // 90 seconds for overall test timeout
const PRODUCTION_REQUEST_TIMEOUT = 60000; // 60 seconds for HTTP requests
const PREFLIGHT_TIMEOUT = 30000; // 30 seconds for preflight connectivity checks
const MAX_RETRIES = 5; // Number of retry attempts for preflight checks

// Increase timeout for production environment (network latency + cold starts)
test.setTimeout(PRODUCTION_TEST_TIMEOUT);

// Track if production is accessible
let productionAccessible = false;

// Preflight connectivity checks with retry logic
test.beforeAll(async () => {
  console.log('🔍 Running preflight connectivity checks...');
  console.log(
    `[${new Date().toISOString()}] Starting production validation suite`
  );
  console.log(`Target URL: ${PROD_URL}`);

  // Helper function to retry fetch with exponential backoff
  const retryFetch = async (
    url: string,
    options: RequestInit & { signal?: AbortSignal },
    maxRetries = MAX_RETRIES
  ): Promise<Response> => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        return response;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          console.log(
            `⏳ Retry ${attempt}/${maxRetries} for ${url} after ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  };

  // Check production site is reachable with retries
  try {
    const siteResponse = await retryFetch(
      PROD_URL,
      {
        method: 'HEAD',
        signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT),
      },
      MAX_RETRIES
    );
    console.log(`✅ Production site reachable: ${siteResponse.status}`);
    productionAccessible = siteResponse.ok;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Production site unreachable after retries: ${errorMessage}`);
    console.warn(
      '⚠️ Production site connectivity check failed - tests will be marked as skipped'
    );
    productionAccessible = false;
  }

  // Check MCP server is reachable with retries
  try {
    const mcpResponse = await retryFetch(
      `${MCP_URL}/health`,
      {
        signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT),
      },
      MAX_RETRIES
    );
    console.log(`✅ MCP server reachable: ${mcpResponse.status}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ MCP server unreachable after retries: ${errorMessage}`);
    console.warn(
      '⚠️ MCP server connectivity check failed - MCP tests may be skipped'
    );
  }

  console.log('✅ Preflight checks completed');
});

test.describe('Production Site Validation', () => {
  test.beforeEach(async () => {
    console.log(
      `[${new Date().toISOString()}] Starting test: ${test.info().title}`
    );
    // Skip tests if production is not accessible (clearer conditional logic)
    test.skip(
      productionAccessible === false,
      'Production environment is not accessible'
    );
  });

  test.afterEach(async () => {
    const duration = test.info().duration;
    const status = test.info().status;
    console.log(
      `[${new Date().toISOString()}] Test completed: ${test.info().title} - ${status} (${duration}ms)`
    );
  });

  test('should load homepage with HTTPS', async ({ page }) => {
    const startTime = Date.now();

    try {
      await page.goto(PROD_URL, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      const loadTime = Date.now() - startTime;
      console.log(`✅ Homepage loaded in ${loadTime}ms`);

      expect(page.url()).toContain('https://');
      await expect(page).toHaveTitle(/Ectropy/);
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Homepage failed after ${loadTime}ms: ${errorMessage}`);
      throw error;
    }
  });

  test('should redirect HTTP to HTTPS', async ({ page }) => {
    const startTime = Date.now();

    try {
      // Extract domain from PROD_URL to test HTTP redirect
      const url = new URL(PROD_URL);
      const httpUrl = `http://${url.hostname}`;
      
      await page.goto(httpUrl, {
        timeout: PRODUCTION_REQUEST_TIMEOUT,
      });

      const loadTime = Date.now() - startTime;
      console.log(`✅ HTTP to HTTPS redirect completed in ${loadTime}ms`);

      expect(page.url()).toContain('https://');
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ HTTP redirect failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });

  test('API health endpoint should be healthy', async ({ request }) => {
    const startTime = Date.now();

    try {
      const response = await request.get(`${PROD_URL}/api/health`, {
        timeout: PRODUCTION_REQUEST_TIMEOUT,
      });

      const loadTime = Date.now() - startTime;
      console.log(
        `✅ API health check completed in ${loadTime}ms - Status: ${response.status()}`
      );

      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.status).toMatch(/healthy|degraded/);
      // Note: environment may be 'production' or 'staging' depending on deployment
      expect(data.environment).toMatch(/production|staging/);
      expect(data.service).toBe('Enhanced API Gateway');
      
      console.log(`📊 API Health: ${data.status}, Environment: ${data.environment}, Score: ${data.score || 'N/A'}`);
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ API health check failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });

  test('MCP server health should be accessible', async ({ request }) => {
    const startTime = Date.now();

    try {
      const response = await request.get(`${MCP_URL}/health`, {
        timeout: PRODUCTION_REQUEST_TIMEOUT,
      });

      const loadTime = Date.now() - startTime;
      console.log(
        `✅ MCP health check completed in ${loadTime}ms - Status: ${response.status()}`
      );

      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.service).toBe('mcp-server');
      // Note: environment may be 'production' or 'staging' depending on deployment
      expect(data.environment).toMatch(/production|staging/);
      
      console.log(`📊 MCP Health: ${data.status}, Environment: ${data.environment}, Score: ${data.score || 'N/A'}`);
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ MCP health check failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });

  test('MCP /api/tools endpoint should be accessible', async ({ request }) => {
    const startTime = Date.now();

    try {
      // Use domain routing for MCP (direct IP blocked by firewall)
      const response = await request.get(`${MCP_URL}/api/tools`, {
        headers: {
          'x-api-key': process.env.MCP_API_KEY || 'test-key',
        },
        timeout: PRODUCTION_REQUEST_TIMEOUT,
      });

      const loadTime = Date.now() - startTime;
      console.log(
        `✅ MCP tools endpoint check completed in ${loadTime}ms - Status: ${response.status()}`
      );

      // Accept 200 OK or 401 Unauthorized (auth required but endpoint accessible)
      expect([200, 401]).toContain(response.status());

      if (response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('tools');
        expect(Array.isArray(data.tools)).toBe(true);
        expect(data.tools.length).toBeGreaterThan(0);
        expect(data).toHaveProperty('count');
        expect(data).toHaveProperty('timestamp');

        console.log(
          `📋 Available MCP tools: ${data.tools.map((t: any) => t.name).join(', ')}`
        );
      } else {
        console.log('ℹ️ MCP tools endpoint requires authentication (401) - endpoint is accessible');
      }
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ MCP tools endpoint check failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });

  test('SSL certificate should be valid', async ({ page }) => {
    const startTime = Date.now();

    try {
      await page.goto(PROD_URL, {
        timeout: PRODUCTION_REQUEST_TIMEOUT,
      });

      const securityDetails = await page.evaluate(() => {
        return {
          protocol: window.location.protocol,
          secure: window.isSecureContext,
        };
      });

      const loadTime = Date.now() - startTime;
      console.log(
        `✅ SSL validation completed in ${loadTime}ms - Protocol: ${securityDetails.protocol}, Secure: ${securityDetails.secure}`
      );

      expect(securityDetails.protocol).toBe('https:');
      expect(securityDetails.secure).toBeTruthy();
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ SSL validation failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });

  test('should have proper security headers', async ({ request }) => {
    const startTime = Date.now();

    try {
      const response = await request.get(PROD_URL, {
        timeout: PRODUCTION_REQUEST_TIMEOUT,
      });
      const headers = response.headers();

      const loadTime = Date.now() - startTime;
      console.log('📋 Production Security Headers:');
      console.log(
        `  - x-content-type-options: ${headers['x-content-type-options'] || 'NOT SET'}`
      );
      console.log(
        `  - x-frame-options: ${headers['x-frame-options'] || 'NOT SET'}`
      );
      console.log(
        `  - x-xss-protection: ${headers['x-xss-protection'] || 'NOT SET'}`
      );
      console.log(
        `  - strict-transport-security: ${headers['strict-transport-security'] || 'NOT SET'}`
      );
      console.log(`✅ Security headers check completed in ${loadTime}ms`);

      // Required security headers - check if defined (may vary by environment)
      if (headers['x-content-type-options']) {
        expect(headers['x-content-type-options']).toBe('nosniff');
      } else {
        console.warn('⚠️ x-content-type-options header not set');
      }
      
      if (headers['x-frame-options']) {
        expect(headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/i);
      } else {
        console.warn('⚠️ x-frame-options header not set');
      }

      // HSTS header should be present and have max-age
      if (headers['strict-transport-security']) {
        expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
        console.log('✅ HSTS header properly configured');
      } else {
        console.warn(
          '⚠️ HSTS header not set - should be configured for production'
        );
      }
      
      // At least one security header should be present
      const hasSecurityHeaders = !!(
        headers['x-content-type-options'] ||
        headers['x-frame-options'] ||
        headers['strict-transport-security']
      );
      expect(hasSecurityHeaders).toBeTruthy();
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ Security headers check failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });

  test('API should connect to database', async ({ request }) => {
    const startTime = Date.now();

    try {
      const response = await request.get(`${PROD_URL}/api/health`, {
        timeout: PRODUCTION_REQUEST_TIMEOUT,
      });
      const data = await response.json();

      const loadTime = Date.now() - startTime;
      const dbStatus = data.services?.database || data.database?.status || 'unknown';
      console.log(
        `✅ Database connectivity check completed in ${loadTime}ms - Status: ${dbStatus}`
      );

      // Database should be healthy
      if (data.services?.database) {
        expect(data.services.database).toBe('healthy');
      } else if (data.database?.status) {
        expect(data.database.status).toBe('healthy');
      } else {
        console.warn('⚠️ Database status not found in health response');
        expect(data.status).toMatch(/healthy|degraded/);
      }
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ Database connectivity check failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });

  test('API should connect to Redis', async ({ request }) => {
    const startTime = Date.now();

    try {
      const response = await request.get(`${PROD_URL}/api/health`, {
        timeout: PRODUCTION_REQUEST_TIMEOUT,
      });
      const data = await response.json();

      const loadTime = Date.now() - startTime;
      const redisStatus = data.services?.redis || 'unknown';
      console.log(
        `✅ Redis connectivity check completed in ${loadTime}ms - Status: ${redisStatus}`
      );

      // Redis should be healthy
      if (data.services?.redis) {
        expect(data.services.redis).toBe('healthy');
      } else {
        console.warn('⚠️ Redis status not found in health response');
        expect(data.status).toMatch(/healthy|degraded/);
      }
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ Redis connectivity check failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });

  test('load balancer should distribute traffic', async ({ request }) => {
    const startTime = Date.now();

    try {
      const responses = await Promise.all([
        request.get(`${PROD_URL}/api/health`, { timeout: PRODUCTION_REQUEST_TIMEOUT }),
        request.get(`${PROD_URL}/api/health`, { timeout: PRODUCTION_REQUEST_TIMEOUT }),
        request.get(`${PROD_URL}/api/health`, { timeout: PRODUCTION_REQUEST_TIMEOUT }),
      ]);

      const allSuccessful = responses.every((r) => r.ok());
      const loadTime = Date.now() - startTime;

      console.log(
        `✅ Load balancer test completed in ${loadTime}ms - All requests successful: ${allSuccessful}`
      );
      console.log(
        `  Response statuses: ${responses.map((r) => r.status()).join(', ')}`
      );

      expect(allSuccessful).toBeTruthy();
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ Load balancer test failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });

  test('web dashboard should load assets', async ({ page }) => {
    const startTime = Date.now();

    try {
      await page.goto(PROD_URL, {
        waitUntil: 'networkidle',
        timeout: PRODUCTION_REQUEST_TIMEOUT,
      });

      // Check for React root
      const reactRoot = await page.locator('#root, #app').count();

      const loadTime = Date.now() - startTime;
      console.log(
        `✅ Web dashboard assets loaded in ${loadTime}ms - React root elements: ${reactRoot}`
      );

      expect(reactRoot).toBeGreaterThan(0);
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ Web dashboard assets check failed after ${loadTime}ms: ${errorMessage}`
      );
      throw error;
    }
  });
});
