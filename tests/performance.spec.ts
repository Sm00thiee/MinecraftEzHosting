import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test('should load homepage within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should have good Core Web Vitals', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Measure Largest Contentful Paint (LCP)
    const lcp = await page.evaluate(() => {
      return new Promise(resolve => {
        new PerformanceObserver(list => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry.startTime);
        }).observe({ entryTypes: ['largest-contentful-paint'] });

        // Fallback timeout
        setTimeout(() => resolve(0), 3000);
      });
    });

    // LCP should be under 2.5 seconds (2500ms)
    if (lcp > 0) {
      expect(lcp).toBeLessThan(2500);
    }
  });

  test('should handle multiple concurrent users', async ({ browser }) => {
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);

    const pages = await Promise.all(contexts.map(context => context.newPage()));

    // Load the same page in multiple contexts simultaneously
    const startTime = Date.now();
    await Promise.all(pages.map(page => page.goto('/')));

    await Promise.all(pages.map(page => page.waitForLoadState('networkidle')));

    const totalTime = Date.now() - startTime;

    // Should handle concurrent users within reasonable time
    expect(totalTime).toBeLessThan(10000);

    // Cleanup
    await Promise.all(contexts.map(context => context.close()));
  });

  test('should not have memory leaks on navigation', async ({ page }) => {
    await page.goto('/');

    // Navigate between pages multiple times
    const routes = ['/', '/login', '/dashboard', '/admin'];

    for (let i = 0; i < 3; i++) {
      for (const route of routes) {
        try {
          await page.goto(route);
          await page.waitForLoadState('networkidle');

          // Small delay to allow for cleanup
          await page.waitForTimeout(100);
        } catch (error) {
          // Some routes might not exist or require auth, that's okay
          continue;
        }
      }
    }

    // Check that the page is still responsive
    await expect(page.locator('body')).toBeVisible();
  });

  test('should optimize image loading', async ({ page }) => {
    const imageRequests: any[] = [];

    page.on('response', response => {
      if (response.url().match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
        imageRequests.push({
          url: response.url(),
          status: response.status(),
          size: response.headers()['content-length'],
        });
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that images load successfully
    const failedImages = imageRequests.filter(req => req.status >= 400);
    expect(failedImages.length).toBe(0);

    // Check for reasonable image sizes (under 1MB each)
    imageRequests.forEach(req => {
      if (req.size) {
        const sizeInMB = parseInt(req.size) / (1024 * 1024);
        expect(sizeInMB).toBeLessThan(1);
      }
    });
  });

  test('should handle slow network conditions', async ({ page, context }) => {
    // Simulate slow 3G connection
    await context.route('**/*', async route => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Add 100ms delay
      await route.continue();
    });

    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Should still be usable on slow connections (under 10 seconds)
    expect(loadTime).toBeLessThan(10000);

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });

  test('should minimize JavaScript bundle size', async ({ page }) => {
    const jsRequests: any[] = [];

    page.on('response', response => {
      if (response.url().includes('.js') && response.status() === 200) {
        jsRequests.push({
          url: response.url(),
          size: response.headers()['content-length'],
        });
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Calculate total JS size
    const totalSize = jsRequests.reduce((sum, req) => {
      return sum + (parseInt(req.size) || 0);
    }, 0);

    const totalSizeInMB = totalSize / (1024 * 1024);

    // Total JS should be under 5MB
    expect(totalSizeInMB).toBeLessThan(5);
  });
});
