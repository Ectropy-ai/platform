/**
 * ENTERPRISE E2E TEST TEMPLATE
 *
 * Template Metadata (MCP-Servable):
 * - Framework: Playwright
 * - Type: End-to-End Test
 * - Target Coverage: 95%
 * - Pattern: User Journey Testing + Critical Path Validation
 *
 * USAGE:
 * pnpm test:generate e2e <feature-name>
 *
 * EXAMPLE:
 * pnpm test:generate e2e bim-viewer
 * → Creates tests/playwright/bim-viewer.spec.ts
 *
 * E2E TEST PHILOSOPHY:
 * - Test complete user journeys, not individual components
 * - Use auth.fixture for authentication (no manual OAuth)
 * - Validate business-critical paths
 * - Test cross-browser compatibility
 * - Verify integration between frontend and backend
 */

import { test, expect } from './fixtures/auth.fixture';
import { setupAuthForRole } from './fixtures/auth.fixture';

// ============================================================================
// TEMPLATE PLACEHOLDERS (replaced by generator)
// ============================================================================
// {{FEATURE_NAME}} - Name of feature being tested (e.g., "BIM Viewer")
// {{BASE_URL}} - Application base URL (defaults to http://localhost:3000)
// {{USER_ROLE}} - Default user role for tests (admin/architect/engineer/etc.)

test.describe('{{FEATURE_NAME}} E2E Tests', () => {
  // ============================================================================
  // TEST CONFIGURATION
  // ============================================================================

  test.beforeEach(async ({ page }) => {
    // Set up authentication for all tests
    await setupAuthForRole(page, '{{USER_ROLE}}');

    // Navigate to feature page
    await page.goto('{{BASE_URL}}/{{FEATURE_PATH}}');

    // Wait for app to be ready
    await page.waitForLoadState('networkidle');
  });

  // ============================================================================
  // CRITICAL USER JOURNEY - HAPPY PATH
  // ============================================================================

  test.describe('Critical User Journey', () => {
    test('should complete end-to-end user workflow successfully', async ({ page }) => {
      // STEP 1: Verify landing page loads correctly
      await expect(page).toHaveTitle(/{{FEATURE_NAME}}/i);
      await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();

      // STEP 2: Interact with primary feature
      await page.getByRole('button', { name: /start/i }).click();
      await expect(page.getByText(/in progress/i)).toBeVisible();

      // STEP 3: Complete workflow
      await page.getByRole('button', { name: /complete/i }).click();

      // STEP 4: Verify success state
      await expect(page.getByRole('alert')).toContainText(/success/i);
      await expect(page).toHaveURL(/success/);
    });

    test('should persist data across navigation', async ({ page }) => {
      // Enter data
      await page.getByLabel(/input field/i).fill('Test Data');
      await page.getByRole('button', { name: /save/i }).click();

      // Navigate away
      await page.goto('{{BASE_URL}}/other-page');

      // Navigate back
      await page.goto('{{BASE_URL}}/{{FEATURE_PATH}}');

      // Verify data persisted
      await expect(page.getByLabel(/input field/i)).toHaveValue('Test Data');
    });
  });

  // ============================================================================
  // AUTHENTICATION INTEGRATION
  // ============================================================================

  test.describe('Authentication Integration', () => {
    test('should display user-specific content based on role', async ({ page }) => {
      // Admin role sees admin controls
      await expect(page.getByRole('button', { name: /admin panel/i })).toBeVisible();
    });

    test('should handle session timeout gracefully', async ({ page }) => {
      // Simulate session expiration
      await page.context().clearCookies();

      // Attempt action
      await page.getByRole('button', { name: /save/i }).click();

      // Should redirect to login or show session expired message
      await expect(page).toHaveURL(/login/);
    });
  });

  // ============================================================================
  // FORM VALIDATION & SUBMISSION
  // ============================================================================

  test.describe('Form Interactions', () => {
    test('should validate form fields before submission', async ({ page }) => {
      // Submit empty form
      await page.getByRole('button', { name: /submit/i }).click();

      // Verify validation errors
      await expect(page.getByText(/required field/i)).toBeVisible();
    });

    test('should submit valid form successfully', async ({ page }) => {
      // Fill form with valid data
      await page.getByLabel(/name/i).fill('Test Name');
      await page.getByLabel(/email/i).fill('test@example.com');
      await page.getByLabel(/message/i).fill('Test message');

      // Submit form
      await page.getByRole('button', { name: /submit/i }).click();

      // Verify success
      await expect(page.getByRole('alert')).toContainText(/submitted successfully/i);
    });

    test('should handle server validation errors', async ({ page }) => {
      // Fill form
      await page.getByLabel(/email/i).fill('duplicate@example.com');
      await page.getByRole('button', { name: /submit/i }).click();

      // Verify server error displayed
      await expect(page.getByText(/email already exists/i)).toBeVisible();
    });
  });

  // ============================================================================
  // REAL-TIME FEATURES & WEBSOCKETS
  // ============================================================================

  test.describe('Real-time Updates', () => {
    test('should reflect real-time data changes', async ({ page, context }) => {
      // Open second page to simulate multi-user scenario
      const page2 = await context.newPage();
      await setupAuthForRole(page2, 'architect');
      await page2.goto('{{BASE_URL}}/{{FEATURE_PATH}}');

      // Make change in page 1
      await page.getByRole('button', { name: /update/i }).click();

      // Verify change reflects in page 2 via WebSocket
      await expect(page2.getByText(/updated/i)).toBeVisible({ timeout: 5000 });

      await page2.close();
    });
  });

  // ============================================================================
  // ERROR SCENARIOS
  // ============================================================================

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page, context }) => {
      // Simulate offline
      await context.setOffline(true);

      // Attempt action
      await page.getByRole('button', { name: /load data/i }).click();

      // Verify offline message
      await expect(page.getByRole('alert')).toContainText(/network error/i);

      // Restore connection
      await context.setOffline(false);

      // Retry should work
      await page.getByRole('button', { name: /retry/i }).click();
      await expect(page.getByText(/data loaded/i)).toBeVisible();
    });

    test('should display meaningful error messages', async ({ page }) => {
      // Trigger error condition
      await page.getByRole('button', { name: /delete/i }).click();

      // Verify user-friendly error
      await expect(page.getByRole('alert')).toContainText(/cannot delete/i);
      await expect(page.getByRole('alert')).not.toContainText(/500 Internal Server Error/i);
    });

    test('should recover from unexpected errors', async ({ page }) => {
      // Navigate to error state
      await page.goto('{{BASE_URL}}/invalid-route');

      // Verify error boundary catches it
      await expect(page.getByText(/something went wrong/i)).toBeVisible();

      // Verify recovery option
      await page.getByRole('button', { name: /go home/i }).click();
      await expect(page).toHaveURL('{{BASE_URL}}');
    });
  });

  // ============================================================================
  // ACCESSIBILITY VALIDATION
  // ============================================================================

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      // Tab through interactive elements
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button').first()).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.getByRole('link').first()).toBeFocused();
    });

    test('should announce changes to screen readers', async ({ page }) => {
      // Trigger dynamic content
      await page.getByRole('button', { name: /show more/i }).click();

      // Verify aria-live region updated
      const liveRegion = page.getByRole('status');
      await expect(liveRegion).toHaveText(/showing additional content/i);
    });
  });

  // ============================================================================
  // PERFORMANCE VALIDATION
  // ============================================================================

  test.describe('Performance', () => {
    test('should load within acceptable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('{{BASE_URL}}/{{FEATURE_PATH}}');
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;

      // Should load in under 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should handle large datasets efficiently', async ({ page }) => {
      // Load page with large dataset
      await page.goto('{{BASE_URL}}/{{FEATURE_PATH}}?items=1000');

      // Verify virtual scrolling or pagination
      const visibleItems = await page.getByRole('listitem').count();

      // Should only render visible items (not all 1000)
      expect(visibleItems).toBeLessThan(100);
    });
  });

  // ============================================================================
  // CROSS-BROWSER COMPATIBILITY
  // ============================================================================

  test.describe('Cross-Browser', () => {
    test('should work consistently across browsers', async ({ page, browserName }) => {
      // Core functionality should work in all browsers
      await page.getByRole('button', { name: /action/i }).click();

      await expect(page.getByText(/success/i)).toBeVisible();

      // Log browser for debugging
      console.log(`Test passed in ${browserName}`);
    });
  });

  // ============================================================================
  // VISUAL REGRESSION (if configured)
  // ============================================================================

  test.describe('Visual Regression', () => {
    test('should match visual snapshot', async ({ page }) => {
      // Take screenshot and compare to baseline
      await expect(page).toHaveScreenshot('{{FEATURE_NAME}}-main.png', {
        maxDiffPixels: 100
      });
    });
  });
});

// ============================================================================
// TEMPLATE METADATA (for generator introspection)
// ============================================================================
export const templateMetadata = {
  type: 'e2e',
  framework: 'playwright',
  targetCoverage: 95,
  patterns: ['user-journey', 'auth-fixture', 'cross-browser', 'accessibility'],
  mcp: {
    servable: true,
    schemaVersion: '1.0',
    capabilities: ['visual-regression', 'cross-browser', 'performance-testing']
  }
};
