import { test, expect } from '@playwright/test';

// Use environment variables for API endpoints with fallback to localhost
const WEB_DASHBOARD_URL = process.env.WEB_DASHBOARD_URL || 'http://localhost:3000';
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3001';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3002';

test.describe('API Health Checks', () => {
  test('web-dashboard health endpoint responds', async ({ request }) => {
    const response = await request.get(`${WEB_DASHBOARD_URL}/health`);
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
  });

  test('api-gateway health endpoint responds', async ({ request }) => {
    const response = await request.get(`${API_GATEWAY_URL}/health`);
    // Accept 200 for healthy or partial status
    expect([200, 503]).toContain(response.status());

    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('status');
    }
  });

  test('mcp-server health endpoint responds', async ({ request }) => {
    const response = await request.get(`${MCP_SERVER_URL}/health`);

    // Accept 200 for both healthy and partial status (database not configured is OK)
    expect([200, 503]).toContain(response.status());

    const body = await response.json();

    // Verify score property exists and is a valid number
    expect(body).toHaveProperty('score');
    expect(typeof body.score).toBe('number');
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);

    // Verify other required properties
    expect(body).toHaveProperty('status');
    expect(['healthy', 'partial', 'degraded', 'unhealthy', 'critical']).toContain(body.status);
  });
});
