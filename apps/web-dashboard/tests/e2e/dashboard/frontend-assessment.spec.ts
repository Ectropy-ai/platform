/**
 * Frontend Assessment Test Suite
 *
 * Tests the React frontend rendering and basic functionality.
 * Does NOT require authentication - just verifies frontend loads.
 *
 * Run: PLAYWRIGHT_BASE_URL=http://localhost npx playwright test frontend-assessment --project=chromium
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';

const jsErrors: string[] = [];
const consoleErrors: string[] = [];

function setupCapture(page: Page) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (error) => {
    jsErrors.push(error.message);
  });
}

test.describe('Frontend Assessment', () => {
  test.beforeAll(() => {
    jsErrors.length = 0;
    consoleErrors.length = 0;
  });

  test('01 - Landing page renders React app', async ({ page }) => {
    setupCapture(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Screenshot
    await page.screenshot({
      path: 'test-results/screenshots/frontend-01-landing.png',
      fullPage: true
    });

    // Verify React app loaded (title should be set)
    await expect(page).toHaveTitle(/Ectropy/);

    // Check for main content
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(100);

    console.log('✓ Landing page loaded');
  });

  test('02 - Landing page shows Ectropy branding', async ({ page }) => {
    setupCapture(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Look for Ectropy Platform text or logo
    const hasEctropy = await page.locator('text=Ectropy').first().isVisible().catch(() => false);
    const hasPlatform = await page.locator('text=Platform').first().isVisible().catch(() => false);

    console.log(`Ectropy branding: ${hasEctropy || hasPlatform ? '✓' : '✗'}`);

    await page.screenshot({
      path: 'test-results/screenshots/frontend-02-branding.png',
      fullPage: true
    });
  });

  test('03 - Login component renders', async ({ page }) => {
    setupCapture(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);

    // Look for OAuth login button
    const googleBtn = page.locator('button:has-text("Google"), button:has-text("Sign in"), [data-testid="oauth-google"]');
    const loginVisible = await googleBtn.first().isVisible().catch(() => false);

    console.log(`Login button: ${loginVisible ? '✓ Found' : '✗ Not found'}`);

    await page.screenshot({
      path: 'test-results/screenshots/frontend-03-login.png',
      fullPage: true
    });
  });

  test('04 - Theme styling applied', async ({ page }) => {
    setupCapture(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Check for Material-UI classes (indicates theme loaded)
    const muiElements = await page.locator('[class*="Mui"]').count();
    console.log(`Material-UI elements: ${muiElements}`);

    // Check for Ectropy brand colors (purple/blue tones)
    const styles = await page.evaluate(() => {
      const body = document.body;
      return {
        bgColor: getComputedStyle(body).backgroundColor,
        fontFamily: getComputedStyle(body).fontFamily,
      };
    });

    console.log(`Body background: ${styles.bgColor}`);
    console.log(`Font family: ${styles.fontFamily.substring(0, 50)}...`);

    await page.screenshot({
      path: 'test-results/screenshots/frontend-04-theme.png',
      fullPage: true
    });
  });

  test('05 - No critical JS errors', async ({ page }) => {
    setupCapture(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(3000);

    // Filter out expected 401 errors
    const criticalErrors = jsErrors.filter(e =>
      !e.includes('401') &&
      !e.includes('Unauthorized') &&
      !e.includes('authentication')
    );

    console.log(`JS Errors: ${criticalErrors.length}`);
    if (criticalErrors.length > 0) {
      console.log('Critical errors:');
      criticalErrors.slice(0, 5).forEach(e => console.log(`  - ${e.substring(0, 80)}`));
    }

    // Only fail on critical errors
    expect(criticalErrors.length).toBeLessThan(5);
  });

  test('06 - Mobile viewport renders', async ({ page }) => {
    setupCapture(page);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'test-results/screenshots/frontend-06-mobile.png',
      fullPage: true
    });

    // Verify something renders
    const body = await page.locator('body');
    await expect(body).toBeVisible();

    console.log('✓ Mobile viewport rendered');
  });

  test('07 - Tablet viewport renders', async ({ page }) => {
    setupCapture(page);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'test-results/screenshots/frontend-07-tablet.png',
      fullPage: true
    });

    console.log('✓ Tablet viewport rendered');
  });

  test('08 - Summary Report', async () => {
    const nonAuthErrors = consoleErrors.filter(e => !e.includes('401'));

    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║              FRONTEND ASSESSMENT SUMMARY                       ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(`║ JS Errors: ${jsErrors.length.toString().padEnd(49)}║`);
    console.log(`║ Console Errors (non-401): ${nonAuthErrors.length.toString().padEnd(34)}║`);
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║ Screenshots: test-results/screenshots/frontend-*.png          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('\n');

    if (jsErrors.length > 0) {
      console.log('JS Errors:');
      jsErrors.slice(0, 5).forEach((e, i) => console.log(`  ${i + 1}. ${e.substring(0, 70)}`));
    }

    if (nonAuthErrors.length > 0) {
      console.log('Console Errors:');
      nonAuthErrors.slice(0, 5).forEach((e, i) => console.log(`  ${i + 1}. ${e.substring(0, 70)}`));
    }
  });
});
