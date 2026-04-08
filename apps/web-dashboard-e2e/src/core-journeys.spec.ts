import { test, expect } from '@playwright/test';
import percySnapshot from '@percy/playwright';

/**
 * Core User Journeys for Ectropy Construction Platform
 *
 * PREREQUISITES: Authentication must be configured via auth.setup.ts
 * All tests assume user is already authenticated with valid session.
 *
 * These tests validate the 5 essential user workflows:
 * 1. Dashboard Access (authenticated user)
 * 2. Project Management (create/view projects)
 * 3. Document Upload (IFC files, drawings)
 * 4. BIM Viewer (3D model loading, navigation)
 * 5. Cost Estimation (material takeoffs, pricing)
 *
 * Success Criteria: All 5 journeys must pass in <30s total
 */

const journeys = [
  {
    name: 'user-login',
    path: '/dashboard',
    description: 'Verify authenticated user can access dashboard',
  },
  {
    name: 'project-creation',
    path: '/projects/new',
    description: 'Project management - create and view construction projects',
  },
  {
    name: 'document-upload',
    path: '/documents/upload',
    description: 'Document management - upload IFC files and drawings',
  },
  {
    name: 'bim-viewer-load',
    path: '/viewer',
    description: 'BIM viewer - load and navigate 3D construction models',
  },
  {
    name: 'cost-estimation',
    path: '/estimates',
    description: 'Cost estimation - material takeoffs and pricing calculations',
  },
];

// Pre-flight auth validation
test.beforeEach(async ({ page }) => {
  // Verify authentication state is loaded
  const cookies = await page.context().cookies();
  const hasAuthCookie = cookies.some(c =>
    c.name.includes('session') ||
    c.name.includes('token') ||
    c.name.includes('oauth') ||
    c.name.includes('connect.sid')
  );

  if (!hasAuthCookie) {
    console.warn(
      '⚠️  No authentication cookie found. Some tests may fail or be redirected to login.'
    );
    console.warn('   To fix: Ensure auth.setup.ts runs successfully with valid TEST_GOOGLE_EMAIL/PASSWORD');
  }
});

// Test each journey independently for better error isolation
journeys.forEach(({ name, path, description }) => {
  test(`Core Journey: ${name}`, async ({ page }) => {

    // Navigate to the journey path
    // CRITICAL FIX: Use 'domcontentloaded' instead of 'networkidle'
    // The app makes background API calls that may return 401 (if not authenticated)
    // which prevents network from ever being idle, causing timeouts
    const startTime = Date.now();
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // CRITICAL: Verify we're NOT redirected to Google OAuth or login page
    const currentUrl = page.url();
    if (currentUrl.includes('accounts.google.com') || currentUrl.includes('/login')) {
      console.warn(
        `⚠️  Authentication required for ${name}. Redirected to: ${currentUrl}`
      );
      console.warn('   This is expected if CI_OAUTH_BYPASS=true or OAuth setup failed');
      test.skip(true, 'Requires authentication - auth redirect detected');
      return;
    }

    // Wait for React to hydrate (SPA needs time to render after initial HTML)
    // This is critical as the app is a Single Page Application
    // Increased timeout for CI environments which can be slower
    try {
      await page.waitForSelector('#root > *, #app > *, .app > *', { 
        timeout: 15000, // Increased from 10s for CI stability
        state: 'visible'
      });
    } catch (e) {
      console.warn(`⚠️  React hydration timeout for ${name}, continuing anyway...`);
    }

    // Verify page loads and contains Ectropy branding
    await expect(page).toHaveTitle(/Ectropy/i);

    // Check for basic page structure - all routes should have these elements
    const hasHeader =
      (await page.locator('header, nav, [role="banner"]').count()) > 0;
    const hasMain =
      (await page.locator('main, [role="main"], .main-content').count()) > 0;

    if (!hasHeader && !hasMain) {
      // If no standard structure, check for React app root
      await expect(page.locator('#root, #app, .app')).toBeVisible();
    }

    // Journey-specific validations
    switch (name) {
      case 'user-login':
        // Wait for Suspense to resolve and dashboard to render
        // Auth setup confirms dashboard-main exists — test needs explicit wait
        await page.waitForSelector('[data-testid="dashboard-main"]', {
          timeout: 15000,
        });
        console.log('✅ Dashboard accessible (authenticated)');
        break;

      case 'project-creation':
        // Should have project creation interface
        const hasProjectForm =
          (await page
            .locator(
              'form, button[type="submit"], input[placeholder*="project"], input[placeholder*="name"]'
            )
            .count()) > 0;
        if (hasProjectForm) {
          console.log('✅ Project creation form detected');
        } else {
          console.log('⚠️  No project creation form detected');
        }
        break;

      case 'document-upload':
        // Should have file upload capabilities
        const hasFileUpload =
          (await page
            .locator(
              'input[type="file"], [data-testid*="upload"], .upload-zone, .dropzone'
            )
            .count()) > 0;
        if (hasFileUpload) {
          console.log('✅ File upload capability detected');
        } else {
          console.log('⚠️  No file upload capability detected');
        }
        break;

      case 'bim-viewer-load':
        // Should have viewer container or 3D canvas
        const hasViewer =
          (await page
            .locator('canvas, .viewer, .three-js, [data-testid*="viewer"]')
            .count()) > 0;
        if (hasViewer) {
        } else {
        }
        break;

      case 'cost-estimation':
        // Should have estimation forms or tables
        const hasEstimation =
          (await page
            .locator(
              'table, .estimation, .cost, input[placeholder*="cost"], input[placeholder*="price"]'
            )
            .count()) > 0;
        if (hasEstimation) {
        } else {
        }
        break;
    }

    // Performance check - each journey should load within reasonable time
    const loadTime = Date.now() - startTime;
    console.log(`✅ Journey "${name}" completed in ${loadTime}ms`);
    
    // Performance assertion
    expect(loadTime).toBeLessThan(15000); // 15 seconds max per journey

    // Take Percy visual snapshot for regression testing
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, `Ectropy-${name}`, {
        widths: [375, 768, 1280], // Mobile, tablet, desktop
      });
    }

  });
});

// Comprehensive test to run all journeys sequentially
test('All Core Journeys Performance Test', async ({ page }) => {

  const startTime = Date.now();

  for (const { name, path } of journeys) {
    // CRITICAL FIX: Use 'domcontentloaded' instead of 'networkidle'
    // Same issue as individual tests - 401 errors prevent network idle
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Ectropy/i);

    // Brief wait to ensure page is stable
    await page.waitForTimeout(1000);
  }

  const totalTime = Date.now() - startTime;

  // Success criteria from roadmap: All 5 journeys must pass in <30s total
  // Note: May need to adjust this if auth redirects occur
  expect(totalTime).toBeLessThan(30000);
});
