import { expect, test } from '@playwright/test';

const realApi = process.env.KANBAN_E2E_REAL_API === '1';

test('public preview health route focus and responsive columns', async ({ page }, testInfo) => {
  if (!realApi) await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'ok', service: 'kanban-api' } }));
  await page.goto('/preview');
  await expect(page).toHaveTitle('Board preview | Kanban');
  await expect(page.getByRole('heading', { level: 1, name: 'Board preview' })).toBeFocused();
  await expect(page.getByText(/not a signed-in workspace/)).toBeVisible();
  for (const name of ['To Do', 'In Progress', 'Done']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByRole('status')).toContainText('Java API is reachable');
  await expect(page.getByRole('status')).toContainText('database connectivity are not checked');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate((el) => el.clientWidth));
  await page.screenshot({ path: `.tools/screenshots/preview-${testInfo.project.name}.png`, fullPage: true });
});

test('keyboard skip link and protected routes work without a session', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Log in', exact: true })).toBeFocused();
  await page.evaluate(() => { document.activeElement.blur(); document.body.tabIndex = -1; document.body.focus(); });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Log in', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  if (realApi) {
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeFocused();
    await expect(page.getByText(/VITE_SUPABASE_PUBLISHABLE_KEY/)).toBeVisible();
  } else {
    await expect(page.getByLabel('Email (required)')).toBeFocused();
    await expect(page.getByLabel('Email (required)')).toHaveCSS('outline-style', 'solid');
  }
});

test('health errors remain recoverable without treating HTML as success', async ({ page }) => {
  test.skip(realApi, 'Mock-only error-path test.');
  let calls = 0;
  await page.route('**/api/health', (route) => ++calls === 1 ? route.fulfill({ contentType: 'text/html', body: '<html>Proxy error</html>' }) : route.fulfill({ json: { status: 'ok', service: 'kanban-api' } }));
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByRole('status')).toContainText('did not return JSON');
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByRole('status')).toContainText('Java API is reachable');
});
