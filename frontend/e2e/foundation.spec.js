import { expect, test } from '@playwright/test';

const realApi = process.env.KANBAN_E2E_REAL_API === '1';

test('workspace, health, route focus and responsive board preview', async ({ page }, testInfo) => {
  if (!realApi) await page.route('**/api/health', (route) => route.fulfill({ json: { status: 'ok', service: 'kanban-api' } }));
  await page.goto('/dashboard');
  await expect(page).toHaveTitle('My boards | Kanban');
  await expect(page.getByRole('heading', { level: 1, name: 'My boards' })).toBeFocused();
  await expect(page.getByText(/not a signed-in workspace/)).toBeVisible();
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByRole('status')).toContainText('Java API is reachable');
  await expect(page.getByRole('status')).toContainText('database connectivity are not checked');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate((el) => el.clientWidth));
  await page.screenshot({ path: `.tools/screenshots/dashboard-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('link', { name: 'Open board preview' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Board preview' })).toBeFocused();
  await expect(page).toHaveTitle('Board preview | Kanban');
  for (const name of ['To Do', 'In Progress', 'Done']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate((el) => el.clientWidth));
  await page.screenshot({ path: `.tools/screenshots/board-${testInfo.project.name}.png`, fullPage: true });
});

test('keyboard skip link and account routes remain usable without credentials', async ({ page }) => {
  await page.goto('/login');
  // Initial route focus is the h1; tab backwards reaches the last header link.
  // Explicitly reset to browser document start to exercise the first tab stop.
  await page.evaluate(() => { document.activeElement.blur(); window.getSelection()?.removeAllRanges(); document.body.tabIndex = -1; document.body.focus(); });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Log in', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Create an account' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Create an account', exact: true })).toBeFocused();
  await expect(page.getByText(/Account creation is not available/)).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
});

test('health errors are recoverable without treating HTML as success', async ({ page }) => {
  test.skip(realApi, 'Mock-only error-path test; real API option leaves network intact.');
  let calls = 0;
  await page.route('**/api/health', (route) => {
    calls++;
    return calls === 1 ? route.fulfill({ contentType: 'text/html', body: '<html>Proxy error</html>' }) : route.fulfill({ json: { status: 'ok', service: 'kanban-api' } });
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByRole('status')).toContainText('did not return JSON');
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByRole('status')).toContainText('Java API is reachable');
});
