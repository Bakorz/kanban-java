import { expect, test } from '@playwright/test';

const realApi = process.env.KANBAN_E2E_REAL_API === '1';

test('landing page is public and free of the old preview link', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Kanban: a personal board for your tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Personal Kanban for your tasks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Preview' })).toHaveCount(0);
  const start = page.locator('.hero').getByRole('link', { name: 'Start Now', exact: true });
  await expect(start).toBeVisible();
  await expect(start).toHaveAttribute('href', '/register');
  await expect(page.getByRole('img', { name: 'The Kanban board with To Do, In Progress and Done columns.' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate((el) => el.clientWidth));
});

test('landing section links have breathing room and jump to their sections', async ({ page }) => {
  await page.goto('/');
  const boardLink = page.getByRole('link', { name: 'See how moving works' });
  const stepsLink = page.getByRole('link', { name: 'See the board' });
  for (const [link, spacing] of [[boardLink, '24px'], [stepsLink, '32px']]) {
    await expect(link.locator('..')).toHaveCSS('margin-block-start', spacing);
    await expect(link).toHaveCSS('min-block-size', '44px');
  }
  await boardLink.click();
  await expect(page).toHaveURL(/#steps$/);
  await expect(page.getByRole('heading', { name: 'From empty board to done in 3 steps' })).toBeInViewport();
  await stepsLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#board$/);
  await expect(page.getByRole('heading', { name: 'The whole board, one screen.' })).toBeInViewport();
});

test('landing preview stays still with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const preview = page.getByRole('img', { name: 'The Kanban board with To Do, In Progress and Done columns.' });
  await expect(preview).toHaveCSS('animation-name', 'none');
  await expect(preview).toHaveCSS('opacity', '1');
  await expect(preview).toHaveCSS('transform', 'none');
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
