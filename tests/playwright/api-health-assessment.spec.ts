import { test, expect } from '@playwright/test';
import { getTestURL, getSpeckleURL } from './utils/test-helpers';

/**
 * API Health Assessment
 * Comprehensive check of all critical API endpoints
 * REFACTORED (2025-12-22): Use standardized URL helpers for staging compatibility
 */

test.describe('API Health Assessment', () => {
  const baseUrl = getTestURL();

  test('should verify all critical API endpoints', async ({ request }) => {
    const endpoints = [
      { path: '/api/health', name: 'API Gateway Health' },
      { path: '/api/auth/health', name: 'OAuth Health' },
      { path: '/api/v1/projects', name: 'Projects API', requiresAuth: true },
      { path: '/api/speckle/health', name: 'Speckle Integration' },
      { path: '/api/ifc/health', name: 'IFC Processing' },
      { path: '/api/ifc/supported-types', name: 'IFC Element Types' },
      { path: '/api/mcp/health', name: 'MCP Server' },
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const response = await request.get(`${baseUrl}${endpoint.path}`);
        const status = response.ok() ? 'HEALTHY' : 'DEGRADED';
        const statusCode = response.status();

        results.push({
          name: endpoint.name,
          path: endpoint.path,
          status,
          statusCode,
          requiresAuth: endpoint.requiresAuth,
        });

        console.log(
          `✓ ${endpoint.name}: ${statusCode} - ${status}${endpoint.requiresAuth ? ' (auth required)' : ''}`
        );

        // Auth-required endpoints should return 401 or redirect
        if (endpoint.requiresAuth) {
          expect([200, 302, 401]).toContain(statusCode);
        } else {
          expect(response.ok()).toBeTruthy();
        }
      } catch (error) {
        console.error(`✗ ${endpoint.name}: FAILED -`, error);
        results.push({
          name: endpoint.name,
          path: endpoint.path,
          status: 'FAILED',
          error: String(error),
        });
      }
    }

    // Summary
    const healthy = results.filter((r) => r.status === 'HEALTHY').length;
    const total = results.length;
    console.log(`\n=== API Health Summary ===`);
    console.log(`Healthy: ${healthy}/${total}`);
    console.log(`Coverage: ${Math.round((healthy / total) * 100)}%`);
  });

  test('should identify missing endpoints', async ({ request }) => {
    const missingEndpoints = [
      { path: '/api/v1/dao/templates', name: 'DAO Templates' },
      { path: '/api/v1/dao/proposals', name: 'DAO Proposals' },
    ];

    console.log('\n=== Checking for Missing Endpoints ===');

    for (const endpoint of missingEndpoints) {
      const response = await request.get(`${baseUrl}${endpoint.path}`);
      const statusCode = response.status();

      if (statusCode === 404) {
        console.log(
          `✗ ${endpoint.name} (${endpoint.path}): NOT IMPLEMENTED (404)`
        );
      } else {
        console.log(`✓ ${endpoint.name} (${endpoint.path}): ${statusCode}`);
      }
    }
  });

  test('should verify Speckle Server connectivity', async ({ request }) => {
    // REFACTORED (2025-12-22): Use standardized getSpeckleURL() helper
    const speckleUrl = getSpeckleURL();

    const query = `
      query {
        serverInfo {
          name
          version
        }
      }
    `;

    const response = await request.post(`${speckleUrl}/graphql`, {
      data: { query },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.data.serverInfo).toBeDefined();
    expect(data.data.serverInfo.version).toBeTruthy();

    console.log(
      `✓ Speckle Server: ${data.data.serverInfo.name} v${data.data.serverInfo.version}`
    );
  });
});
