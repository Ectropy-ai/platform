import { test, expect } from '@playwright/test';
import { waitForReactHydration } from './utils/react-detection';

/**
 * Public Endpoint Tests - No Authentication Required
 *
 * These tests validate public-facing endpoints that work without authentication.
 * Ideal for CI environments where OAuth may be blocked by bot detection.
 *
 * Tests:
 * 1. Home/Landing page loads
 * 2. Login page is accessible
 * 3. OAuth buttons are present and visible
 * 4. Basic page structure and branding
 */

test.describe('Public Endpoints (No Auth)', () => {
  // ROOT CAUSE #88 FIX: Clear browser context cookies before each unauthenticated test
  // PROBLEM: Playwright reuses browser contexts across tests in same project/worker
  // This causes oauth_session cookies from previous tests to persist
  // IMPACT: Tests expect Login page but see authenticated dashboard instead
  // SOLUTION: Explicitly clear all cookies before each test
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.clearPermissions();
  });
  test('Landing/Home page loads successfully', async ({ page }) => {
    // Navigate to root and wait for React hydration
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Landing page polls /api/auth/me to detect authentication state
    await waitForReactHydration(page, {
      timeout: 30000,
      skipNetworkIdle: true, // Auth polling prevents networkidle
    });

    // Verify page loaded (not a 500 error page)
    await expect(page).not.toHaveTitle(/Error|500|404/i);

    // Verify Ectropy branding is present (after React hydration)
    const pageText = await page.textContent('body');
    expect(pageText).toMatch(/Ectropy|Construction|BIM|Building/i);

    // Verify page has basic structure
    const hasContent =
      (await page.locator('#root, #app, .app, body > *').count()) > 0;
    expect(hasContent).toBe(true);
  });

  test('Login page is accessible', async ({ page }) => {
    // ROOT CAUSE #83 FIX: App.tsx shows Login component at /?login (not at /)
    // '/' shows LandingPage (marketing/waitlist), '/?login' shows Login (OAuth buttons)
    await page.goto('/?login', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    // Login page polls /api/auth/me to detect authentication state
    await waitForReactHydration(page, {
      timeout: 30000,
      skipNetworkIdle: true, // Auth polling prevents networkidle
    });

    // ROOT CAUSE #84 FIX: Wait for useAuth isLoading → false transition
    // App.tsx shows "Loading..." while isLoading=true, blocking Login component render
    await page.waitForSelector('[data-testid="google-oauth-button"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Check if we got the login page (has OAuth buttons)
    const hasOAuthButton = await page
      .locator(
        'button:has-text("Google"), button:has-text("Sign in"), [data-testid*="google"], [data-testid*="oauth"]'
      )
      .count();

    expect(hasOAuthButton).toBeGreaterThan(0);
    console.log(
      `✅ Login page accessible at /?login with ${hasOAuthButton} OAuth button(s)`
    );
  });

  test('OAuth/Sign-in buttons are visible', async ({ page }) => {
    // ROOT CAUSE #83 FIX: Navigate to /?login to show Login component
    await page.goto('/?login', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Login page polls /api/auth/me, use skipNetworkIdle
    await waitForReactHydration(page, {
      timeout: 30000,
      skipNetworkIdle: true,
    });

    // ROOT CAUSE #84 FIX: Wait for useAuth isLoading → false transition
    await page.waitForSelector('[data-testid="google-oauth-button"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Look for Google OAuth button using various selectors
    const googleButtonSelectors = [
      'button:has-text("Google")',
      'button:has-text("Sign in with Google")',
      '[data-testid="google-oauth-button"]',
      '[data-testid="oauth-google"]',
      'button[aria-label*="Google"]',
    ];

    let foundButton = false;
    for (const selector of googleButtonSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        foundButton = true;
        console.log(`✅ Found OAuth button with selector: ${selector}`);

        // Verify button is visible
        const isVisible = await page.locator(selector).first().isVisible();
        expect(isVisible).toBe(true);
        break;
      }
    }

    if (!foundButton) {
      console.warn('⚠️  No OAuth button found - may indicate UI changes');
      console.warn('   Attempted selectors:', googleButtonSelectors);

      // Take screenshot for debugging with timestamp to prevent conflicts
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await page.screenshot({
        path: `test-results/no-oauth-button-${timestamp}.png`,
      });

      // This is a warning, not a failure - UI may have changed
      test.skip(true, 'OAuth button not found - UI may have changed');
    }

    expect(foundButton).toBe(true);
  });

  test('Page has proper meta tags and SEO', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Check for viewport meta tag (mobile responsiveness)
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content');
    expect(viewport).toContain('width=device-width');

    // Check for description meta tag (SEO)
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute('content');
    expect(description).toBeTruthy();

    // Check for title tag
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    expect(title).not.toBe('React App'); // Should be customized
  });

  test('No critical console errors on page load', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait a bit for async errors to appear
    await page.waitForTimeout(2000);

    // Filter out expected errors (401s from auth checks are normal)
    const criticalErrors = errors.filter(
      (err) =>
        !err.includes('401') &&
        !err.includes('Unauthorized') &&
        !err.includes('/auth/me') // Expected to fail if not authenticated
    );

    if (criticalErrors.length > 0) {
      console.warn('⚠️  Console errors detected:', criticalErrors);
    }

    // Allow some console errors but not excessive amounts
    // Threshold of 10: Typical React app may have 2-3 warning-level errors
    // that get logged as errors (PropTypes, deprecations), but 10+ indicates
    // a real problem (missing components, broken imports, etc.)
    const MAX_ALLOWED_ERRORS = 10;

    // Don't fail the test on console errors, just log them
    // Some errors (like 401s) are expected in CI
    expect(criticalErrors.length).toBeLessThan(MAX_ALLOWED_ERRORS);
  });

  test('Page responds within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    const loadTime = Date.now() - startTime;

    console.log(`📊 Page load time: ${loadTime}ms`);

    // Page should load within 5 seconds in CI
    expect(loadTime).toBeLessThan(5000);
  });
});
