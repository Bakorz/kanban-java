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

test('auth actions are aligned and the password eye works without submitting', async ({ page }, testInfo) => {
  test.skip(realApi, 'Requires the configured auth form from the SDK fixture.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');

  const card = page.getByRole('region', { name: 'Log in to Kanban' });
  const mobile = testInfo.project.name === 'mobile';
  await expect(card).toHaveCSS('animation-name', 'none');
  await expect(card).toHaveCSS('border-top-width', mobile ? '0px' : '1px');
  await expect(card).toHaveCSS('background-image', mobile ? 'none' : /linear-gradient/);
  if (mobile) await expect(card).toHaveCSS('box-shadow', 'none');

  const submit = page.getByRole('button', { name: 'Log in', exact: true });
  const google = page.getByRole('button', { name: 'Sign in with Google', exact: true });
  await expect(google).toBeDisabled();
  const mainAction = await submit.boundingBox();
  const googleAction = await google.boundingBox();
  const label = await google.getByText('Sign in with Google', { exact: true }).boundingBox();
  expect(googleAction.y).toBeGreaterThan(mainAction.y + mainAction.height);
  expect(Math.abs(label.x + label.width / 2 - (googleAction.x + googleAction.width / 2))).toBeLessThan(1);

  const password = page.getByLabel('Password (required)', { exact: true });
  const reveal = page.getByRole('button', { name: 'Show password' });
  await password.fill('fixture-password');
  await expect(password).toHaveAttribute('type', 'password');
  if (mobile) {
    await reveal.tap();
  } else {
    await page.keyboard.press('Tab');
    await expect(reveal).toBeFocused();
    await expect(reveal).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Space');
  }
  await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  await expect(password).toHaveAttribute('type', 'text');
  await reveal.press('Enter');
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('fixture-password');
  await expect(page).toHaveURL(/\/login$/);
});

test('dashboard aligns its actions and replaces the loading skeleton with live results', async ({ page }, testInfo) => {
  test.skip(realApi, 'Requires control of the board list and SDK responses.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await authRoutes(page);
  let releaseBoards;
  const boardList = new Promise((resolve) => { releaseBoards = resolve; });
  await page.route('**/api/boards', async (route) => {
    await boardList;
    await route.fulfill({ json: { boards: [
      { id: 'roadmap', name: 'Product roadmap' },
      { id: 'release', name: 'Release checklist' },
    ] } });
  });
  await page.route('**/api/boards/*', (route) => route.fulfill({ json: { columns: [
    { id: 'todo', name: 'To Do', cards: [{ id: 'c1', title: 'Plan the next release' }] },
  ] } }));

  await login(page);
  const heading = page.getByRole('heading', { name: 'My boards', exact: true });
  const create = page.getByRole('button', { name: 'New board' });
  const logout = page.getByRole('button', { name: 'Log out', exact: true });
  const progress = page.getByRole('progressbar', { name: 'Loading your boards…' });
  await expect(progress).toBeVisible();
  expect(await progress.getAttribute('value')).toBeNull();
  await expect(logout.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  const [titleBox, createBox] = await Promise.all([heading.boundingBox(), create.boundingBox()]);
  expect(Math.abs(titleBox.y + titleBox.height / 2 - (createBox.y + createBox.height / 2))).toBeLessThan(2);
  expect(createBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
  expect(createBox.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator('body').evaluate((body) => body.scrollWidth - body.clientWidth)).toBe(0);

  releaseBoards();
  await expect(progress).toHaveCount(0);
  await expect(page.locator('.dash-results')).toHaveCSS('animation-name', 'none');
  const roadmap = page.getByRole('link', { name: 'Product roadmap', exact: true });
  const release = page.getByRole('link', { name: 'Release checklist', exact: true });
  await expect(roadmap).toBeVisible();
  await expect(release).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);
  const search = page.getByRole('searchbox', { name: 'Search boards' });
  await search.fill('release');
  await expect(roadmap).toHaveCount(0);
  await expect(release).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('1 board found.');
  await search.fill('');
  await expect(roadmap).toBeVisible();

  if (testInfo.project.name === 'mobile') {
    await create.tap();
  } else {
    await create.press('Enter');
  }
  await expect(page.getByRole('dialog', { name: 'Create board' })).toBeVisible();
  await expect(page.getByLabel('Board name (required)')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(create).toBeFocused();
});

test('board lanes size to their cards and drops persist the exact position', async ({ page }, testInfo) => {
  test.skip(realApi, 'Requires synthetic boards and controlled move responses.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await authRoutes(page);
  const board = { id: 'work', name: 'Release planning' };
  const columns = [
    { id: 'todo', name: 'To Do', cards: [{ id: 'first', title: 'First task' }, { id: 'second', title: 'Second task' }, { id: 'third', title: 'Third task' }] },
    { id: 'progress', name: 'In Progress', cards: [{ id: 'review', title: 'Review notes' }] },
    { id: 'done', name: 'Done', cards: [] },
  ];
  const moves = [];
  let rejectNext = false;
  await page.route('**/api/boards', (route) => route.fulfill({ json: { boards: [board] } }));
  await page.route('**/api/boards/work', (route) => route.fulfill({ json: { board, columns } }));
  await page.route('**/api/cards/*/move', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    const { targetColumnId, newPosition } = route.request().postDataJSON();
    moves.push({ id, targetColumnId, newPosition });
    if (rejectNext) return route.fulfill({ status: 409, json: { error: { message: 'Try again.' } } });
    const source = columns.find((column) => column.cards.some((card) => card.id === id));
    const [card] = source.cards.splice(source.cards.findIndex((candidate) => candidate.id === id), 1);
    columns.find((column) => column.id === targetColumnId).cards.splice(newPosition, 0, card);
    return route.fulfill({ json: { board, columns } });
  });
  await login(page);
  await page.getByRole('link', { name: board.name, exact: true }).click();
  const lane = (name) => page.getByRole('region', { name, exact: true });
  const toDo = lane('To Do');
  const done = lane('Done');
  const first = page.getByRole('button', { name: 'Move card First task' });
  await expect(first).toBeVisible();
  expect((await toDo.boundingBox()).height).toBeGreaterThan((await done.boundingBox()).height + 50);
  if (testInfo.project.name === 'desktop') expect((await toDo.boundingBox()).y).toBe((await done.boundingBox()).y);
  const status = page.getByRole('status', { name: 'Board activity' });

  await first.press('Enter');
  await expect(page.getByLabel('Move to column')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();

  const touch = testInfo.project.name === 'mobile' ? await page.context().newCDPSession(page) : null;
  const pointer = async (type, x, y) => {
    if (touch) await touch.send('Input.dispatchTouchEvent', { type: `touch${type}`, touchPoints: type === 'End' ? [] : [{ x, y }] });
    else if (type === 'Start') { await page.mouse.move(x, y); await page.mouse.down(); }
    else if (type === 'End') await page.mouse.up();
    else await page.mouse.move(x, y, { steps: 5 });
  };
  async function startDrag(handle, x, y) {
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    await pointer('Start', box.x + box.width / 2, box.y + box.height / 2);
    await pointer('Move', box.x + box.width / 2 - 12, box.y + box.height / 2);
    await expect(page.locator('.board-columns')).toHaveAttribute('data-drag-active', 'true');
    await pointer('Move', x, y);
  }

  if (touch) await done.getByText('No cards yet').scrollIntoViewIfNeeded();
  const [emptyBox, originalBox] = await Promise.all([done.getByText('No cards yet').boundingBox(), first.boundingBox()]);
  expect(originalBox.y).toBeGreaterThanOrEqual(0);
  expect(emptyBox.y + emptyBox.height / 2).toBeLessThan(await page.evaluate(() => window.innerHeight));
  await startDrag(first, emptyBox.x + emptyBox.width / 2, emptyBox.y + emptyBox.height / 2);
  await expect(done.getByText('Drop card here')).toBeVisible();
  await pointer('End');
  await expect(status).toHaveText('Moved “First task” to Done, position 1.');
  await expect(done.getByRole('heading', { name: 'First task' })).toBeVisible();
  expect(moves).toEqual([{ id: 'first', targetColumnId: 'done', newPosition: 0 }]);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  if (!touch) {
    const currentFirst = page.getByRole('button', { name: 'Move card First task' });
    await startDrag(currentFirst, originalBox.x - 40, originalBox.y - 10);
    await expect(toDo.locator('[data-drop="before"]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await pointer('End');
    await expect(done.getByRole('heading', { name: 'First task' })).toBeVisible();
    expect(moves).toHaveLength(1);

    const third = page.getByRole('button', { name: 'Move card Third task' });
    const secondBox = await toDo.getByRole('listitem').first().boundingBox();
    await startDrag(third, secondBox.x + 20, secondBox.y + 4);
    await pointer('End');
    await expect(status).toHaveText('Moved “Third task” to To Do, position 1.');
    await expect(toDo.getByRole('heading', { level: 3 })).toHaveText(['Third task', 'Second task']);
    expect(moves[1]).toEqual({ id: 'third', targetColumnId: 'todo', newPosition: 0 });

    rejectNext = true;
    const target = await lane('In Progress').getByRole('listitem').boundingBox();
    await startDrag(third, target.x + 20, target.y + target.height - 4);
    await pointer('End');
    await expect(page.getByRole('alert')).toHaveText('Couldn’t move the card. Try again.');
    await expect(toDo.getByRole('heading', { level: 3 })).toHaveText(['Third task', 'Second task']);
  }

  await page.reload();
  await expect(done.getByRole('heading', { level: 3, name: 'First task', exact: true })).toBeVisible();
});

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
  await page.getByRole('button', { name: 'Edit card Review the result' }).click();
  await page.getByRole('button', { name: 'Move Review the result up' }).focus();
  await expect(page.getByRole('button', { name: 'Move Review the result up' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status', { name: 'Board activity' })).toHaveText('Card moved.');
  expect(mutations).toContainEqual({ path: '/api/cards/card2/move', method: 'POST', body: { targetColumnId: 'col0', newPosition: 0 } });
  await page.getByRole('button', { name: 'Edit card Write a useful task' }).click();
  await page.getByLabel('Move to column').selectOption('col1');
  await page.getByRole('button', { name: 'Move Write a useful task to selected column' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status', { name: 'Board activity' })).toHaveText('Card moved.');
  await page.getByRole('button', { name: 'Edit card Write a useful task' }).click();
  await page.getByLabel(/Description \(optional/).fill(''); await page.getByLabel('Due date (optional)').fill('');
  await page.getByRole('button', { name: 'Save card' }).click();
  await expect(page.getByRole('status', { name: 'Board activity' })).toHaveText('Card updated.');
  expect(mutations).toContainEqual({ path: '/api/cards/card1', method: 'PUT', body: { title: 'Write a useful task', description: null, priority: 'MEDIUM', dueDate: null } });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate((el) => el.clientWidth));
  await page.screenshot({ path: `.tools/screenshots/workspace-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Edit card Review the result' }).click();
  await page.getByRole('button', { name: 'Delete card Review the result' }).click();
  await expect(page.getByRole('button', { name: 'Cancel deletion' })).toBeFocused();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByRole('status', { name: 'Board activity' })).toHaveText('Card deleted.');
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
