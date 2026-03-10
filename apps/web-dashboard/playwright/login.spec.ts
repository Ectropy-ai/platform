import { expect, test } from '@playwright/test';

test('OAuth login button should be present and visible', async ({ page }) => {
  await page.goto('http://localhost:4200');
  
  // Wait for the OAuth button to be visible
  const googleOAuthButton = page.locator('[data-testid="google-oauth-button"]');
  await googleOAuthButton.waitFor({ state: 'visible', timeout: 10000 });
  
  // Verify button is visible and enabled
  await expect(googleOAuthButton).toBeVisible();
  await expect(googleOAuthButton).toBeEnabled();
  
  // Verify button text content
  await expect(googleOAuthButton).toHaveText('Sign in with Google');
  
  // Verify GitHub OAuth button also exists
  const githubOAuthButton = page.locator('[data-testid="github-oauth-button"]');
  await expect(githubOAuthButton).toBeVisible();
  await expect(githubOAuthButton).toHaveText('Sign in with GitHub');
});
