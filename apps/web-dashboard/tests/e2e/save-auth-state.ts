/**
 * Save Authentication State Script
 *
 * This script opens a browser and waits for you to log in,
 * then saves the auth state for use in tests.
 *
 * Usage:
 *   cd apps/web-dashboard
 *   npx ts-node tests/e2e/save-auth-state.ts
 *
 * Or via Playwright:
 *   npx playwright codegen http://localhost --save-storage=auth.json
 */

import { chromium } from '@playwright/test';
import * as readline from 'readline';

async function saveAuthState() {
  console.log('\n🔐 Authentication State Capture Tool\n');
  console.log('1. A browser will open to http://localhost');
  console.log('2. Log in using OAuth (Google)');
  console.log('3. Wait until you see the dashboard');
  console.log('4. Press Enter in this terminal to save state\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost');

  // Wait for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise<void>((resolve) => {
    rl.question('\n✅ Press Enter after logging in to save auth state...', () => {
      rl.close();
      resolve();
    });
  });

  // Save storage state
  await context.storageState({ path: 'auth.json' });
  console.log('\n✅ Auth state saved to auth.json');
  console.log('You can now run authenticated tests:\n');
  console.log('  PLAYWRIGHT_BASE_URL=http://localhost npx playwright test authenticated-assessment --project=chromium\n');

  await browser.close();
}

saveAuthState().catch(console.error);
