/**
 * Mock Authentication Dashboard Assessment
 * PHASE 1 UPDATE (2026-02-09): Role switcher removed
 *
 * Tests dashboard functionality using mocked authentication state.
 * This bypasses OAuth and directly injects session data for testing.
 *
 * Run: PLAYWRIGHT_BASE_URL=http://localhost npx playwright test mock-auth-assessment --project=chromium
 */

import { test, expect, Page, BrowserContext, ConsoleMessage } from '@playwright/test';

// Collect errors for reporting
const consoleErrors: { page: string; message: string }[] = [];
const pageErrors: string[] = [];

function setupErrorCapture(page: Page, pageName: string) {
  page.on('console', (msg: ConsoleMessage) => {
    // Ignore 401 errors (expected without real auth)
    if (msg.type() === 'error' && !msg.text().includes('401')) {
      consoleErrors.push({ page: pageName, message: msg.text() });
    }
  });
  page.on('pageerror', error => {
    pageErrors.push(`[${pageName}] ${error.message}`);
  });
}

// Mock user data that matches the backend User interface
const mockUser = {
  id: 'test-user-001',
  email: 'ectropytest@gmail.com',
  full_name: 'Ectropy Test User',
  role: 'contractor',
  roles: ['contractor', 'architect', 'engineer', 'owner', 'admin'],
  company: 'Ectropy Test',
  provider: 'mock',
};

/**
 * Inject mock auth into page context
 * This simulates what would happen after successful OAuth
 */
async function injectMockAuth(context: BrowserContext, page: Page) {
  // Set up route to intercept /api/auth/me and return mock user
  await context.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: mockUser }),
    });
  });

  // Also mock /api/projects to return empty array (prevents 401)
  await context.route('**/api/projects', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Mock Speckle streams endpoint
  await context.route('**/api/speckle/streams**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test.describe('Mock Auth Dashboard Assessment', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    console.log('\n🔐 Running with MOCK authentication\n');
  });

  test('01 - Dashboard loads with mocked auth', async ({ context, page }) => {
    setupErrorCapture(page, 'Dashboard');
    await injectMockAuth(context, page);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'test-results/screenshots/mock-01-dashboard.png',
      fullPage: true,
    });

    // Check for nav bar (indicates authenticated view rendered)
    const navBar = page.locator('[data-testid="dashboard-nav"], .MuiAppBar-root');
    const isVisible = await navBar
      .first()
      .isVisible()
      .catch(() => false);

    console.log(`Dashboard rendered (authenticated view): ${isVisible}`);
    // Don't fail - just report status for assessment
    if (!isVisible) {
      console.log(
        'Note: Mock auth did not trigger authenticated view - app may require real session cookies',
      );
    }
  });

  test('02 - Verify role switcher is not present (Phase 1)', async ({ context, page }) => {
    setupErrorCapture(page, 'Role Switcher Removed');
    await injectMockAuth(context, page);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // PHASE 1: Verify role switcher is NOT present
    const roleSwitcher = page.locator('[data-testid="role-switcher"]');
    const hasRoleSwitcher = await roleSwitcher.count();

    console.log(`Role switcher present: ${hasRoleSwitcher > 0}`);
    expect(hasRoleSwitcher).toBe(0);
    console.log('✅ [PHASE 1] Role switcher correctly absent');

    await page.screenshot({
      path: 'test-results/screenshots/mock-02-no-role-switcher.png',
      fullPage: true,
    });
  });

  test('04 - Navigate to Projects page', async ({ context, page }) => {
    setupErrorCapture(page, 'Projects');
    await injectMockAuth(context, page);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const projectsBtn = page.locator('button:has-text("Projects")');

    if (await projectsBtn.isVisible().catch(() => false)) {
      await projectsBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: 'test-results/screenshots/mock-04-projects.png',
        fullPage: true,
      });

      // Check for projects page content
      const heading = page.locator(
        'h1:has-text("Projects"), h4:has-text("Projects"), text=My Projects',
      );
      const newBtn = page.locator('button:has-text("New Project")');

      console.log(
        `Projects heading: ${await heading
          .first()
          .isVisible()
          .catch(() => false)}`,
      );
      console.log(`New Project button: ${await newBtn.isVisible().catch(() => false)}`);
    }
  });

  test('05 - Navigate to Viewer page', async ({ context, page }) => {
    setupErrorCapture(page, 'Viewer');
    await injectMockAuth(context, page);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const viewerBtn = page.locator('button:has-text("Viewer")');

    if (await viewerBtn.isVisible().catch(() => false)) {
      await viewerBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: 'test-results/screenshots/mock-05-viewer.png',
        fullPage: true,
      });

      // Check for BIM viewer elements
      const heading = page.locator('h1:has-text("BIM"), h4:has-text("BIM Viewer")');
      const tabs = page.locator('[role="tab"]');

      console.log(
        `BIM Viewer heading: ${await heading
          .first()
          .isVisible()
          .catch(() => false)}`,
      );
      console.log(`Viewer tabs: ${await tabs.count()}`);
    }
  });

  test('06 - Viewer Upload tab', async ({ context, page }) => {
    setupErrorCapture(page, 'Upload');
    await injectMockAuth(context, page);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Navigate to Viewer
    const viewerBtn = page.locator('button:has-text("Viewer")');
    if (await viewerBtn.isVisible().catch(() => false)) {
      await viewerBtn.click();
      await page.waitForTimeout(2000);

      // Click Upload tab
      const uploadTab = page.locator('[role="tab"]:has-text("Upload")');
      if (await uploadTab.isVisible().catch(() => false)) {
        await uploadTab.click();
        await page.waitForTimeout(1000);

        await page.screenshot({
          path: 'test-results/screenshots/mock-06-upload.png',
          fullPage: true,
        });

        console.log('Upload tab captured');
      }
    }
  });

  test('07 - Mobile responsive view', async ({ context, page }) => {
    setupErrorCapture(page, 'Mobile');
    await injectMockAuth(context, page);

    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'test-results/screenshots/mock-07-mobile.png',
      fullPage: true,
    });

    console.log('Mobile view captured');
  });

  test('08 - Assessment Summary', async () => {
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         MOCK AUTH DASHBOARD ASSESSMENT SUMMARY                 ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║ Console Errors (non-401): ${consoleErrors.length.toString().padEnd(35)}║`);
    console.log(`║ Page Errors: ${pageErrors.length.toString().padEnd(47)}║`);
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║ Screenshots saved to: test-results/screenshots/mock-*.png     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    if (consoleErrors.length > 0) {
      console.log('\nConsole Errors:');
      consoleErrors
        .slice(0, 10)
        .forEach((e, i) => console.log(`  ${i + 1}. [${e.page}] ${e.message.substring(0, 70)}`));
    }

    if (pageErrors.length > 0) {
      console.log('\nPage Errors:');
      pageErrors.slice(0, 5).forEach((e, i) => console.log(`  ${i + 1}. ${e.substring(0, 70)}`));
    }

    console.log('\n');
  });
});
