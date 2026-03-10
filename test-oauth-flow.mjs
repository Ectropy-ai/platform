#!/usr/bin/env node
/**
 * OAuth Flow Diagnostic Test
 *
 * This script tests the OAuth flow on staging to diagnose the session cookie issue.
 * Run with: node test-oauth-flow.mjs
 */

import { chromium } from '@playwright/test';

const STAGING_URL = 'https://staging.ectropy.ai';

async function testOAuthFlow() {
  console.log('🔍 Starting OAuth Flow Diagnostic Test');
  console.log('================================\n');

  const browser = await chromium.launch({
    headless: false,  // Show browser so we can see what's happening
    slowMo: 1000      // Slow down actions so we can observe
  });

  const context = await browser.newContext({
    // Record all network activity
    recordVideo: { dir: './test-results/oauth-debug/' },
  });

  const page = await context.newPage();

  // Enable request/response logging
  page.on('request', request => {
    if (request.url().includes('auth') || request.url().includes('dashboard')) {
      console.log(`➡️  REQUEST: ${request.method()} ${request.url()}`);
      const cookies = request.headers()['cookie'];
      if (cookies) {
        console.log(`   🍪 Cookies: ${cookies.substring(0, 100)}...`);
      } else {
        console.log(`   🍪 No cookies sent`);
      }
    }
  });

  page.on('response', async response => {
    if (response.url().includes('auth') || response.url().includes('dashboard')) {
      console.log(`⬅️  RESPONSE: ${response.status()} ${response.url()}`);
      const setCookie = response.headers()['set-cookie'];
      if (setCookie) {
        console.log(`   🍪 Set-Cookie: ${setCookie.substring(0, 100)}...`);
      }
    }
  });

  page.on('console', msg => {
    console.log(`   📝 PAGE LOG: ${msg.text()}`);
  });

  try {
    // Step 1: Navigate to landing page
    console.log('\n📍 Step 1: Navigate to staging...');
    await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: './test-results/01-landing-page.png', fullPage: true });
    console.log(`✅ Loaded: ${page.url()}`);

    // Step 2: Check cookies before OAuth
    console.log('\n📍 Step 2: Check initial cookies...');
    const initialCookies = await context.cookies();
    console.log(`   Found ${initialCookies.length} cookies:`, initialCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`));

    // Step 3: Click "Sign in with Google"
    console.log('\n📍 Step 3: Looking for Google Sign-in button...');
    await page.waitForTimeout(2000);  // Wait for page to hydrate

    // Note: We'll stop here for manual testing
    // The user will need to manually complete Google OAuth
    console.log('\n⚠️  MANUAL STEP REQUIRED:');
    console.log('   1. Click "Sign in with Google" in the browser window');
    console.log('   2. Complete Google OAuth flow');
    console.log('   3. Watch the console output for diagnostic info');
    console.log('\n   Browser will stay open for 120 seconds...\n');

    // Wait for OAuth callback or timeout
    await page.waitForURL('**/dashboard', { timeout: 120000 }).catch(() => {
      console.log('⚠️  Timeout waiting for dashboard redirect');
    });

    // Step 4: Check what happened after OAuth
    console.log('\n📍 Step 4: Analyzing post-OAuth state...');
    console.log(`   Current URL: ${page.url()}`);

    const postOAuthCookies = await context.cookies();
    console.log(`\n   🍪 Cookies after OAuth (${postOAuthCookies.length} total):`);
    postOAuthCookies.forEach(cookie => {
      console.log(`      - ${cookie.name}: ${cookie.value.substring(0, 30)}...`);
      console.log(`        Domain: ${cookie.domain}, Secure: ${cookie.secure}, HttpOnly: ${cookie.httpOnly}, SameSite: ${cookie.sameSite}`);
    });

    const oauthSessionCookie = postOAuthCookies.find(c => c.name === 'oauth_session');
    if (oauthSessionCookie) {
      console.log('\n   ✅ oauth_session cookie is present!');
      console.log(`      Value: ${oauthSessionCookie.value.substring(0, 50)}...`);
      console.log(`      Domain: ${oauthSessionCookie.domain}`);
      console.log(`      Secure: ${oauthSessionCookie.secure}`);
    } else {
      console.log('\n   ❌ oauth_session cookie is MISSING!');
      console.log('      This explains why /api/auth/me returns 401');
    }

    // Step 5: Try calling /api/auth/me directly
    console.log('\n📍 Step 5: Testing /api/auth/me endpoint...');
    const meResponse = await page.goto(`${STAGING_URL}/api/auth/me`, { waitUntil: 'domcontentloaded' });
    const meStatus = meResponse?.status();
    console.log(`   Status: ${meStatus}`);

    if (meStatus === 200) {
      const meData = await meResponse?.json();
      console.log('   ✅ User authenticated:', meData);
    } else {
      const meBody = await meResponse?.text();
      console.log('   ❌ Not authenticated');
      console.log('   Response:', meBody?.substring(0, 200));
    }

    await page.screenshot({ path: './test-results/05-final-state.png', fullPage: true });

  } catch (error) {
    console.error('\n❌ Error during test:', error);
    await page.screenshot({ path: './test-results/ERROR-state.png', fullPage: true });
  }

  console.log('\n================================');
  console.log('🔍 Test Complete');
  console.log('   Screenshots saved to ./test-results/');
  console.log('   Press Ctrl+C to close browser');

  // Keep browser open for manual inspection
  await page.waitForTimeout(60000);

  await browser.close();
}

testOAuthFlow().catch(console.error);
