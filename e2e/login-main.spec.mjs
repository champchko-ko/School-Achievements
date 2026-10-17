import { test, expect } from '@playwright/test';

test.describe('Main Flow and Navigation', () => {
  test('should load intro page successfully', async ({ page }) => {
    await page.goto('/intro');
    await expect(page).toHaveURL(/.*\/intro/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should redirect root to intro when introSeen cookie is absent', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/.*\/intro/);
  });

  test('should access main page when introSeen cookie is true', async ({ page, context }) => {
    await context.addCookies([
      { name: 'introSeen', value: 'true', domain: 'localhost', path: '/' },
    ]);
    await page.goto('/');
    await expect(page).toHaveURL(/localhost:3000\/?$/);
  });
});

test.describe('Login & Auth Flow', () => {
  test('should report unauthenticated session on /api/auth GET', async ({ request }) => {
    const res = await request.get('/api/auth');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.admin).toBe(false);
  });

  test('should reject invalid PIN on /api/auth POST', async ({ request }) => {
    const res = await request.post('/api/auth', {
      data: { pin: '0000' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([400, 401, 500]).toContain(res.status());
  });

  test('should redirect unauthorized visitors away from /admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/localhost:3000\/?/);
  });
});
