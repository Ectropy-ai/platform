/**
 * Playwright E2E Test for MCP Chat FAB Button
 * Tests if the FAB button is visible and functional on Admin Dashboard
 *
 * ENTERPRISE P1.2: Updated to use auth.fixture.ts pattern
 * REFACTORED (2025-12-22): Use standardized URL helpers for staging compatibility
 */

import { test, expect } from './fixtures/auth.fixture';
import { setupAuthForRole } from './fixtures/auth.fixture';
import { getTestURL } from './utils/test-helpers';

test.describe('MCP Chat FAB Button', () => {
  test.beforeEach(async ({ page }) => {
    // ENTERPRISE P1.2: Setup authentication before navigation
    await setupAuthForRole(page, 'admin');

    // Navigate to the application
    await page.goto(getTestURL('/'));

    // Wait for the app to load
    await page.waitForLoadState('networkidle');
  });

  test('should display FAB button on Admin dashboard', async ({ page }) => {
    // ENTERPRISE P1.2: Auth fixture handles authentication - no login check needed

    // Set admin role in localStorage (in addition to auth fixture)
    await page.evaluate(() => {
      localStorage.setItem('ectropy_selected_role', 'admin');
    });

    // Reload to apply role change
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for admin dashboard to load
    await page.waitForSelector('[data-testid="admin-card-users"]', {
      timeout: 10000,
    });

    console.log('✓ Admin dashboard loaded');

    // Look for the FAB button
    const fabButton = page.locator('button[class*="MuiFab"]').filter({
      has: page.locator('svg[data-testid*="SmartToy"], [class*="SmartToy"]'),
    });

    // Check if FAB exists
    const fabCount = await fabButton.count();
    console.log(`Found ${fabCount} FAB button(s) with SmartToy icon`);

    if (fabCount === 0) {
      // Diagnostic: Check what's actually in the DOM
      const allFabs = await page.locator('button[class*="MuiFab"]').count();
      console.log(`Total FAB buttons in DOM: ${allFabs}`);

      const allButtons = await page.locator('button').count();
      console.log(`Total buttons in DOM: ${allButtons}`);

      // Check if SmartToy icon exists anywhere
      const smartToyIcons = await page
        .locator('[data-testid*="SmartToy"], svg')
        .count();
      console.log(`SmartToy icons in DOM: ${smartToyIcons}`);

      // Take a screenshot for debugging
      await page.screenshot({
        path: 'scripts/testing/admin-dashboard-no-fab.png',
        fullPage: true,
      });
      console.log(
        'Screenshot saved to scripts/testing/admin-dashboard-no-fab.png'
      );
    }

    // Assert FAB button exists
    await expect(fabButton).toBeVisible({
      timeout: 5000,
    });

    console.log('✓ FAB button is visible');

    // Check FAB button positioning
    const boundingBox = await fabButton.boundingBox();
    console.log('FAB position:', boundingBox);

    // Verify it's in the bottom-right corner
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      const viewportSize = page.viewportSize();
      if (viewportSize) {
        const distanceFromRight =
          viewportSize.width - (boundingBox.x + boundingBox.width);
        const distanceFromBottom =
          viewportSize.height - (boundingBox.y + boundingBox.height);

        console.log(`Distance from right: ${distanceFromRight}px`);
        console.log(`Distance from bottom: ${distanceFromBottom}px`);

        // Should be approximately 24px from bottom and right (allowing some margin)
        expect(distanceFromRight).toBeLessThan(50);
        expect(distanceFromBottom).toBeLessThan(50);
      }
    }

    console.log('✓ FAB button is positioned correctly');

    // Check tooltip
    await fabButton.hover();
    await page.waitForTimeout(500); // Wait for tooltip to appear

    const tooltip = page.getByText('Open MCP Assistant');
    await expect(tooltip).toBeVisible();

    console.log('✓ Tooltip displays correctly');

    // Click the FAB button
    await fabButton.click();

    // Wait for drawer to open
    await page.waitForSelector('[role="presentation"]', { timeout: 3000 });

    console.log('✓ Chat drawer opens on click');

    // Check if drawer contains expected elements
    const drawerHeading = page.getByText('MCP Assistant');
    await expect(drawerHeading).toBeVisible();

    const chatInput = page.locator(
      'input[placeholder*="message"], textarea[placeholder*="message"]'
    );
    await expect(chatInput).toBeVisible();

    console.log('✓ Chat interface renders correctly');

    // Take success screenshot
    await page.screenshot({
      path: 'scripts/testing/admin-dashboard-chat-open.png',
      fullPage: true,
    });
    console.log(
      'Screenshot saved to scripts/testing/admin-dashboard-chat-open.png'
    );
  });

  test('should NOT display FAB button on non-admin dashboards', async ({
    page,
  }) => {
    // ENTERPRISE P1.2: Setup authentication for contractor role
    await setupAuthForRole(page, 'contractor');

    // Navigate with contractor auth
    await page.goto(getTestURL('/'));
    await page.waitForLoadState('networkidle');

    // Set contractor role
    await page.evaluate(() => {
      localStorage.setItem('ectropy_selected_role', 'contractor');
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait a moment for any potential FAB to render
    await page.waitForTimeout(2000);

    // FAB button should NOT exist
    const fabButton = page.locator('button[class*="MuiFab"]').filter({
      has: page.locator('[data-testid*="SmartToy"]'),
    });

    const fabCount = await fabButton.count();
    expect(fabCount).toBe(0);

    console.log('✓ FAB button correctly hidden on contractor dashboard');
  });

  test('diagnostic: check what is actually rendered', async ({ page }) => {
    // ENTERPRISE P1.2: Setup authentication for admin role
    await setupAuthForRole(page, 'admin');

    // Navigate with admin auth
    await page.goto(getTestURL('/'));
    await page.waitForLoadState('networkidle');

    // Set admin role
    await page.evaluate(() => {
      localStorage.setItem('ectropy_selected_role', 'admin');
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Run diagnostic script
    const diagnostics = await page.evaluate(() => {
      const results: any = {
        selectedRole: localStorage.getItem('ectropy_selected_role'),
        adminCardExists:
          document.querySelector('[data-testid="admin-card-users"]') !== null,
        fabButtons: document.querySelectorAll('button[class*="MuiFab"]').length,
        smartToyIcons: document.querySelectorAll(
          '[data-testid*="SmartToy"], svg'
        ).length,
        tooltips: document.querySelectorAll('[role="tooltip"]').length,
        buttons: document.querySelectorAll('button').length,
      };

      // Get all FAB button details
      const fabs = document.querySelectorAll('button[class*="MuiFab"]');
      results.fabDetails = Array.from(fabs).map((fab) => {
        const rect = fab.getBoundingClientRect();
        const styles = window.getComputedStyle(fab);
        return {
          className: fab.className,
          visible: styles.display !== 'none' && styles.visibility !== 'hidden',
          position: {
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right,
          },
          styles: {
            display: styles.display,
            visibility: styles.visibility,
            opacity: styles.opacity,
            position: styles.position,
            bottom: styles.bottom,
            right: styles.right,
            zIndex: styles.zIndex,
          },
        };
      });

      return results;
    });

    console.log('=== Diagnostic Results ===');
    console.log(JSON.stringify(diagnostics, null, 2));

    // Take diagnostic screenshot
    await page.screenshot({
      path: 'scripts/testing/admin-dashboard-diagnostic.png',
      fullPage: true,
    });
    console.log('Diagnostic screenshot saved');
  });
});
