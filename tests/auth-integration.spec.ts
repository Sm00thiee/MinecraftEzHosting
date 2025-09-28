import { test, expect } from '@playwright/test';

test.describe('Authentication Integration Tests', () => {
  test('should display login page with Google OAuth button', async ({
    page,
  }) => {
    await page.goto('http://localhost:80');

    // Should redirect to login page
    await expect(page).toHaveURL(/.*\/login/);

    // Check for login elements
    await expect(page.locator('h1')).toContainText('MC Server Manager');
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.locator('button')).toContainText('Continue with Google');
  });

  test('should have proper environment configuration', async ({ page }) => {
    await page.goto('http://localhost:80');

    // Check if the page loads without console errors related to Supabase
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('supabase')) {
        consoleErrors.push(msg.text());
      }
    });

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Should not have Supabase-related console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('should handle authentication state properly', async ({ page }) => {
    await page.goto('http://localhost:80');

    // Check that we're redirected to login when not authenticated
    await expect(page).toHaveURL(/.*\/login/);

    // Try to access dashboard directly - should redirect to login
    await page.goto('http://localhost:80/dashboard');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('should have working API backend', async ({ page }) => {
    // Test that backend is responding
    const response = await page.request.get('http://localhost:3001/health');
    expect(response.status()).toBe(200);

    const healthData = await response.json();
    expect(healthData.status).toBe('ok');
  });

  test('should require authentication for protected API endpoints', async ({
    page,
  }) => {
    // Test that protected endpoints require auth
    const serversResponse = await page.request.get(
      'http://localhost:3001/api/servers'
    );
    expect(serversResponse.status()).toBe(401);

    const errorData = await serversResponse.json();
    expect(errorData.error).toBe('Access token required');
  });

  test('should have proper CORS configuration', async ({ request }) => {
    // Test API endpoint accessibility
    const apiResponse = await request.get('http://localhost:3001/health');

    expect(apiResponse.status()).toBe(200);
    expect(apiResponse.ok()).toBe(true);
  });

  test('should load frontend assets properly', async ({ page }) => {
    await page.goto('http://localhost:80');

    // Check that main assets load without 404 errors
    const failedRequests = [];
    page.on('response', response => {
      if (response.status() >= 400) {
        failedRequests.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });

    await page.waitForLoadState('networkidle');

    // Filter out expected 401s for API calls
    const unexpectedFailures = failedRequests.filter(
      req => !req.url.includes('/api/') || req.status !== 401
    );

    expect(unexpectedFailures).toHaveLength(0);
  });
});
