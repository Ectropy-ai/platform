#!/usr/bin/env node
/**
 * Detailed OAuth Callback Diagnostic
 *
 * This captures the exact failure point in the OAuth flow
 */

import { chromium } from '@playwright/test';

const STAGING_URL = 'https://staging.ectropy.ai';

async function testOAuthDetailed() {
  console.log('🔍 Detailed OAuth Diagnostic');
  console.log('================================\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture all network activity
  const requests = [];
  const responses = [];

  page.on('request', request => {
    const url = request.url();
    if (url.includes('auth') || url.includes('dashboard') || url.includes('callback')) {
      requests.push({
        url,
        method: request.method(),
        headers: request.headers(),
      });
      console.log(`📤 REQUEST: ${request.method()} ${url}`);
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('auth') || url.includes('dashboard') || url.includes('callback')) {
      const data = {
        url,
        status: response.status(),
        headers: response.headers(),
      };

      // Try to get response body
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          data.body = await response.json();
        } else if (contentType.includes('text') || contentType.includes('html')) {
          const text = await response.text();
          data.body = text.substring(0, 500);
        }
      } catch (e) {
        // Can't read body (redirect or binary)
      }

      responses.push(data);

      console.log(`📥 RESPONSE: ${response.status()} ${url}`);
      if (response.status() === 401) {
        console.log('   ❌ 401 UNAUTHORIZED - Session check failed!');
        if (data.body) {
          console.log('   Body:', JSON.stringify(data.body, null, 2).substring(0, 300));
        }
      } else if (response.status() >= 400) {
        console.log(`   ❌ ERROR ${response.status()}`);
        if (data.body) {
          console.log('   Body:', JSON.stringify(data.body, null, 2).substring(0, 300));
        }
      } else if (response.status() === 302 || response.status() === 301) {
        const location = response.headers()['location'];
        console.log(`   🔀 REDIRECT to: ${location}`);
      }
    }
  });

  try {
    console.log('1️⃣ Navigating to staging...\n');
    await page.goto(STAGING_URL);
    await page.waitForTimeout(2000);

    console.log('\n2️⃣ Please complete these steps:');
    console.log('   - Click "Sign in with Google"');
    console.log('   - Complete Google OAuth');
    console.log('   - Observe what happens\n');
    console.log('⏳ Waiting for OAuth flow (2 minutes)...\n');

    // Wait for OAuth to complete or redirect
    let finalUrl;
    try {
      await page.waitForURL('**/dashboard', { timeout: 120000 });
      finalUrl = page.url();
      console.log('✅ Reached dashboard!');
    } catch (e) {
      finalUrl = page.url();
      console.log(`⚠️  Did not reach dashboard. Current URL: ${finalUrl}`);
    }

    console.log('\n📊 DIAGNOSTIC SUMMARY');
    console.log('================================\n');
    console.log(`Final URL: ${finalUrl}`);

    if (finalUrl.includes('oauth_failed')) {
      console.log('\n❌ OAuth Failed - Analyzing failure...\n');

      // Find the /api/auth/me request
      const meRequest = responses.find(r => r.url.includes('/api/auth/me'));
      if (meRequest) {
        console.log('🔍 Session Check (/api/auth/me):');
        console.log(`   Status: ${meRequest.status}`);
        if (meRequest.status === 401) {
          console.log('   ❌ Session not found - no oauth_session cookie OR user not in session');
          console.log('   Response:', JSON.stringify(meRequest.body, null, 2));
        }
      }

      // Find the callback request
      const callbackRequest = responses.find(r => r.url.includes('/callback'));
      if (callbackRequest) {
        console.log('\n🔍 OAuth Callback:');
        console.log(`   Status: ${callbackRequest.status}`);
        if (callbackRequest.status >= 400) {
          console.log('   ❌ Callback failed!');
          console.log('   Response:', JSON.stringify(callbackRequest.body, null, 2));
        }
      }
    }

    // Check cookies
    console.log('\n🍪 Final Cookies:');
    const cookies = await context.cookies();
    cookies.forEach(c => {
      console.log(`   ${c.name}: ${c.value.substring(0, 30)}... (domain: ${c.domain}, secure: ${c.secure})`);
    });

    const oauthCookie = cookies.find(c => c.name === 'oauth_session');
    if (!oauthCookie) {
      console.log('\n   ❌ NO oauth_session cookie found!');
      console.log('   This is why /api/auth/me returns 401');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }

  console.log('\n================================');
  console.log('Press Ctrl+C to close\n');
  await page.waitForTimeout(60000);
  await browser.close();
}

testOAuthDetailed().catch(console.error);
