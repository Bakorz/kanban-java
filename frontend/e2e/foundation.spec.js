import { expect, test } from '@playwright/test';

const realApi = process.env.KANBAN_E2E_REAL_API === '1';

test('landing page is public and free of the old preview link', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Kanban: a personal board for your tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Personal Kanban for your tasks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Preview' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create an account' }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: 'The Kanban board with To Do, In Progress and Done columns.' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate((el) => el.clientWidth));
});

test('keyboard skip link and protected routes work without a session', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Log in to Kanban', exact: true })).toBeFocused();
  await page.evaluate(() => { document.activeElement.blur(); document.body.tabIndex = -1; document.body.focus(); });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Log in to Kanban', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  if (realApi) {
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeFocused();
    await expect(page.getByText(/VITE_SUPABASE_PUBLISHABLE_KEY/)).toBeVisible();
  } else {
    await expect(page.getByLabel('Email (required)')).toBeFocused();
    await expect(page.getByLabel('Email (required)')).toHaveCSS('outline-style', 'solid');
  }
});
