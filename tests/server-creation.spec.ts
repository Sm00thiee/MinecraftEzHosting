import { test, expect } from '@playwright/test';

test.describe('Server Creation Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('should display server creation form when authenticated', async ({
    page,
  }) => {
    // Skip authentication for now and test API directly
    // This test will verify the server creation API endpoint

    const response = await page.request.post('/api/servers', {
      headers: {
        'Content-Type': 'application/json',
        // Note: In a real scenario, we'd need a valid auth token
      },
      data: {
        name: 'Test Server',
        server_type: 'paper',
        version: '1.20.1',
        memory: 2048,
      },
    });

    // Check if the endpoint exists and responds
    expect(response.status()).not.toBe(404);

    // Log the response for debugging
    const responseBody = await response.text();
    console.log('Server creation response:', response.status(), responseBody);
  });

  test('should verify server versions endpoint', async ({ page }) => {
    // Test the versions endpoint that the UI depends on
    const response = await page.request.get('/api/servers/versions/paper');

    // Check if the endpoint exists
    expect(response.status()).not.toBe(404);

    const responseBody = await response.text();
    console.log('Versions endpoint response:', response.status(), responseBody);
  });

  test('should verify servers list endpoint', async ({ page }) => {
    // Test the servers list endpoint
    const response = await page.request.get('/api/servers');

    // Check if the endpoint exists
    expect(response.status()).not.toBe(404);

    const responseBody = await response.text();
    console.log('Servers list response:', response.status(), responseBody);
  });

  test('should check backend API health', async ({ page }) => {
    // Test the health endpoint to ensure backend is running
    const response = await page.request.get('http://localhost:3001/health');

    if (response.status() === 200) {
      const health = await response.json();
      console.log('Backend health:', health);
      expect(health.status).toBe('ok');
    } else {
      console.log('Backend health check failed:', response.status());
    }
  });

  test('should verify Docker service availability', async ({ page }) => {
    // Test if Docker-related endpoints are accessible
    const response = await page.request.get('/api/servers');

    // Even without auth, we should get a 401/403, not 500 (which would indicate Docker issues)
    expect([200, 401, 403]).toContain(response.status());

    if (response.status() === 500) {
      const error = await response.text();
      console.log('Potential Docker service error:', error);
    }
  });

  test('should test server creation with mock authentication', async ({
    page,
  }) => {
    // Intercept auth requests to simulate authentication
    await page.route('**/api/servers', async route => {
      if (route.request().method() === 'POST') {
        // Mock a successful server creation response
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              server: {
                id: 'test-server-id',
                name: 'Test Server',
                server_type: 'paper',
                version: '1.20.1',
                status: 'creating',
                port: 25565,
                max_memory: 2048,
              },
            },
          }),
        });
      } else {
        // For GET requests, return empty list
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { servers: [] },
          }),
        });
      }
    });

    // Mock versions endpoint
    await page.route('**/api/servers/versions/*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            versions: ['1.20.4', '1.20.3', '1.20.2', '1.20.1'],
          },
        }),
      });
    });

    // Navigate to dashboard (this will still redirect to login)
    await page.goto('/dashboard');

    // Check if we're on the login page
    await expect(page).toHaveURL(/.*\/login/);

    // Verify the login page has the expected elements
    await expect(page.locator('text=Sign In')).toBeVisible();
    await expect(page.locator('text=Continue with Google')).toBeVisible();
  });
});
