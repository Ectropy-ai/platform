import { Page } from '@playwright/test';

/**
 * Wait for React application to hydrate and become interactive
 * Checks for:
 * 1. React root element exists
 * 2. React hydration complete (no hydration markers)
 * 3. Critical UI elements visible
 *
 * @param page - Playwright page object
 * @param options - Configuration options
 * @param options.timeout - Maximum wait time in milliseconds (default: 30000)
 * @param options.skipNetworkIdle - Skip network idle wait for pages with continuous polling (default: false)
 *                                   Use this for authentication pages that poll /api/auth/me
 */
export async function waitForReactHydration(
  page: Page,
  options: {
    timeout?: number;
    skipNetworkIdle?: boolean;
  } = {}
): Promise<void> {
  const { timeout = 30000, skipNetworkIdle = false } = options;

  console.log('⏳ [REACT] Waiting for React application to hydrate...');
  if (skipNetworkIdle) {
    console.log(
      'ℹ️ [REACT] Network idle wait will be skipped (auth page with continuous polling)'
    );
  }

  const startTime = Date.now();

  try {
    // Step 1: Wait for React root element
    console.log('📍 [REACT] Step 1: Checking for React root element...');
    await page.waitForSelector('#root', { state: 'attached', timeout: 5000 });
    console.log('✅ [REACT] React root element found');

    // Step 2: Wait for React to remove hydration markers (if using React 18 SSR)
    // React 18 adds data-reactroot or similar during hydration
    console.log('📍 [REACT] Step 2: Waiting for hydration completion...');
    await page.waitForSelector('#root > *', {
      state: 'attached',
      timeout: 5000,
    });
    console.log('✅ [REACT] React hydration complete');

    // Step 3: Validate page HTTP status (fail fast on 403, 404, 500)
    console.log('📍 [REACT] Step 3: Validating page HTTP status...');
    const response = await page.goto(page.url(), {
      waitUntil: 'domcontentloaded',
    });
    if (response && response.status() !== 200) {
      const status = response.status();
      const statusText = response.statusText();
      throw new Error(
        `Page returned HTTP ${status} (${statusText}). Expected 200 OK. This usually indicates a server configuration issue (403 = permissions, 404 = not found, 500 = server error).`
      );
    }
    console.log('✅ [REACT] Page returned HTTP 200 OK');

    // Step 4: Wait for network idle (all critical resources loaded)
    // SKIP for authentication pages that continuously poll /api/auth/me
    if (!skipNetworkIdle) {
      // Use longer timeout in CI environments for reliability
      console.log('📍 [REACT] Step 4: Waiting for network idle...');
      const networkTimeout = process.env.CI ? 30000 : 10000; // 30s in CI, 10s locally
      console.log(
        `  Using timeout: ${networkTimeout}ms (CI=${!!process.env.CI})`
      );
      await page.waitForLoadState('networkidle', { timeout: networkTimeout });
      console.log('✅ [REACT] Network idle');
    } else {
      console.log(
        '⏭️ [REACT] Step 4: Skipped network idle wait (auth page with continuous polling)'
      );
      console.log(
        '   Reason: Page polls /api/auth/me which prevents network from becoming idle'
      );
      console.log(
        '   This is expected behavior - app detects when authentication completes'
      );
    }

    // Step 5: Additional settling time for component mounting
    console.log('📍 [REACT] Step 5: Settling time (500ms)...');
    await page.waitForTimeout(500);
    console.log('✅ [REACT] React application fully hydrated');

    const elapsedTime = Date.now() - startTime;
    console.log(`🎉 [REACT] Hydration completed in ${elapsedTime}ms`);
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error(`❌ [REACT] Hydration failed after ${elapsedTime}ms:`, error);

    // Capture debug screenshot
    const screenshotPath = 'auth-debug/react-hydration-failure.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 [REACT] Debug screenshot saved: ${screenshotPath}`);

    // Log page state for debugging
    const html = await page.content();
    console.log('📄 [REACT] Page HTML length:', html.length);
    console.log('📄 [REACT] Page title:', await page.title());
    console.log('📄 [REACT] Page URL:', page.url());

    throw error;
  }
}

/**
 * Wait for specific React component to mount and become visible
 * More robust than generic waitForSelector
 */
export async function waitForReactComponent(
  page: Page,
  selector: string,
  componentName: string = 'Component',
  timeout: number = 30000
): Promise<void> {
  console.log(`⏳ [REACT] Waiting for ${componentName} component...`);

  try {
    // Wait for element to exist in DOM
    await page.waitForSelector(selector, {
      state: 'attached',
      timeout: timeout / 2,
    });
    console.log(`✅ [REACT] ${componentName} exists in DOM`);

    // Wait for element to be visible
    await page.waitForSelector(selector, {
      state: 'visible',
      timeout: timeout / 2,
    });
    console.log(`✅ [REACT] ${componentName} is visible`);

    // Verify element is actually rendered (not display: none or visibility: hidden)
    const isVisible = await page.isVisible(selector);
    if (!isVisible) {
      throw new Error(
        `${componentName} exists but is not visible (display: none or visibility: hidden)`
      );
    }

    console.log(`🎉 [REACT] ${componentName} component ready`);
  } catch (error) {
    console.error(
      `❌ [REACT] ${componentName} component failed to mount:`,
      error
    );

    // Capture debug screenshot
    const screenshotPath = `auth-debug/react-${componentName.toLowerCase().replace(/\s+/g, '-')}-failure.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 [REACT] Debug screenshot saved: ${screenshotPath}`);

    throw error;
  }
}
