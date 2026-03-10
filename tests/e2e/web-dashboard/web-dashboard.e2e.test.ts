/**
 * Enterprise End-to-End Tests - web-dashboard
 * Target: Complete user journey validation
 */

import { test, expect, Page, Browser } from '@playwright/test';
import { E2ETestEnvironment } from '../../helpers/e2e-environment';

let browser: Browser;
let page: Page;
let testEnv: E2ETestEnvironment;

test.describe('web-dashboard E2E Tests', () => {
  test.beforeAll(async () => {
    testEnv = await E2ETestEnvironment.setup();
    browser = await testEnv.getBrowser();
  });

  test.afterAll(async () => {
    await browser.close();
    await testEnv.cleanup();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
    await testEnv.resetTestData();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('User Authentication Flow', () => {
    test('should complete login flow successfully', async () => {
      await page.goto('http://localhost:3000/login');

      await page.fill('[data-testid=email]', 'test@example.com');
      await page.fill('[data-testid=password]', 'TestPassword123!');
      await page.click('[data-testid=login-button]');

      await expect(page).toHaveURL(/dashboard/);
      await expect(page.locator('[data-testid=user-menu]')).toBeVisible();
    });

    test('should handle login errors gracefully', async () => {
      await page.goto('http://localhost:3000/login');

      await page.fill('[data-testid=email]', 'invalid@example.com');
      await page.fill('[data-testid=password]', 'wrongpassword');
      await page.click('[data-testid=login-button]');

      await expect(page.locator('[data-testid=error-message]')).toBeVisible();
      await expect(page.locator('[data-testid=error-message]')).toContainText(
        'Invalid credentials'
      );
    });
  });

  test.describe('Core Application Features', () => {
    test.beforeEach(async () => {
      await testEnv.loginUser(page, 'test@example.com', 'TestPassword123!');
    });

    test('should navigate between main sections', async () => {
      await page.click('[data-testid=nav-projects]');
      await expect(page).toHaveURL(/projects/);

      await page.click('[data-testid=nav-dashboard]');
      await expect(page).toHaveURL(/dashboard/);
    });

    test('should handle data operations correctly', async () => {
      await page.goto('http://localhost:3000/projects');

      await page.click('[data-testid=create-project]');
      await page.fill('[data-testid=project-name]', 'Test Project');
      await page.fill('[data-testid=project-description]', 'Test Description');
      await page.click('[data-testid=save-project]');

      await expect(page.locator('[data-testid=project-list]')).toContainText(
        'Test Project'
      );
    });
  });

  test.describe('Error Handling', () => {
    test('should display appropriate error messages for network failures', async () => {
      // Simulate network failure
      await page.route('**/api/**', (route) => route.abort());

      await page.goto('http://localhost:3000/dashboard');

      await expect(page.locator('[data-testid=error-banner]')).toBeVisible();
      await expect(page.locator('[data-testid=error-banner]')).toContainText(
        'Network error'
      );
    });
  });

  test.describe('Accessibility', () => {
    test('should meet accessibility standards', async () => {
      await page.goto('http://localhost:3000');

      // Check for proper heading structure
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').count();
      expect(headings).toBeGreaterThan(0);

      // Check for alt text on images
      const images = await page.locator('img').count();
      if (images > 0) {
        const imagesWithAlt = await page.locator('img[alt]').count();
        expect(imagesWithAlt).toBe(images);
      }

      // Check for proper form labels
      const inputs = await page.locator('input').count();
      if (inputs > 0) {
        const inputsWithLabels = await page
          .locator('input[aria-label], input[id] + label')
          .count();
        expect(inputsWithLabels).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Performance', () => {
    test('should load pages within acceptable time limits', async () => {
      const startTime = Date.now();
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForLoadState('networkidle');
      const endTime = Date.now();

      const loadTime = endTime - startTime;
      expect(loadTime).toBeLessThan(3000); // 3 seconds max
    });
  });
});
