import { Page, Locator } from '@playwright/test';

/**
 * OAuth Button Selector Strategy (in order of preference):
 * 1. data-testid attribute (most reliable)
 * 2. aria-label attribute (accessibility-friendly)
 * 3. Text content (flexible matching)
 * 4. CSS class combination (last resort)
 */
export const OAUTH_SELECTORS = {
  google: {
    primary: '[data-testid="google-oauth-button"]',
    ariaLabel: 'button[aria-label="Sign in with Google"]',
    textExact: 'button:has-text("Sign in with Google")',
    textPartial: 'button:has-text("Google")',
    classCombo: 'button.oauth-button.google-oauth',
  },
  github: {
    primary: '[data-testid="github-oauth-button"]',
    ariaLabel: 'button[aria-label="Sign in with GitHub"]',
    textExact: 'button:has-text("Sign in with GitHub")',
    textPartial: 'button:has-text("GitHub")',
    classCombo: 'button.oauth-button.github-oauth',
  }
};

/**
 * Find OAuth button using fallback selector strategy
 * Tries multiple selectors in order until one succeeds
 */
export async function findOAuthButton(
  page: Page,
  provider: 'google' | 'github',
  timeout: number = 30000
): Promise<Locator> {
  console.log(`🔍 [OAUTH] Searching for ${provider} OAuth button with fallback strategy...`);
  
  const selectors = OAUTH_SELECTORS[provider];
  const selectorKeys = Object.keys(selectors) as Array<keyof typeof selectors>;
  
  for (const key of selectorKeys) {
    const selector = selectors[key];
    console.log(`📍 [OAUTH] Trying selector [${key}]: ${selector}`);
    
    try {
      // Check if element exists
      const locator = page.locator(selector);
      const count = await locator.count();
      
      if (count > 0) {
        console.log(`✅ [OAUTH] Found ${count} element(s) with selector [${key}]`);
        
        // Wait for first element to be visible
        await locator.first().waitFor({ state: 'visible', timeout: 5000 });
        console.log(`✅ [OAUTH] Element is visible`);
        
        // Capture success screenshot
        const screenshotPath = `auth-debug/oauth-button-found-${key}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`📸 [OAUTH] Success screenshot saved: ${screenshotPath}`);
        
        return locator.first();
      } else {
        console.log(`⚠️ [OAUTH] No elements found with selector [${key}]`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ [OAUTH] Selector [${key}] failed:`, errorMessage);
    }
  }
  
  // All selectors failed - capture debug information
  console.error(`❌ [OAUTH] All ${selectorKeys.length} selectors failed for ${provider} OAuth button`);
  
  // Capture failure screenshot
  const screenshotPath = `auth-debug/no-oauth-button-found.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 [OAUTH] Failure screenshot saved: ${screenshotPath}`);
  
  // Log page state
  const buttons = await page.locator('button').count();
  console.log(`📊 [OAUTH] Total buttons on page: ${buttons}`);
  
  const buttonTexts = await page.locator('button').allTextContents();
  console.log(`📊 [OAUTH] Button texts:`, buttonTexts);
  
  throw new Error(`Could not find ${provider} OAuth button after trying ${selectorKeys.length} selectors`);
}
