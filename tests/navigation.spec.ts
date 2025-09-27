import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Check that the page loads successfully
    await expect(page).toHaveTitle(/.*MC Server Management.*/);

    // Check for basic page structure
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have working navigation links', async ({ page }) => {
    await page.goto('/');

    // Look for common navigation elements
    const navLinks = page.locator('nav a, header a, .nav a');
    const linkCount = await navLinks.count();

    if (linkCount > 0) {
      // Test first few navigation links
      for (let i = 0; i < Math.min(3, linkCount); i++) {
        const link = navLinks.nth(i);
        const href = await link.getAttribute('href');

        if (href && !href.startsWith('#') && !href.startsWith('mailto:')) {
          await link.click();
          await page.waitForLoadState('networkidle');

          // Verify page loaded
          await expect(page.locator('body')).toBeVisible();

          // Go back to test next link
          await page.goBack();
        }
      }
    }
  });

  test('should handle 404 pages gracefully', async ({ page }) => {
    // Try to access a non-existent page
    const response = await page.goto('/non-existent-page');

    // Should either return 404 or redirect to a valid page
    if (response) {
      const status = response.status();
      expect([200, 404]).toContain(status);
    }

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check that page is still functional on mobile
    await expect(page.locator('body')).toBeVisible();

    // Check for mobile-friendly elements
    const mobileMenu = page.locator(
      '[data-testid="mobile-menu"], .mobile-menu, .hamburger'
    );
    if ((await mobileMenu.count()) > 0) {
      await expect(mobileMenu.first()).toBeVisible();
    }
  });

  test('should load CSS and JavaScript resources', async ({ page }) => {
    const responses: any[] = [];

    // Collect all network responses
    page.on('response', response => {
      responses.push(response);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that CSS files loaded successfully
    const cssResponses = responses.filter(
      r => r.url().includes('.css') && r.status() === 200
    );

    // Check that JS files loaded successfully
    const jsResponses = responses.filter(
      r => r.url().includes('.js') && r.status() === 200
    );

    // Should have at least some CSS and JS resources
    expect(cssResponses.length + jsResponses.length).toBeGreaterThan(0);
  });
});
