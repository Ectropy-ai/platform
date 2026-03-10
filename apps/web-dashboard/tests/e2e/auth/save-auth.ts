/**
 * Save Authentication State Script
 *
 * This script launches a REAL browser (not headless) to allow manual
 * Google OAuth authentication, then saves the session state for Playwright tests.
 *
 * IMPORTANT: Google blocks OAuth in automation browsers.
 * This script uses a real browser profile to work around this limitation.
 *
 * Usage:
 *   npx playwright test save-auth.ts --project=chromium --headed
 *
 * Or use the Playwright CLI directly:
 *   npx playwright open http://localhost --save-storage=playwright/.auth/state.json
 */

import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '..', 'playwright', '.auth', 'state.json');

async function saveAuthState() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         MANUAL AUTHENTICATION REQUIRED                          ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║ 1. A browser window will open                                   ║');
  console.log('║ 2. Click "Sign In" on the landing page                          ║');
  console.log('║ 3. Complete Google OAuth with ectropytest@gmail.com             ║');
  console.log('║ 4. Wait for redirect to dashboard                               ║');
  console.log('║ 5. Close the browser to save auth state                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Ensure auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Launch with persistent context to allow real OAuth
  // This creates a real browser profile that Google doesn't flag
  const userDataDir = path.join(__dirname, '..', 'playwright', '.browser-profile');

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // MUST be false for Google OAuth
    channel: 'chrome', // Use real Chrome, not Chromium
    viewport: { width: 1280, height: 720 },
    args: [
      '--disable-blink-features=AutomationControlled', // Hide automation
      '--disable-infobars', // Hide "Chrome is being controlled"
    ],
  });

  const page = browser.pages()[0] || await browser.newPage();

  // Navigate to app
  await page.goto('http://localhost');

  console.log('\n⏳ Waiting for authentication...');
  console.log('   Navigate to dashboard after OAuth to confirm login.\n');

  // Wait for user to complete OAuth and reach dashboard
  // This will wait until the URL contains /dashboard or user closes browser
  try {
    await page.waitForURL('**/dashboard**', { timeout: 300000 }); // 5 minute timeout
    console.log('✅ Authentication successful! Saving state...');
  } catch (error) {
    console.log('⚠️ Timeout or browser closed. Attempting to save current state...');
  }

  // Save the storage state (cookies, localStorage)
  await browser.storageState({ path: AUTH_FILE });

  await browser.close();

  // Verify the auth file was created
  if (fs.existsSync(AUTH_FILE)) {
    const stats = fs.statSync(AUTH_FILE);
    console.log(`\n✅ Auth state saved to: ${AUTH_FILE}`);
    console.log(`   File size: ${stats.size} bytes`);
    console.log('\nYou can now run authenticated tests with:');
    console.log('  npx playwright test authenticated-assessment --project=chromium\n');
  } else {
    console.error('\n❌ Failed to save auth state');
  }
}

// Run if executed directly
saveAuthState().catch(console.error);
