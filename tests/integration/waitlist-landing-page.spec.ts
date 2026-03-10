/**
 * Landing Page Waitlist Integration Tests
 * Tests the complete flow from landing page to API backend
 */

import { test, expect, Page } from '@playwright/test';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';
test.describe('Landing Page Waitlist Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept API calls for testing
    await page.route(`${API_URL}/api/waitlist`, (route) => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON();
        if (postData?.email === 'test@example.com') {
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              message: 'Successfully joined the waitlist!',
            }),
          });
        } else if (postData?.email === 'existing@example.com') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              message: 'You are already on our waitlist!',
            }),
          });
        } else {
          route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              message: 'Invalid email address',
            }),
          });
        }
      } else if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            count: 42,
          }),
        });
      }
    });
  });
  test('should display landing page correctly', async ({ page }) => {
    await page.goto(BASE_URL);
    // Check main elements are present
    await expect(page.getByText('Ectropy')).toBeVisible();
    await expect(
      page.getByText('Federated Construction Platform')
    ).toBeVisible();
    await expect(page.getByText('Join the Early Access Program')).toBeVisible();
    // Check form elements
    await expect(page.getByLabel('Email Address')).toBeVisible();
      page.getByRole('button', { name: /get early access/i })
    // Check feature cards
    await expect(page.getByText('Federated Construction')).toBeVisible();
    await expect(page.getByText('Blockchain Governance')).toBeVisible();
    await expect(page.getByText('Real-time Analytics')).toBeVisible();
    await expect(page.getByText('Cloud Integration')).toBeVisible();
  test('should successfully submit waitlist form', async ({ page }) => {
    // Fill and submit the form
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByRole('button', { name: /get early access/i }).click();
    // Check for success message
    await expect(page.getByText(/welcome to the waitlist/i)).toBeVisible();
    // Check that email field is cleared
    await expect(page.getByLabel('Email Address')).toHaveValue('');
  test('should handle duplicate email signup', async ({ page }) => {
    await page.getByLabel('Email Address').fill('existing@example.com');
    // Should still show success (user-friendly message)
  test('should show error for invalid email', async ({ page }) => {
    await page.getByLabel('Email Address').fill('invalid-email');
    // Check for error message
    await expect(page.getByText('Invalid email address')).toBeVisible();
  test('should validate email format client-side', async ({ page }) => {
    const emailInput = page.getByLabel('Email Address');
    await emailInput.fill('invalid-email');
    // Try to submit - HTML5 validation should prevent it
    // Check if browser validation message appears
    const validationMessage = await emailInput.evaluate(
      (input: HTMLInputElement) => input.validationMessage
    );
    expect(validationMessage).toBeTruthy();
  test('should show loading state during submission', async ({ page }) => {
    // Delay the API response to test loading state
    await page.route(`${API_URL}/api/waitlist`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Successfully joined the waitlist!',
        }),
      });
    // Check loading state
    await expect(page.getByText('Joining...')).toBeVisible();
    await expect(page.getByRole('button', { name: /joining/i })).toBeDisabled();
  test('should navigate to dashboard when sign in link is clicked', async ({
    page,
  }) => {
    await page.getByText(/already have access/i).click();
    // Should navigate to dashboard
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
  test('should be responsive on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    // Check that main elements are still visible and accessible
    // Check that form is still functional
    await page.getByLabel('Email Address').fill('mobile@example.com');
  test('should handle network errors gracefully', async ({ page }) => {
    // Simulate network failure
      route.abort('failed');
    // Should show network error message
    await expect(page.getByText(/network error/i)).toBeVisible();
  test('should close success notification', async ({ page }) => {
    // Wait for success message
    // Close the notification
    await page.getByRole('button', { name: /close/i }).click();
    // Success message should disappear
    await expect(page.getByText(/welcome to the waitlist/i)).not.toBeVisible();
});
test.describe('API Waitlist Endpoints', () => {
  test('should handle POST requests to waitlist endpoint', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/waitlist`, {
      data: {
        email: 'api-test@example.com',
      },
    });
    expect(response.status()).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('waitlist');
  test('should handle GET requests to waitlist count endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/waitlist/count`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(typeof data.count).toBe('number');
  test('should validate email in POST requests', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/waitlist`, {
      data: {
        email: 'invalid-email',
      },
    });
    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });
  test('should handle rate limiting', async ({ request }) => {
    // Make multiple requests quickly
    const promises = Array.from({ length: 6 }, () =>
      request.post(`${API_URL}/api/waitlist`, {
        data: { email: 'ratelimit@example.com' },
      })
    );
    const responses = await Promise.all(promises);
    // At least one should be rate limited (429)
    const rateLimited = responses.some((response) => response.status() === 429);
    expect(rateLimited).toBe(true);
  });
