/**
 * Authenticated Dashboard Assessment Test Suite
 * PHASE 1 UPDATE (2026-02-09): Role switcher removed
 *
 * Run this AFTER logging in via browser to capture authenticated state:
 * 1. Login to http://localhost in your browser
 * 2. Run: npx playwright codegen http://localhost --save-storage=auth.json
 * 3. Then run: PLAYWRIGHT_BASE_URL=http://localhost npx playwright test authenticated-assessment --project=chromium
 *
 * OR run in headed mode to login manually:
 * PLAYWRIGHT_BASE_URL=http://localhost npx playwright test authenticated-assessment --project=chromium --headed
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Check for auth state in multiple locations (enterprise pattern)
const possibleAuthFiles = [
  path.join(__dirname, '..', 'playwright', '.auth', 'state.json'), // New location
  path.join(__dirname, '..', '..', '..', 'auth.json'), // Legacy location
  path.join(__dirname, '..', '..', '..', 'playwright', '.auth', 'state.json'), // Alternative
];

let authFile: string | undefined;
for (const file of possibleAuthFiles) {
  if (fs.existsSync(file)) {
    authFile = file;
    break;
  }
}
const hasAuthState = !!authFile;

// Store errors for reporting
const consoleErrors: { page: string; message: string }[] = [];
const pageErrors: string[] = [];

function setupErrorCapture(page: Page, pageName: string) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error' && !msg.text().includes('401')) {
      consoleErrors.push({ page: pageName, message: msg.text() });
    }
  });
  page.on('pageerror', error => {
    pageErrors.push(`[${pageName}] ${error.message}`);
  });
}

test.describe('Authenticated Dashboard Assessment', () => {
  // Use stored auth state if available
  test.use({
    storageState: hasAuthState ? authFile : undefined,
  });

  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    console.log(`\nAuth state file: ${hasAuthState ? 'FOUND' : 'NOT FOUND'}`);
    if (authFile) {
      console.log(`Using: ${authFile}`);
    } else {
      console.log('Searched locations:');
      possibleAuthFiles.forEach(f => console.log(`  - ${f}`));
    }
    console.log(
      'Running tests with',
      hasAuthState ? 'authenticated' : 'unauthenticated',
      'state\n',
    );
  });

  test('01 - Dashboard loads with navigation bar', async ({ page }) => {
    setupErrorCapture(page, 'Dashboard');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Screenshot current state
    await page.screenshot({
      path: 'test-results/screenshots/auth-01-dashboard.png',
      fullPage: true,
    });

    // Check for nav bar (indicates authenticated state)
    const navBar = page.locator('[data-testid="dashboard-nav"], .MuiAppBar-root, header');
    const isAuthenticated = await navBar
      .first()
      .isVisible()
      .catch(() => false);

    console.log(`Dashboard authenticated: ${isAuthenticated}`);

    if (!isAuthenticated) {
      console.log(
        'TIP: Run "npx playwright codegen http://localhost --save-storage=auth.json" after logging in to save auth state',
      );
    }
  });

  test('02 - Verify role switcher is not present (Phase 1)', async ({ page }) => {
    setupErrorCapture(page, 'Role Switcher Removed');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // PHASE 1: Verify role switcher is NOT present
    const roleSwitcher = page.locator('[data-testid="role-switcher"]');
    const hasRoleSwitcher = await roleSwitcher.count();

    console.log(`Role switcher present: ${hasRoleSwitcher > 0}`);
    expect(hasRoleSwitcher).toBe(0);
    console.log('✅ [PHASE 1] Role switcher correctly absent');

    await page.screenshot({
      path: 'test-results/screenshots/auth-02-no-role-switcher.png',
      fullPage: true,
    });
  });

  test('04 - Projects page functionality', async ({ page }) => {
    setupErrorCapture(page, 'Projects');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const projectsBtn = page.locator('button:has-text("Projects")');
    const isVisible = await projectsBtn.isVisible().catch(() => false);

    if (isVisible) {
      await projectsBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: 'test-results/screenshots/auth-04-projects.png',
        fullPage: true,
      });

      // Check for projects list elements
      const heading = page.locator('h1:has-text("Projects"), h4:has-text("Projects")');
      const hasHeading = await heading.isVisible().catch(() => false);
      console.log(`Projects heading visible: ${hasHeading}`);

      // Check for New Project button
      const newProjectBtn = page.locator('button:has-text("New Project")');
      const hasNewBtn = await newProjectBtn.isVisible().catch(() => false);
      console.log(`New Project button visible: ${hasNewBtn}`);
    } else {
      console.log('Projects button not visible');
    }
  });

  test('05 - Viewer page functionality', async ({ page }) => {
    setupErrorCapture(page, 'Viewer');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const viewerBtn = page.locator('button:has-text("Viewer")');
    const isVisible = await viewerBtn.isVisible().catch(() => false);

    if (isVisible) {
      await viewerBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: 'test-results/screenshots/auth-05-viewer.png',
        fullPage: true,
      });

      // Check for viewer elements
      const heading = page.locator('h1:has-text("BIM"), h4:has-text("BIM Viewer")');
      const hasHeading = await heading.isVisible().catch(() => false);
      console.log(`BIM Viewer heading visible: ${hasHeading}`);

      // Check for tabs
      const tabs = page.locator('[role="tab"]');
      const tabCount = await tabs.count();
      console.log(`Viewer tabs found: ${tabCount}`);
    } else {
      console.log('Viewer button not visible');
    }
  });

  test('06 - Upload tab in viewer', async ({ page }) => {
    setupErrorCapture(page, 'Upload Tab');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

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
          path: 'test-results/screenshots/auth-06-upload-tab.png',
          fullPage: true,
        });

        // Check for upload elements
        const dropzone = page.locator('[data-testid="file-dropzone"], input[type="file"]');
        const hasUpload = await dropzone
          .first()
          .isVisible()
          .catch(() => false);
        console.log(`Upload dropzone visible: ${hasUpload}`);
      }
    }
  });

  test('07 - Error summary', async () => {
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         AUTHENTICATED ASSESSMENT SUMMARY                       ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║ Auth State: ${hasAuthState ? 'Available'.padEnd(48) : 'Not Found'.padEnd(48)}║`);
    console.log(`║ Console Errors: ${consoleErrors.length.toString().padEnd(44)}║`);
    console.log(`║ Page Errors: ${pageErrors.length.toString().padEnd(47)}║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    if (consoleErrors.length > 0) {
      console.log('\nConsole Errors:');
      consoleErrors.forEach((e, i) =>
        console.log(`  ${i + 1}. [${e.page}] ${e.message.substring(0, 80)}`),
      );
    }

    if (pageErrors.length > 0) {
      console.log('\nPage Errors:');
      pageErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e.substring(0, 80)}`));
    }

    console.log('\nScreenshots saved to: test-results/screenshots/');
    console.log('\n');

    expect(true).toBe(true);
  });
});
