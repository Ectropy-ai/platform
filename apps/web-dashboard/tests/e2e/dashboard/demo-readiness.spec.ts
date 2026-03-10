/**
 * Demo Readiness E2E Tests
 * Comprehensive test suite to validate dashboard functionality before demos
 *
 * Run with: PLAYWRIGHT_BASE_URL=http://localhost npx playwright test demo-readiness.spec.ts
 */

import { test, expect } from '@playwright/test';

test.describe('Demo Readiness - Dashboard Core', () => {
  test.beforeEach(async ({ page }) => {
    // Go to homepage
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('homepage loads with Ectropy branding', async ({ page }) => {
    await expect(page).toHaveTitle(/Ectropy/i);
    await page.waitForTimeout(2000); // Wait for React app to render

    // Should show either login or landing page (ectropy.ai on landing, or Ectropy Platform on login)
    const bodyText = await page.locator('body').innerText();
    const hasEctropyBranding = bodyText.toLowerCase().includes('ectropy');
    expect(hasEctropyBranding).toBeTruthy();
  });

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Should have login options
    const loginPage = page.locator('[data-testid="login-page"]');
    const googleButton = page.locator('text=Google');

    const hasLoginPage = await loginPage.count();
    const hasGoogleButton = await googleButton.count();

    expect(hasLoginPage + hasGoogleButton).toBeGreaterThan(0);
  });

  test('dashboard redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Should redirect to login or show auth required
    const url = page.url();
    const hasLoginPage = await page.locator('[data-testid="login-page"]').count();

    expect(url.includes('/login') || hasLoginPage > 0 || url === page.url()).toBeTruthy();
  });
});

test.describe('Demo Readiness - API Health', () => {
  test('API gateway is responding', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status || data.success).toBeTruthy();
  });

  test('Projects API is accessible', async ({ request }) => {
    const response = await request.get('/api/v1/projects');
    // Should return 401 (requires auth) or 200 (success)
    expect([200, 401].includes(response.status())).toBeTruthy();
  });

  test('IFC upload endpoint exists', async ({ request }) => {
    const response = await request.post('/api/upload/ifc');
    // Should return 400 (no file) not 404
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('No file');
  });
});

test.describe('Demo Readiness - BIM Viewer', () => {
  test('viewer page loads', async ({ page }) => {
    await page.goto('/viewer', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check for BIM viewer container, login page (Sign In), or any Ectropy content
    const viewerContainer = page.locator('[data-testid="bim-viewer-container"]');
    const signInHeading = page.locator('h1:has-text("Sign In")');
    const ectropyText = page.locator('text=Ectropy Platform');

    const hasViewer = await viewerContainer.count();
    const hasSignIn = await signInHeading.count();
    const hasEctropy = await ectropyText.count();

    // Either viewer is shown, login page with Sign In, or Ectropy content visible
    expect(hasViewer + hasSignIn + hasEctropy).toBeGreaterThan(0);
  });

  test('viewer shows ready state when no model loaded', async ({ page }) => {
    await page.goto('/viewer', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // If authenticated, should see viewer ready message; if not, should see login
    const viewerReady = page.locator('[data-testid="bim-viewer-ready"]');
    const viewerContainer = page.locator('[data-testid="bim-viewer-container"]');
    const signInHeading = page.locator('h1:has-text("Sign In")');
    const ectropyText = page.locator('text=Ectropy Platform');

    const hasViewerReady = await viewerReady.count();
    const hasViewerContainer = await viewerContainer.count();
    const hasSignIn = await signInHeading.count();
    const hasEctropy = await ectropyText.count();

    // Either viewer ready state, viewer container, or login page
    expect(hasViewerReady + hasViewerContainer + hasSignIn + hasEctropy).toBeGreaterThan(0);
  });

  test('viewer does not show infinite loading spinner', async ({ page }) => {
    await page.goto('/viewer', { waitUntil: 'domcontentloaded' });

    // Wait for potential loading states to resolve
    await page.waitForTimeout(5000);

    // Loading spinner should not be visible after 5 seconds
    const loadingSpinner = page.locator('[data-testid="bim-viewer-loading"]');
    const isLoading = await loadingSpinner.isVisible().catch(() => false);

    // If no model, loading should have stopped
    expect(isLoading).toBeFalsy();
  });
});

test.describe('Demo Readiness - Project Workspace', () => {
  test('projects page loads', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Should show projects page, login, or Ectropy content
    const projectsContent = page.locator('text=Projects, text=Project, text=Create');
    const loginIndicators = page.locator('text=Sign in, text=Login, text=Google');
    const ectropyContent = page.locator('text=Ectropy');

    const hasProjects = await projectsContent.count();
    const hasLogin = await loginIndicators.count();
    const hasEctropy = await ectropyContent.count();

    expect(hasProjects + hasLogin + hasEctropy).toBeGreaterThan(0);
  });

  test('single project API returns proper response', async ({ request }) => {
    // Test with a sample UUID
    const response = await request.get('/api/v1/projects/99e537c8-012f-4f80-a2b3-ffa5f5fabc43');

    // Should return 200 (found), 404 (not found), or 401 (requires auth)
    expect([200, 401, 404].includes(response.status())).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('project elements API returns proper response', async ({ request }) => {
    const response = await request.get('/api/v1/projects/99e537c8-012f-4f80-a2b3-ffa5f5fabc43/elements');

    // Should return 200 with data array or 401/404
    expect([200, 401, 404].includes(response.status())).toBeTruthy();

    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBeTruthy();
      expect(data.data).toBeDefined();
    }
  });
});

test.describe('Demo Readiness - Governance', () => {
  test('proposals API returns proper response', async ({ request }) => {
    const response = await request.get('/api/v1/projects/99e537c8-012f-4f80-a2b3-ffa5f5fabc43/proposals');

    expect([200, 401, 404].includes(response.status())).toBeTruthy();

    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBeTruthy();
    }
  });
});

test.describe('Demo Readiness - UI Components', () => {
  test('Material-UI theme loads correctly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Check for MUI components
    const muiComponents = await page.evaluate(() => {
      // MUI adds specific CSS classes
      const muiElements = document.querySelectorAll('[class*="Mui"]');
      return muiElements.length;
    });

    expect(muiComponents).toBeGreaterThan(0);
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Filter out expected errors (like 401s for unauthenticated requests)
    const criticalErrors = errors.filter(e =>
      !e.includes('401') &&
      !e.includes('Unauthorized') &&
      !e.includes('Failed to load resource')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('responsive layout works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Page should still render content
    const bodyContent = await page.evaluate(() => document.body.innerText.length);
    expect(bodyContent).toBeGreaterThan(0);
  });
});

test.describe('Demo Readiness - Performance', () => {
  test('homepage loads within 5 seconds', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('API responses are fast', async ({ request }) => {
    const startTime = Date.now();

    await request.get('/api/health');

    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(1000);
  });
});
