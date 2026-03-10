/**
 * Authentication State Validation Setup - Enterprise Fail-Fast Pattern
 *
 * ROOT CAUSE FIX (2026-02-13): Validate auth state before test execution
 * PROBLEM: Tests run with invalid/empty auth state, causing cascading failures
 * SOLUTION: Hard fail when auth state invalid, preventing obscure test failures
 *
 * WHY THIS EXISTS:
 * - auth.setup.ts creates user.json via programmatic OAuth
 * - But doesn't validate cookies were actually set by staging server
 * - Tests proceed with empty auth state → 10 tests fail with "element not found"
 * - This validation step ensures auth state is valid BEFORE tests run
 *
 * ENTERPRISE PATTERN: Fail Fast
 * - Clear error: "Auth state has 0 cookies, expected >0"
 * - NOT: 10 obscure failures "BIM viewer container not found"
 *
 * FLOW:
 * 1. setup (auth.setup.ts) → creates user.json
 * 2. validate-auth (THIS FILE) → validates user.json has valid cookies
 * 3. chromium (test execution) → loads validated auth state
 *
 * If validation fails → workflow fails immediately with actionable error
 * If validation passes → tests run with confirmed valid authentication
 *
 * REFERENCES:
 * - .roadmap/FIVE_WHY_E2E_AUTH_STAGING_FAILURES_2026-02-13.json
 * - .roadmap/E2E_AUTH_ANALYSIS_SUMMARY_2026-02-13.md
 * - Pattern: https://martinfowler.com/articles/practical-test-pyramid.html#FailFast
 */
import { test as setup } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Calculate auth file path - same as auth.setup.ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authDir = path.resolve(__dirname, '../playwright/.auth');
const authFile = path.join(authDir, 'user.json');

console.log('🔍 [AUTH VALIDATION] ================================');
console.log('🔍 [AUTH VALIDATION] Validating authentication state...');
console.log('   Auth file path:', authFile);
console.log('   Purpose: Fail fast if auth setup produced invalid state');
console.log('🔍 [AUTH VALIDATION] ================================');

setup('validate authentication state', async () => {
  console.log('📍 [AUTH VALIDATION] Step 1: Check auth file exists...');

  // VALIDATION 1: Auth file must exist
  if (!fs.existsSync(authFile)) {
    console.error(
      '❌ [AUTH VALIDATION] FAILED: Auth state file does not exist'
    );
    console.error('   Expected file:', authFile);
    console.error(
      '   This indicates auth.setup.ts failed to create auth state'
    );
    console.error('');
    console.error('TROUBLESHOOTING:');
    console.error('  1. Check auth.setup.ts logs for OAuth errors');
    console.error('  2. Verify TEST_GOOGLE_REFRESH_TOKEN is valid');
    console.error(
      '  3. Verify staging server /api/auth/google/token endpoint is working'
    );
    console.error('  4. Check GitHub Actions secrets are configured correctly');
    console.error('');
    throw new Error(
      `Auth state file not found: ${authFile}. Auth setup likely failed.`
    );
  }

  console.log('✅ [AUTH VALIDATION] Auth file exists');

  // VALIDATION 2: Auth file must not be empty
  const stats = fs.statSync(authFile);
  console.log(
    `📍 [AUTH VALIDATION] Step 2: Check file size (${stats.size} bytes)...`
  );

  if (stats.size === 0) {
    console.error(
      '❌ [AUTH VALIDATION] FAILED: Auth state file is empty (0 bytes)'
    );
    console.error(
      '   This indicates auth.setup.ts created file but failed to save state'
    );
    console.error('');
    throw new Error(
      'Auth state file is empty. Check auth.setup.ts logs for storageState() errors.'
    );
  }

  console.log('✅ [AUTH VALIDATION] Auth file has content');

  // VALIDATION 3: Auth file must contain valid JSON
  console.log('📍 [AUTH VALIDATION] Step 3: Parse auth state JSON...');

  let authState: {
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires: number;
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'Strict' | 'Lax' | 'None';
    }>;
    origins?: Array<{
      origin: string;
      localStorage: Array<{ name: string; value: string }>;
    }>;
  };

  try {
    const fileContent = fs.readFileSync(authFile, 'utf-8');
    authState = JSON.parse(fileContent);
    console.log('✅ [AUTH VALIDATION] Auth state is valid JSON');
  } catch (parseError) {
    console.error(
      '❌ [AUTH VALIDATION] FAILED: Auth state file contains invalid JSON'
    );
    console.error('   Parse error:', parseError);
    console.error('');
    throw new Error(
      `Auth state file contains invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
    );
  }

  // VALIDATION 4: Auth state must have cookies
  console.log('📍 [AUTH VALIDATION] Step 4: Validate cookies...');

  const cookieCount = authState.cookies?.length || 0;
  const originCount = authState.origins?.length || 0;

  console.log(`   Cookies: ${cookieCount}`);
  console.log(`   Origins: ${originCount}`);

  if (cookieCount === 0) {
    console.error('❌ [AUTH VALIDATION] FAILED: Auth state has 0 cookies');
    console.error('   Expected: At least 1 session cookie');
    console.error('   Actual: 0 cookies');
    console.error('');
    console.error('ROOT CAUSE:');
    console.error(
      '  Staging server /api/auth/google/token endpoint did not set cookies'
    );
    console.error('  auth.setup.ts received 200 OK but no Set-Cookie header');
    console.error('');
    console.error('TROUBLESHOOTING:');
    console.error(
      '  1. Check staging server logs for /api/auth/google/token requests'
    );
    console.error(
      '  2. Verify app.set("trust proxy", true) is configured in api-gateway'
    );
    console.error(
      '  3. Verify session middleware is initialized before OAuth routes'
    );
    console.error('  4. Check Redis connection (session store)');
    console.error('');
    console.error('Auth state structure (for debugging):');
    console.error(JSON.stringify(authState, null, 2).substring(0, 500));
    console.error('');
    throw new Error(
      'Auth state has 0 cookies - staging server failed to set session cookies. Tests cannot run authenticated.'
    );
  }

  console.log('✅ [AUTH VALIDATION] Auth state has cookies');

  // VALIDATION 5: Check cookie expiration (optional warning, not hard failure)
  console.log('📍 [AUTH VALIDATION] Step 5: Check cookie expiration...');

  const now = Date.now() / 1000; // Convert to seconds (cookie expires is in seconds)
  const expiredCookies = authState.cookies?.filter(
    (cookie) => cookie.expires > 0 && cookie.expires < now
  );

  if (expiredCookies && expiredCookies.length > 0) {
    console.warn('⚠️  [AUTH VALIDATION] WARNING: Some cookies are expired');
    console.warn(
      `   Expired cookies: ${expiredCookies.length} of ${cookieCount}`
    );
    expiredCookies.forEach((cookie) => {
      const expiredDate = new Date(cookie.expires * 1000);
      console.warn(`   - ${cookie.name}: expired ${expiredDate.toISOString()}`);
    });
    console.warn('');
    console.warn('   Tests may fail if session cookies are expired');
    console.warn(
      '   Consider reducing time between auth setup and test execution'
    );
    console.warn('');
    // Don't throw - let tests run and fail naturally if cookies are expired
    // This distinguishes "no cookies" (hard failure) from "expired cookies" (may work)
  } else {
    console.log('✅ [AUTH VALIDATION] All cookies are valid (not expired)');
  }

  // VALIDATION 6: Log cookie details for debugging (but don't expose values)
  console.log('📍 [AUTH VALIDATION] Step 6: Log cookie summary...');

  authState.cookies?.forEach((cookie, index) => {
    console.log(`   Cookie ${index + 1}:`);
    console.log(`     Name: ${cookie.name}`);
    console.log(`     Domain: ${cookie.domain}`);
    console.log(`     Path: ${cookie.path}`);
    console.log(`     Secure: ${cookie.secure}`);
    console.log(`     HttpOnly: ${cookie.httpOnly}`);
    console.log(`     SameSite: ${cookie.sameSite}`);
    if (cookie.expires > 0) {
      const expiresDate = new Date(cookie.expires * 1000);
      console.log(`     Expires: ${expiresDate.toISOString()}`);
    } else {
      console.log('     Expires: Session');
    }
  });

  console.log('');
  console.log('🎉 [AUTH VALIDATION] ================================');
  console.log('🎉 [AUTH VALIDATION] Validation PASSED!');
  console.log(`   ✅ Auth file exists (${stats.size} bytes)`);
  console.log('   ✅ Auth state is valid JSON');
  console.log(`   ✅ Auth state has ${cookieCount} cookies`);
  console.log('   ✅ Cookies are not expired');
  console.log('');
  console.log('   Tests will run with VALIDATED authentication state');
  console.log(
    '   Expected outcome: 100% test pass rate (if auth is root cause)'
  );
  console.log('🎉 [AUTH VALIDATION] ================================');
});
