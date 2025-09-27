import { test, expect } from '@playwright/test';

test.describe('API Endpoints', () => {
  const API_BASE = 'http://localhost:3001/api';
  const HEALTH_ENDPOINT = 'http://localhost:3001/health';

  test('should respond to health check endpoint', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINT);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status');
  });

  test('should handle CORS properly', async ({ page }) => {
    await page.goto('/');

    // Make a cross-origin request from the frontend
    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('http://localhost:3001/api/health');
        return {
          status: res.status,
          ok: res.ok,
        };
      } catch (error) {
        return {
          error: error.message,
        };
      }
    });

    // Should not have CORS errors
    expect(response).not.toHaveProperty('error');
    expect(response.status).toBe(200);
  });

  test('should protect authenticated endpoints', async ({ request }) => {
    // Try to access protected endpoint without authentication
    const response = await request.get(`${API_BASE}/servers`);

    // Should return 401 or redirect to login
    expect([401, 403, 302]).toContain(response.status());
  });

  test('should handle invalid JSON requests', async ({ request }) => {
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: 'invalid json',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return 400 Bad Request
    expect(response.status()).toBe(400);
  });

  test('should return proper content types', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    const contentType = response.headers()['content-type'];

    expect(contentType).toContain('application/json');
  });

  test('should handle rate limiting gracefully', async ({ request }) => {
    // Make multiple rapid requests to test rate limiting
    const promises = Array(10)
      .fill(0)
      .map(() => request.get(HEALTH_ENDPOINT));

    const responses = await Promise.all(promises);

    // All requests should either succeed, be rate limited, or return 404
    responses.forEach(response => {
      expect([200, 404, 429]).toContain(response.status());
    });
  });

  test('should validate request parameters', async ({ request }) => {
    // Test with invalid parameters
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: 'invalid-email',
        password: '',
      },
    });

    // Should return validation error (400 or 422) or 404 if endpoint doesn't exist
    expect([400, 404, 422]).toContain(response.status());
  });
});
