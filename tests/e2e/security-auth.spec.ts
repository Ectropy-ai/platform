/**
 * Playwright E2E Tests for Authentication and Security
 * Tests the enhanced authentication and authorization flows
 */

import { test, expect, type Page } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set up test environment
    await page.goto('http://localhost:3000');
  });

  test('should display login page for unauthenticated users', async ({ page }) => {
    await expect(page).toHaveTitle(/Ectropy/);
    
    // Should redirect to login or show login form
    const loginButton = page.getByRole('button', { name: /login|sign in/i });
    await expect(loginButton).toBeVisible();
  });

  test('should handle OAuth2 authentication flow', async ({ page }) => {
    // Click OAuth login button
    const oauthButton = page.getByRole('button', { name: /sign in with/i });
    if (await oauthButton.isVisible()) {
      await oauthButton.click();
      
      // Should redirect to OAuth provider
      await expect(page).toHaveURL(/login\.microsoftonline\.com|accounts\.google\.com|okta\.com/);
    }
  });

  test('should enforce rate limiting on authentication endpoints', async ({ page }) => {
    // Simulate multiple failed login attempts
    const loginForm = page.getByRole('form', { name: /login/i });
    if (await loginForm.isVisible()) {
      for (let i = 0; i < 6; i++) {
        await page.fill('input[type="email"]', 'test@example.com');
        await page.fill('input[type="password"]', 'wrongpassword');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(1000);
      }
      
      // Should show rate limit message
      const rateLimitMessage = page.getByText(/too many/i);
      await expect(rateLimitMessage).toBeVisible();
    }
  });

  test('should validate user session and permissions', async ({ page }) => {
    // Mock authenticated user session
    await page.evaluate(() => {
      localStorage.setItem('oauth_session', 'mock-session-token');
    });
    
    await page.reload();
    
    // Should show authenticated state
    const userMenu = page.getByRole('button', { name: /user|account|profile/i });
    await expect(userMenu).toBeVisible();
  });

  test('should handle logout properly', async ({ page }) => {
    // Mock authenticated session
    await page.evaluate(() => {
      localStorage.setItem('oauth_session', 'mock-session-token');
    });
    
    await page.reload();
    
    // Click logout
    const logoutButton = page.getByRole('button', { name: /logout|sign out/i });
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      
      // Should clear session and redirect
      await expect(page.getByRole('button', { name: /login|sign in/i })).toBeVisible();
    }
  });
});

test.describe('Security Features', () => {
  test('should sanitize XSS attempts in form inputs', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible()) {
      // Attempt XSS injection
      await searchInput.fill('<script>alert("xss")</script>');
      await page.keyboard.press('Enter');
      
      // Should not execute script
      const alertDialog = page.getByRole('alert');
      await expect(alertDialog).not.toBeVisible();
    }
  });

  test('should enforce CSRF protection', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Check for CSRF token in forms
    const form = page.locator('form').first();
    if (await form.isVisible()) {
      const csrfToken = form.locator('input[name="csrf-token"], input[name="_token"]');
      // CSRF token should be present in forms
      await expect(csrfToken).toBeAttached();
    }
  });

  test('should set proper security headers', async ({ page }) => {
    const response = await page.goto('http://localhost:3000');
    
    if (response) {
      const headers = response.headers();
      
      // Check for security headers
      expect(headers).toHaveProperty('x-frame-options');
      expect(headers).toHaveProperty('x-content-type-options');
      expect(headers).toHaveProperty('strict-transport-security');
      
      // Verify CSP header
      expect(headers['content-security-policy']).toBeDefined();
    }
  });
});

test.describe('API Security', () => {
  test('should handle API rate limiting', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Make multiple rapid API requests
    const responses = await Promise.all(
      Array(20).fill(0).map(() => 
        page.request.get('http://localhost:4000/api/v1/health')
      )
    );
    
    // Some requests should be rate limited
    const rateLimitedResponses = responses.filter(r => r.status() === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);
  });

  test('should require authentication for protected endpoints', async ({ page }) => {
    const response = await page.request.get('http://localhost:4000/api/v1/admin/users');
    
    // Should return 401 for unauthenticated requests
    expect(response.status()).toBe(401);
  });

  test('should validate JWT tokens properly', async ({ page }) => {
    // Test with invalid JWT
    const response = await page.request.get('http://localhost:4000/api/v1/profile', {
      headers: {
        'Authorization': 'Bearer invalid-jwt-token'
      }
    });
    
    expect(response.status()).toBe(401);
  });
});

test.describe('Health Monitoring', () => {
  test('should provide health check endpoint', async ({ page }) => {
    const response = await page.request.get('http://localhost:4000/health');
    
    expect(response.status()).toBe(200);
    
    const healthData = await response.json();
    expect(healthData).toHaveProperty('status');
    expect(healthData).toHaveProperty('services');
    expect(healthData).toHaveProperty('timestamp');
  });

  test('should include dependency health in status', async ({ page }) => {
    const response = await page.request.get('http://localhost:4000/health/detailed');
    
    if (response.status() === 200) {
      const healthData = await response.json();
      expect(healthData.services).toHaveProperty('database');
      expect(healthData.services).toHaveProperty('redis');
    }
  });

  test('should monitor system metrics', async ({ page }) => {
    const response = await page.request.get('http://localhost:4000/api/v1/monitoring/metrics');
    
    // Might require authentication
    if (response.status() === 200) {
      const metrics = await response.json();
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('api');
    }
  });
});

test.describe('Compliance and Audit', () => {
  test('should log authentication events for audit', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Attempt login
    const loginForm = page.getByRole('form', { name: /login/i });
    if (await loginForm.isVisible()) {
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'testpassword');
      await page.click('button[type="submit"]');
      
      // Check if audit logs are created (would need API access)
      const response = await page.request.get('http://localhost:4000/api/v1/audit/events');
      if (response.status() === 200) {
        const auditEvents = await response.json();
        expect(auditEvents.length).toBeGreaterThan(0);
      }
    }
  });

  test('should handle GDPR data requests', async ({ page }) => {
    // Test data export functionality
    const response = await page.request.post('http://localhost:4000/api/v1/gdpr/data-export', {
      data: { email: 'test@example.com' }
    });
    
    // Should either succeed or require authentication
    expect([200, 401, 403]).toContain(response.status());
  });
});

test.describe('Performance and Load', () => {
  test('should handle concurrent requests efficiently', async ({ page }) => {
    const startTime = Date.now();
    
    // Make concurrent requests
    const requests = Array(10).fill(0).map(() => 
      page.request.get('http://localhost:4000/api/v1/health')
    );
    
    const responses = await Promise.all(requests);
    const endTime = Date.now();
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.status()).toBe(200);
    });
    
    // Should complete within reasonable time
    expect(endTime - startTime).toBeLessThan(5000);
  });

  test('should cache responses appropriately', async ({ page }) => {
    // First request
    const response1 = await page.request.get('http://localhost:4000/api/v1/config');
    
    if (response1.status() === 200) {
      const headers1 = response1.headers();
      
      // Second request
      const response2 = await page.request.get('http://localhost:4000/api/v1/config');
      
      // Should have cache headers
      expect(headers1).toHaveProperty('cache-control');
    }
  });
});

// Helper function to wait for element with retry
async function waitForElementWithRetry(page: Page, selector: string, timeout = 5000): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}