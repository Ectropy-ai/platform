/**
 * Dashboard Diagnostic Tests
 * PHASE 1 UPDATE (2026-02-09): Role switcher removed
 * Validates dashboard state and BIM viewer functionality
 * REFACTORED (2025-12-22): Use standardized URL helpers for staging compatibility
 */
import { test, expect } from '@playwright/test';
import { getTestURL } from './utils/test-helpers';

test.describe('Dashboard Diagnostics', () => {
  test.setTimeout(60000); // Extend timeout

  test('diagnose dashboard and BIM viewer state', async ({ page }) => {
    // Enable console logging
    page.on('console', (msg) =>
      console.log(`[Browser] ${msg.type()}: ${msg.text()}`)
    );
    page.on('pageerror', (error) =>
      console.log(`[Browser Error]: ${error.message}`)
    );

    // Go to dashboard
    await page.goto(getTestURL('/'));
    await page.waitForLoadState('networkidle');

    // Screenshot initial state
    await page.screenshot({
      path: 'test-results/diagnostic-1-initial.png',
      fullPage: true,
    });

    // Check what's on the page
    const pageContent = await page.content();
    console.log('\n=== PAGE STRUCTURE ===');

    // Check for login vs dashboard
    const hasLogin = await page.locator('text=Sign in').count();
    const hasDashboard = await page
      .locator('[data-testid="dashboard-nav"]')
      .count();
    const hasRoleSwitcher = await page.locator('text=Switch Role').count();

    console.log(`Login present: ${hasLogin > 0}`);
    console.log(`Dashboard nav present: ${hasDashboard > 0}`);
    console.log(`Role switcher present: ${hasRoleSwitcher > 0}`);

    // PHASE 1: Expect role switcher to NOT be present
    expect(hasRoleSwitcher).toBe(0);
    console.log('✅ [PHASE 1] Role switcher correctly absent');

    // Check for BIM viewer elements
    const bimViewerError = await page.locator('text=BIM Viewer').count();
    const bimViewerContainer = await page
      .locator('text=BIM viewer container not available')
      .count();
    const bimNoModel = await page.locator('text=No BIM model loaded').count();

    console.log(`\n=== BIM VIEWER STATE ===`);
    console.log(`BIM Viewer text present: ${bimViewerError > 0}`);
    console.log(`"Container not available" error: ${bimViewerContainer > 0}`);
    console.log(`"No BIM model" message: ${bimNoModel > 0}`);

    // Check for MUI Select components
    const selectInputs = await page.locator('.MuiSelect-select').count();
    console.log(`\n=== SELECT COMPONENTS ===`);
    console.log(`MUI Select elements: ${selectInputs}`);

    // Check all alerts on page
    const alerts = await page.locator('.MuiAlert-root').allTextContents();
    console.log(`\n=== ALERTS ON PAGE ===`);
    alerts.forEach((alert, i) => console.log(`Alert ${i + 1}: ${alert}`));

    // Check all buttons
    const buttons = await page.locator('button').allTextContents();
    console.log(`\n=== BUTTONS ON PAGE ===`);
    buttons
      .slice(0, 10)
      .forEach((btn, i) =>
        console.log(`Button ${i + 1}: ${btn.trim().substring(0, 50)}`)
      );

    // Final screenshot
    await page.screenshot({
      path: 'test-results/diagnostic-3-final.png',
      fullPage: true,
    });

    console.log('\n=== DIAGNOSTIC COMPLETE ===');
  });
});
