import { test, expect } from '@playwright/test';
import { waitForReactHydration } from '../src/utils/react-detection';
import { findOAuthButton } from '../src/utils/oauth-selectors';

test.describe('OAuth Button Visual Regression', () => {
  test('Google OAuth button should be visible and styled correctly', async ({
    page,
  }) => {
    // Navigate to login page (with ?login param to bypass landing page)
    const baseUrl = process.env.BASE_URL || 'https://staging.ectropy.ai';
    await page.goto(`${baseUrl}/?login`);

    // Wait for React hydration (skip network idle for auth pages with continuous polling)
    await waitForReactHydration(page, { skipNetworkIdle: true });

    // Find OAuth button
    const googleButton = await findOAuthButton(page, 'google');

    // Verify button is visible
    await expect(googleButton).toBeVisible();

    // Verify button has correct text
    await expect(googleButton).toContainText('Sign in with Google');

    // Verify button is enabled
    await expect(googleButton).toBeEnabled();

    // Take visual snapshot
    await expect(googleButton).toHaveScreenshot('google-oauth-button.png', {
      maxDiffPixels: 100, // Allow minor rendering differences
    });

    console.log('✅ Google OAuth button visual regression test passed');
  });

  test('OAuth button should be present after page navigation', async ({
    page,
  }) => {
    const baseUrl = process.env.BASE_URL || 'https://staging.ectropy.ai';

    // Navigate to login page and verify button exists
    await page.goto(`${baseUrl}/?login`);
    await waitForReactHydration(page, { skipNetworkIdle: true });

    // Verify button exists
    const googleButton1 = await findOAuthButton(page, 'google');
    await expect(googleButton1).toBeVisible();

    // Navigate to landing page
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');

    // Navigate back to login page
    await page.goto(`${baseUrl}/?login`);
    await waitForReactHydration(page, { skipNetworkIdle: true });

    // Verify button still exists after navigation
    const googleButton2 = await findOAuthButton(page, 'google');
    await expect(googleButton2).toBeVisible();

    console.log('✅ OAuth button persists across navigation');
  });
});
