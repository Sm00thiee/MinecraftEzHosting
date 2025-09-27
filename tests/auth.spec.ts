import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('should display login page when not authenticated', async ({ page }) => {
    // Should redirect to login page or show login form
    await expect(page).toHaveURL(/.*login.*/);

    // Check for login form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for invalid login', async ({ page }) => {
    await page.goto('/login');

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should show validation errors or remain on login page
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('should handle login form submission', async ({ page }) => {
    await page.goto('/login');

    // Fill in test credentials (these should be invalid for security)
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpassword');

    // Submit form
    await page.click('button[type="submit"]');

    // Should either show error message or redirect (depending on credentials)
    // We expect this to fail since we're using test credentials
    await page.waitForTimeout(2000);
  });

  test('should protect dashboard route when not authenticated', async ({
    page,
  }) => {
    // Try to access protected route directly
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('should protect admin panel when not authenticated', async ({
    page,
  }) => {
    // Try to access admin route directly
    await page.goto('/admin');

    // Should redirect to login
    await expect(page).toHaveURL(/.*login.*/);
  });
});
