import { test, expect } from '@playwright/test';

/**
 * Staging Environment E2E Tests
 * 
 * Tests the OAuth login flow and other critical features on staging environment.
 * These tests validate the authentication UI and basic page functionality.
 */

test.describe('Staging Environment - OAuth Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to staging URL (configurable via environment)
    const baseUrl = process.env.STAGING_URL || 'http://localhost:4200';
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
  });

  test('OAuth button should be present', async ({ page }) => {
    // Wait for the Google OAuth button to be visible
    const googleOAuthButton = page.locator('[data-testid="google-oauth-button"]');
    await googleOAuthButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Verify button is visible and enabled
    await expect(googleOAuthButton).toBeVisible();
    await expect(googleOAuthButton).toBeEnabled();
    
    // Verify button has correct text
    await expect(googleOAuthButton).toHaveText('Sign in with Google');
    
    // Verify button has correct aria-label for accessibility
    await expect(googleOAuthButton).toHaveAttribute('aria-label', 'Sign in with Google');
  });

  test('GitHub OAuth button should be present', async ({ page }) => {
    // Wait for the GitHub OAuth button to be visible
    const githubOAuthButton = page.locator('[data-testid="github-oauth-button"]');
    await githubOAuthButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Verify button is visible and enabled
    await expect(githubOAuthButton).toBeVisible();
    await expect(githubOAuthButton).toBeEnabled();
    
    // Verify button has correct text
    await expect(githubOAuthButton).toHaveText('Sign in with GitHub');
  });

  test('OAuth buttons should have proper styling', async ({ page }) => {
    const googleButton = page.locator('[data-testid="google-oauth-button"]');
    const githubButton = page.locator('[data-testid="github-oauth-button"]');
    
    // Both buttons should be visible
    await expect(googleButton).toBeVisible();
    await expect(githubButton).toBeVisible();
    
    // Google button should be contained variant (primary)
    await expect(googleButton).toHaveClass(/MuiButton-contained/);
    
    // GitHub button should be outlined variant
    await expect(githubButton).toHaveClass(/MuiButton-outlined/);
  });

  test('Page loads successfully with OAuth components', async ({ page }) => {
    // Verify page title
    await expect(page).toHaveTitle(/Ectropy/i);
    
    // Verify login card is present
    const loginCard = page.locator('.MuiCard-root');
    await expect(loginCard).toBeVisible();
    
    // Verify heading
    const heading = page.locator('h1, [role="heading"]').first();
    await expect(heading).toContainText(/sign in/i);
    
    // Verify both OAuth buttons are present
    const googleButton = page.locator('[data-testid="google-oauth-button"]');
    const githubButton = page.locator('[data-testid="github-oauth-button"]');
    
    await expect(googleButton).toBeVisible();
    await expect(githubButton).toBeVisible();
  });

  test('OAuth buttons have correct icons', async ({ page }) => {
    // Check for Google icon
    const googleButton = page.locator('[data-testid="google-oauth-button"]');
    const googleIcon = googleButton.locator('svg.MuiSvgIcon-root').first();
    await expect(googleIcon).toBeVisible();
    
    // Check for GitHub icon
    const githubButton = page.locator('[data-testid="github-oauth-button"]');
    const githubIcon = githubButton.locator('svg.MuiSvgIcon-root').first();
    await expect(githubIcon).toBeVisible();
  });

  test('Alternative selector strategies work', async ({ page }) => {
    // Test that role-based selectors also work (fallback strategy)
    const googleByRole = page.getByRole('button', { name: 'Sign in with Google' });
    await expect(googleByRole).toBeVisible();
    
    const githubByRole = page.getByRole('button', { name: 'Sign in with GitHub' });
    await expect(githubByRole).toBeVisible();
    
    // Test text-based selector (another fallback)
    const googleByText = page.getByText('Sign in with Google');
    await expect(googleByText).toBeVisible();
  });
});

test.describe('Staging Environment - Page Performance', () => {
  test('Page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    const baseUrl = process.env.STAGING_URL || 'http://localhost:4200';
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    
    const loadTime = Date.now() - startTime;
    
    // Page should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
    
    // Verify OAuth buttons loaded
    await expect(page.locator('[data-testid="google-oauth-button"]')).toBeVisible();
  });

  test('Page content loads completely', async ({ page }) => {
    const baseUrl = process.env.STAGING_URL || 'http://localhost:4200';
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    
    // Wait for all content to be visible
    await page.waitForLoadState('domcontentloaded');
    
    // Get page content length
    const content = await page.content();
    
    // Page should have substantial content (more than 2000 characters as mentioned in issue)
    expect(content.length).toBeGreaterThan(2000);
  });
});
