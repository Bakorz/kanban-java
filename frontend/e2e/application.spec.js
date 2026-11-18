import { expect, test } from '@playwright/test';

const realApi = process.env.KANBAN_E2E_REAL_API === '1';
// Deliberately synthetic SDK responses. No real Supabase or application keys.
const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'browser@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = { access_token: 'playwright-fixture-not-a-jwt', token_type: 'bearer', refresh_token: 'fixture-refresh', expires_in: 3600, user };

async function authRoutes(page, confirmation = false) {
  await page.route('https://auth.kanban.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/signup')) return route.fulfill({ json: confirmation ? { user, session: null } : token });
    if (url.pathname.endsWith('/token')) return route.fulfill({ json: token });
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: user });
    if (url.pathname.endsWith('/recover')) return route.fulfill({ json: {} });
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.fulfill({ status: 400, json: { message: 'Unexpected fixture request' } });
  });
}
async function login(page) {
  await page.goto('/login');
  await page.getByLabel('Email (required)').fill(user.email);
  await page.getByLabel('Password (required)').fill('fixture-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My boards', exact: true })).toBeVisible();
}

test('SDK login board/card CRUD keyboard moves null clearing and logout', async ({ page }, testInfo) => {
  test.skip(realApi, 'Explicit SDK/API mock integration fixture only.');
  await authRoutes(page);
  let boards = []; let cards = []; let cardId = 0; const mutations = [];
  const columns = () => ['To Do', 'In Progress', 'Done'].map((name, index) => ({ id: `col${index}`, name, position: index, cards: cards.filter((c) => c.columnId === `col${index}`) }));
  const detail = () => ({ board: boards[0], columns: columns() });
  await page.route('**/api/**', async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname; const method = request.method();
    expect(request.headers().authorization).toBe(`Bearer ${token.access_token}`);
    const body = request.postDataJSON();
    if (method !== 'GET') mutations.push({ path, method, body });
    if (path === '/api/boards' && method === 'GET') return route.fulfill({ json: { boards } });
    if (path === '/api/boards' && method === 'POST') { boards = [{ id: 'board1', ...body }]; return route.fulfill({ status: 201, json: { board: boards[0] } }); }
    if (path === '/api/boards/board1' && method === 'GET') return route.fulfill({ json: detail() });
    if (path === '/api/boards/board1' && method === 'PUT') { boards[0] = { ...boards[0], ...body }; return route.fulfill({ json: { board: boards[0] } }); }
    if (path === '/api/boards/board1' && method === 'DELETE') { boards = []; return route.fulfill({ status: 204 }); }
    if (/\/columns\/col\d\/cards$/.test(path)) { const card = { id: `card${++cardId}`, columnId: path.split('/')[3], ...body }; cards.push(card); return route.fulfill({ status: 201, json: { card } }); }
    if (/\/cards\/card\d\/move$/.test(path)) { const id = path.split('/')[3]; const card = cards.find((c) => c.id === id); cards = cards.filter((c) => c.id !== id); card.columnId = body.targetColumnId; const target = cards.filter((c) => c.columnId === body.targetColumnId); const before = target[body.newPosition]; const index = before ? cards.indexOf(before) : cards.length; cards.splice(index, 0, card); return route.fulfill({ json: detail() }); }
    if (/\/cards\/card\d$/.test(path) && method === 'PUT') { const card = cards.find((c) => c.id === path.split('/')[3]); Object.assign(card, body); return route.fulfill({ json: { card } }); }
    if (/\/cards\/card\d$/.test(path) && method === 'DELETE') { cards = cards.filter((c) => c.id !== path.split('/')[3]); return route.fulfill({ status: 204 }); }
    return route.fulfill({ status: 500, json: { error: { message: 'Unhandled test fixture request' } } });
  });
  await login(page);
  await expect(page.getByText('No boards yet', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'New board' }).click();
  await page.getByLabel('Board name (required)').fill('Personal work');
  await page.getByLabel(/Description \(optional/).fill('A practical weekly board');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await page.getByRole('link', { name: 'Personal work' }).click();
  await expect(page.getByRole('heading', { name: 'Personal work', level: 1 })).toBeFocused();
  for (const title of ['Write a useful task', 'Review the result']) {
    await page.getByRole('button', { name: 'Add card to To Do' }).click();
    await page.getByLabel('Title (required)').fill(title);
    await page.getByLabel(/Description \(optional/).fill('Editable task details');
    await page.getByLabel('Due date (optional)').fill('2027-01-03');
    await page.getByRole('button', { name: 'Create card', exact: true }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Move Review the result up' }).focus();
  await expect(page.getByRole('button', { name: 'Move Review the result up' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Card moved.');
  expect(mutations).toContainEqual({ path: '/api/cards/card2/move', method: 'POST', body: { targetColumnId: 'col0', newPosition: 0 } });
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Write a useful task' }) });
  await card.getByLabel('Move to column').selectOption('col1');
  await card.getByRole('button', { name: 'Move Write a useful task to selected column' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Card moved.');
  await page.getByRole('button', { name: 'Edit card Write a useful task' }).click();
  await page.getByLabel(/Description \(optional/).fill(''); await page.getByLabel('Due date (optional)').fill('');
  await page.getByRole('button', { name: 'Save card' }).click();
  await expect(page.getByRole('status')).toHaveText('Card updated.');
  expect(mutations).toContainEqual({ path: '/api/cards/card1', method: 'PUT', body: { title: 'Write a useful task', description: null, priority: 'MEDIUM', dueDate: null } });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate((el) => el.clientWidth));
  await page.screenshot({ path: `.tools/screenshots/workspace-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Delete card Review the result' }).click();
  await expect(page.getByRole('button', { name: 'Cancel deletion' })).toBeFocused();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByRole('status')).toHaveText('Card deleted.');
  await page.getByRole('button', { name: 'Edit board', exact: true }).click();
  await page.getByLabel('Board name (required)').fill('Renamed board');
  await page.getByRole('button', { name: 'Save board' }).click();
  await expect(page.getByRole('heading', { name: 'Renamed board', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Delete board', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByRole('heading', { name: 'My boards', level: 1 })).toBeVisible();
  await expect(page.getByText('No boards yet', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log in to Kanban', level: 1 })).toBeVisible();
});

test('SDK PKCE recovery callback emits recovery permission and updates password', async ({ page }) => {
  test.skip(realApi, 'Explicit SDK mock fixture only.');
  await authRoutes(page);
  let exchanges = 0; let updates = 0;
  await page.route('https://auth.kanban.test/auth/v1/token**', async (route) => { exchanges++; expect(route.request().postDataJSON()).toHaveProperty('code_verifier'); return route.fulfill({ json: token }); });
  await page.route('https://auth.kanban.test/auth/v1/user**', async (route) => { if (route.request().method() === 'PUT') { updates++; expect(route.request().postDataJSON()).toMatchObject({ password: 'recovered-password' }); } return route.fulfill({ json: user }); });
  await page.goto('/forgot-password');
  await page.getByLabel('Email (required)').fill(user.email);
  await page.getByRole('button', { name: 'Send recovery link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'If an account exists' })).toBeVisible();
  // The real SDK generated and persisted its PKCE verifier during /recover.
  // Only the provider's code exchange response is mocked; no storage injection.
  await page.goto('/reset-password?code=fixture-recovery-code');
  await expect(page.getByLabel('New password (required)')).toBeVisible();
  expect(exchanges).toBe(1);
  await page.getByLabel('New password (required)').fill('recovered-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'password has been updated' })).toBeVisible();
  expect(updates).toBe(1);
});

test('confirmation-required signup and non-recovery session cannot update password', async ({ page }) => {
  test.skip(realApi, 'Explicit SDK mock fixture only.');
  await authRoutes(page, true);
  await page.goto('/register');
  await page.getByLabel('Email (required)').fill(user.email); await page.getByLabel('Password (required)').fill('fixture-password'); await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Check your email' })).toBeVisible();
  await page.goto('/reset-password');
  await expect(page.getByText(/normal signed-in session cannot/)).toBeVisible(); await expect(page.getByLabel('New password (required)')).toHaveCount(0);
});
