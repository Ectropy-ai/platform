/**
 * Enterprise E2E Test Environment Helper
 * Provides utilities for end-to-end testing with Playwright
 */

import { Browser, chromium, Page } from '@playwright/test';

export class E2ETestEnvironment {
  private browser: Browser;

  static async setup(): Promise<E2ETestEnvironment> {
    const instance = new E2ETestEnvironment();
    await instance.initialize();
    return instance;
  }

  private async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: process.env.CI === 'true',
      slowMo: process.env.CI === 'true' ? 0 : 50,
    });
  }

  async getBrowser(): Promise<Browser> {
    return this.browser;
  }

  async loginUser(page: Page, email: string, password: string): Promise<void> {
    await page.goto('http://localhost:3000/login');
    await page.fill('[data-testid=email]', email);
    await page.fill('[data-testid=password]', password);
    await page.click('[data-testid=login-button]');
    await page.waitForURL(/dashboard/);
  }

  async resetTestData(): Promise<void> {
    // Reset test data before each test
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
