import { test, expect } from '@playwright/test';

// Use environment variable for MCP server URL with fallback to localhost
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3002';

test.describe('MCP Server Integration', () => {
  test('MCP health check returns valid score', async ({ request }) => {
    const response = await request.get(`${MCP_SERVER_URL}/health`);

    // Accept 200 for both healthy and partial status
    expect([200, 503]).toContain(response.status());

    const health = await response.json();

    // Verify all expected properties exist
    expect(health).toHaveProperty('score');
    expect(health).toHaveProperty('status');
    expect(typeof health.score).toBe('number');
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);

    // Verify status is one of the expected values (including 'critical' for severe issues)
    expect(['healthy', 'partial', 'degraded', 'unhealthy', 'critical']).toContain(health.status);
  });

  test.skip('MCP endpoints accessible from dashboard', async ({ page, request }) => {
    // SKIP: This test requires authentication implementation
    // Will be enabled once OAuth flow is fully implemented

    // Navigate to dashboard
    await page.goto('/dashboard');

    // Intercept API calls to MCP
    await page.route('**/api/mcp/**', route => route.continue());

    // Trigger action that calls MCP (adjust based on actual UI)
    // await page.click('[data-testid="refresh-metrics"]');

    // Verify MCP responded (adjust based on actual implementation)
    // const response = await page.waitForResponse('**/api/mcp/health');
    // expect(response.ok()).toBeTruthy();
  });

  test.skip('MCP status displayed in UI', async ({ page }) => {
    // SKIP: This test requires authentication implementation
    // The mcp-status element is only rendered after user logs in

    await page.goto('/dashboard');

    // Wait for page to load completely
    await page.waitForLoadState('networkidle');

    // Look for MCP status indicator with increased timeout
    const mcpStatus = page.locator('[data-testid="mcp-status"]');
    await expect(mcpStatus).toBeVisible({ timeout: 30000 });

    // Verify status shows healthy/operational
    await expect(mcpStatus).toContainText(/healthy|online|active|operational/i);
  });
});
