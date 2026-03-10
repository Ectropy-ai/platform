import { test, expect } from '@playwright/test';
import percySnapshot from '@percy/playwright';

/**
 * Visual Regression Testing for Ectropy Construction Platform
 *
 * This test suite captures visual snapshots of 10 key pages to detect
 * unintended UI changes and maintain visual consistency across releases.
 *
 * Success Criteria: 10 snapshots captured with 0 visual diffs
 * Performance Target: Complete in <30s total
 */

const visualTestPages = [
  {
    name: 'Landing Page',
    path: '/',
    description: 'Main landing page with hero section and navigation',
  },
  {
    name: 'Dashboard Overview',
    path: '/dashboard',
    description: 'Main dashboard with project overview and metrics',
  },
  {
    name: 'Projects List',
    path: '/projects',
    description: 'Project listing with filters and search functionality',
  },
  {
    name: 'Project Detail',
    path: '/projects/new',
    description: 'Individual project details and management interface',
  },
  {
    name: 'BIM Viewer',
    path: '/viewer',
    description: '3D BIM viewer interface with navigation controls',
  },
  {
    name: 'Document Manager',
    path: '/documents',
    description: 'Document management with file upload and organization',
  },
  {
    name: 'Document Upload',
    path: '/documents/upload',
    description: 'File upload interface for IFC, PDF, and DWG files',
  },
  {
    name: 'Cost Estimation',
    path: '/estimates',
    description: 'Cost estimation tools with material takeoffs',
  },
  {
    name: 'User Authentication',
    path: '/?login', // ROOT CAUSE #212 FIX: App uses query param pattern, not route path (see oauth-login.spec.ts:46-48)
    description: 'Login interface with authentication forms',
  },
  {
    name: 'User Profile',
    path: '/profile',
    description: 'User profile management and settings interface',
  },
];

// Test each page for visual regression
visualTestPages.forEach(({ name, path, description }) => {
  test(`Visual Regression: ${name}`, async ({ page }) => {
    const startTime = Date.now();

    // Navigate to the page
    // ROOT CAUSE #143 FIX: Use 'domcontentloaded' instead of 'networkidle'
    // Modern SPAs with WebSockets/polling never reach 'networkidle' state
    await page.goto(path, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for React root to render
    await page.waitForSelector('#root > *', { timeout: 5000 });

    // Verify basic page load
    await expect(page).toHaveTitle(/Ectropy/i);

    // Wait for any animations or dynamic content to settle
    await page.waitForTimeout(2000);

    // Capture visual snapshots at multiple breakpoints
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, `${name}`, {
        widths: [375, 768, 1280, 1920], // Mobile, tablet, desktop, large desktop
        minHeight: 1024,
        percyCSS: `
          /* Hide dynamic elements that change between runs */
          .timestamp, .last-updated, .real-time-data {
            visibility: hidden !important;
          }
          
          /* Stabilize animations */
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
        `,
      });
    } else {
      console.log(
        `⚠️  PERCY_TOKEN not set - visual snapshot skipped for ${name}`
      );
    }

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(8000); // 8 seconds max per page
  });
});

// Comprehensive visual regression test
test('All Pages Visual Regression Suite', async ({ page }) => {
  const startTime = Date.now();
  let snapshotCount = 0;

  for (const { name, path } of visualTestPages) {
    // ROOT CAUSE #143 FIX: Use 'domcontentloaded' for modern SPA
    await page.goto(path, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForSelector('#root > *', { timeout: 5000 });
    await expect(page).toHaveTitle(/Ectropy/i);

    // Brief stabilization wait
    await page.waitForTimeout(1500);

    // Quick snapshot for comprehensive suite
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, `Suite-${name}`, {
        widths: [1280], // Single width for speed
        minHeight: 1024,
      });
      snapshotCount++;
    }
  }

  const totalTime = Date.now() - startTime;

  // Success criteria: All 10 pages tested in <30s total
  expect(totalTime).toBeLessThan(30000);

  // Snapshot count depends on Percy availability
  if (process.env.PERCY_TOKEN) {
    expect(snapshotCount).toBe(10);
  } else {
    // PERCY_TOKEN not configured — snapshots skipped (expected in staging CI)
    expect(snapshotCount).toBe(0);
  }
});

// Responsive visual testing
test('Responsive Design Visual Test', async ({ page }) => {
  const responsivePages = ['/', '/projects', '/viewer'];
  const viewports = [
    { width: 375, height: 667, name: 'Mobile-Portrait' },
    { width: 768, height: 1024, name: 'Tablet-Portrait' },
    { width: 1280, height: 720, name: 'Desktop' },
  ];

  for (const pagePath of responsivePages) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      // ROOT CAUSE #143 FIX: Use 'domcontentloaded' for modern SPA
      await page.goto(pagePath, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForSelector('#root > *', { timeout: 5000 });
      await page.waitForTimeout(1000);

      if (process.env.PERCY_TOKEN) {
        await percySnapshot(
          page,
          `Responsive-${pagePath.replace('/', 'Home')}-${viewport.name}`,
          {
            widths: [viewport.width],
            minHeight: viewport.height,
          }
        );
      }
    }
  }
});
