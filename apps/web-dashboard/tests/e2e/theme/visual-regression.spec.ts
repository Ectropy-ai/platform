import { test, expect } from '@playwright/test';

/**
 * Visual Regression Tests
 *
 * Uses Playwright's screenshot comparison to detect visual changes in UI.
 * Snapshots are stored in tests/e2e/theme/visual-regression.spec.ts-snapshots/
 *
 * First run creates baseline snapshots. Subsequent runs compare against baseline.
 * Update snapshots with: pnpm test:e2e --update-snapshots
 *
 * Part of p5a-d13: Design Integration Pipeline & Playwright Testing
 */

test.describe('Visual Regression - Landing Page', () => {
  test('landing page matches snapshot - desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait for any animations to complete
    await page.waitForTimeout(1000);

    // Take full page screenshot
    await expect(page).toHaveScreenshot('landing-page-desktop.png', {
      fullPage: true,
      maxDiffPixels: 100, // Allow minor rendering differences
    });
  });

  test('landing page matches snapshot - mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait for any animations to complete
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('landing-page-mobile.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('landing page matches snapshot - tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('landing-page-tablet.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});

test.describe('Visual Regression - Component Snapshots', () => {
  test('buttons render consistently', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Find and snapshot any buttons
    const buttons = await page.locator('[class*="MuiButton"]').all();

    if (buttons.length > 0) {
      await expect(buttons[0]).toHaveScreenshot('button-primary.png', {
        maxDiffPixels: 50,
      });
    }
  });

  test('cards render consistently', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const cards = await page.locator('[class*="MuiCard"]').all();

    if (cards.length > 0) {
      await expect(cards[0]).toHaveScreenshot('card-component.png', {
        maxDiffPixels: 50,
      });
    }
  });

  test.skip('navigation bar renders consistently - requires auth', async ({ page }) => {
    // SKIP: Requires authentication
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const nav = page.locator('[data-testid="dashboard-nav"]');
    await expect(nav).toHaveScreenshot('navigation-bar.png');
  });
});

test.describe('Visual Regression - Theme Colors', () => {
  test('primary color button appears correctly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Look for primary-colored button
    const primaryButton = page.locator('[class*="MuiButton-contained"]').first();

    if (await primaryButton.count() > 0) {
      await expect(primaryButton).toHaveScreenshot('button-primary-color.png', {
        maxDiffPixels: 50,
      });
    }
  });

  test('secondary color button appears correctly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const secondaryButton = page.locator('[class*="MuiButton"][class*="secondary"]').first();

    if (await secondaryButton.count() > 0) {
      await expect(secondaryButton).toHaveScreenshot('button-secondary-color.png', {
        maxDiffPixels: 50,
      });
    }
  });
});

test.describe('Visual Regression - Typography', () => {
  test('headings render consistently', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const h1 = page.locator('h1').first();

    if (await h1.count() > 0) {
      await expect(h1).toHaveScreenshot('heading-h1.png', {
        maxDiffPixels: 50,
      });
    }
  });

  test('body text renders consistently', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const paragraph = page.locator('p').first();

    if (await paragraph.count() > 0) {
      await expect(paragraph).toHaveScreenshot('paragraph-text.png', {
        maxDiffPixels: 50,
      });
    }
  });
});

test.describe('Visual Regression - Responsive Layout', () => {
  test('layout adapts correctly at 320px (extra small mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('layout-320px.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('layout adapts correctly at 600px (sm breakpoint)', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('layout-600px.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('layout adapts correctly at 960px (md breakpoint)', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('layout-960px.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('layout adapts correctly at 1280px (lg breakpoint)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('layout-1280px.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('layout adapts correctly at 1920px (xl breakpoint)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('layout-1920px.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});

test.describe('Visual Regression - Dark Mode (if implemented)', () => {
  test.skip('dark mode renders correctly - awaiting implementation', async ({ page }) => {
    // This test is skipped until dark mode toggle is implemented
    // Will test the darkTheme from theme.config.ts

    await page.goto('/', { waitUntil: 'networkidle' });

    // Toggle dark mode (once implemented)
    // await page.click('[data-testid="dark-mode-toggle"]');

    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('dark-mode-layout.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});

test.describe('Visual Regression - Construction Theme Colors', () => {
  test('Construction Blue (#1976d2) renders consistently', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Create a visual test for the primary color
    const primaryElements = await page.locator('[class*="MuiButton-contained"]').all();

    if (primaryElements.length > 0) {
      await expect(primaryElements[0]).toHaveScreenshot('construction-blue-element.png', {
        maxDiffPixels: 50,
      });
    }
  });

  test('Safety Orange (#f57c00) renders consistently', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const secondaryElements = await page.locator('[class*="secondary"]').all();

    if (secondaryElements.length > 0) {
      await expect(secondaryElements[0]).toHaveScreenshot('safety-orange-element.png', {
        maxDiffPixels: 50,
      });
    }
  });
});
