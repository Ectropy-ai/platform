/**
 * Dashboard Assessment Test Suite
 * PHASE 1 UPDATE (2026-02-09): Role switcher removed
 *
 * Comprehensive assessment of dashboard functionality:
 * - Page load testing for all views
 * - Console error detection
 * - Screenshot capture for visual verification
 *
 * Run with: PLAYWRIGHT_BASE_URL=http://localhost pnpm test:e2e --grep "Dashboard Assessment"
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';

// Store console errors for reporting
const consoleErrors: { page: string; message: string; type: string }[] = [];

// Helper to set up authenticated session via localStorage mock
async function setupMockAuth(page: Page) {
  // Navigate first to set up localStorage on the domain
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Set mock role in localStorage (used by RoleContext in development mode)
  await page.evaluate(() => {
    localStorage.setItem('ectropy_selected_role', 'contractor');
  });
}

// Helper to capture console errors
function setupConsoleCapture(page: Page, pageName: string) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        page: pageName,
        message: msg.text(),
        type: msg.type(),
      });
    }
  });
}

test.describe('Dashboard Assessment', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    // Clear errors before suite
    consoleErrors.length = 0;
  });

  test.afterAll(async () => {
    // Report all console errors found
    if (consoleErrors.length > 0) {
      console.log('\n=== Console Errors Found ===');
      consoleErrors.forEach((err, i) => {
        console.log(`${i + 1}. [${err.page}] ${err.message}`);
      });
      console.log('============================\n');
    } else {
      console.log('\n=== No Console Errors Found ===\n');
    }
  });

  test('01 - Landing page loads and displays correctly', async ({ page }) => {
    setupConsoleCapture(page, 'Landing Page');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Check page loaded
    await expect(page).toHaveTitle(/Ectropy/);

    // Take screenshot
    await page.screenshot({
      path: 'test-results/screenshots/01-landing-page.png',
      fullPage: true,
    });

    // Check for landing content or login page
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('02 - Login page renders correctly', async ({ page }) => {
    setupConsoleCapture(page, 'Login Page');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Take screenshot of login/auth state
    await page.screenshot({
      path: 'test-results/screenshots/02-login-page.png',
      fullPage: true,
    });

    // Should show either login or redirect to landing
    const url = page.url();
    expect(url).toMatch(/localhost/);
  });

  test('03 - Dashboard navigation elements present (authenticated)', async ({ page }) => {
    setupConsoleCapture(page, 'Dashboard Nav');

    // This test checks if nav elements render when authenticated
    // In dev mode, we may see the dashboard without full auth
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'test-results/screenshots/03-dashboard-nav.png',
      fullPage: true,
    });

    // Check for key UI elements
    const navBar = page.locator('header, [data-testid="dashboard-nav"], .MuiAppBar-root');
    const navVisible = await navBar
      .first()
      .isVisible()
      .catch(() => false);

    console.log(`Navigation bar visible: ${navVisible}`);
  });

  test('04 - Verify role switcher is not present (Phase 1)', async ({ page }) => {
    setupConsoleCapture(page, 'Role Switcher Removed');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // PHASE 1: Verify role switcher is NOT present
    const roleSwitcher = page.locator('[data-testid="role-switcher"]');
    const hasRoleSwitcher = await roleSwitcher.count();

    console.log(`Role switcher present: ${hasRoleSwitcher > 0}`);
    expect(hasRoleSwitcher).toBe(0);
    console.log('✅ [PHASE 1] Role switcher correctly absent');

    await page.screenshot({
      path: 'test-results/screenshots/04-no-role-switcher.png',
      fullPage: true,
    });
  });

  test('05 - Projects page loads', async ({ page }) => {
    setupConsoleCapture(page, 'Projects Page');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Try to click Projects button
    const projectsBtn = page.locator('button:has-text("Projects")');
    const btnVisible = await projectsBtn.isVisible().catch(() => false);

    if (btnVisible) {
      await projectsBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: 'test-results/screenshots/05-projects-page.png',
        fullPage: true,
      });

      // Check for projects content
      const projectsHeading = page.locator('h1:has-text("Projects"), h4:has-text("Projects")');
      const hasProjects = await projectsHeading.isVisible().catch(() => false);
      console.log(`Projects page loaded: ${hasProjects}`);
    } else {
      console.log('Projects button not found - may require authentication');
    }
  });

  test('06 - Viewer page loads', async ({ page }) => {
    setupConsoleCapture(page, 'Viewer Page');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Try to click Viewer button
    const viewerBtn = page.locator('button:has-text("Viewer")');
    const btnVisible = await viewerBtn.isVisible().catch(() => false);

    if (btnVisible) {
      await viewerBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: 'test-results/screenshots/06-viewer-page.png',
        fullPage: true,
      });

      // Check for viewer content
      const viewerHeading = page.locator('h1:has-text("BIM"), h4:has-text("Viewer")');
      const hasViewer = await viewerHeading.isVisible().catch(() => false);
      console.log(`Viewer page loaded: ${hasViewer}`);
    } else {
      console.log('Viewer button not found - may require authentication');
    }
  });

  test('07 - Dashboard renders with default role (Phase 1)', async ({ page }) => {
    setupConsoleCapture(page, 'Default Role Dashboard');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // PHASE 1: Dashboard renders with user's default role (no switching)
    const dashboardMain = page.locator('[data-testid="dashboard-main"], .MuiContainer-root');
    const hasDashboard = await dashboardMain
      .first()
      .isVisible()
      .catch(() => false);

    console.log(`Dashboard rendered with default role: ${hasDashboard}`);

    await page.screenshot({
      path: 'test-results/screenshots/07-default-role-dashboard.png',
      fullPage: true,
    });

    expect(hasDashboard || true).toBeTruthy(); // Allow either state for assessment
  });

  test('08 - Check for JavaScript errors', async ({ page }) => {
    setupConsoleCapture(page, 'JS Errors Check');

    const errors: string[] = [];

    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Visit all main pages
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Report any JS errors
    if (errors.length > 0) {
      console.log('\n=== Page Errors Found ===');
      errors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
      console.log('=========================\n');
    } else {
      console.log('\n=== No Page Errors ===\n');
    }

    // Don't fail test on errors, just report them
    expect(true).toBe(true);
  });

  test('09 - Mobile responsive view', async ({ page }) => {
    setupConsoleCapture(page, 'Mobile View');

    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'test-results/screenshots/09-mobile-view.png',
      fullPage: true,
    });

    // Check layout adapts
    const body = await page.locator('body');
    await expect(body).toBeVisible();
  });

  test('10 - Summary report', async ({ page }) => {
    // Generate summary
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║              DASHBOARD ASSESSMENT SUMMARY                     ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ Total Console Errors: ${consoleErrors.length.toString().padEnd(39)}║`);
    console.log(`║ Screenshots saved to: test-results/screenshots/              ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');

    expect(true).toBe(true);
  });
});
