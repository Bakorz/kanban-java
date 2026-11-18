import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App, HealthCheck } from './App.jsx';
import { mockAuth, testSession } from './testAuth.js';
import { safeRedirect } from './Auth.jsx';

const reply = (data = { status: 'ok', service: 'kanban-api' }, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
function route(path, client = null) { return render(<MemoryRouter initialEntries={[path]}><App authClient={client} /></MemoryRouter>); }
function fillAuth() { fireEvent.change(screen.getByLabelText('Email (required)'), { target: { value: 'person@example.test' } }); fireEvent.change(screen.getByLabelText('Password (required)'), { target: { value: 'long-password' } }); }

describe('auth lifecycle and routes', () => {
  it('serves the landing page without a Preview link in its navigation', () => {
    route('/');
    expect(screen.getByRole('heading', { name: 'Personal Kanban for your tasks', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Preview' })).not.toBeInTheDocument();
    const signupLinks = screen.getAllByRole('link', { name: 'Start Now', exact: true });
    expect(signupLinks).toHaveLength(4);
    for (const link of signupLinks) expect(link).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument();
    for (const name of ['To Do', 'In Progress', 'Done']) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  });
  it.each([
    ['/login', 'Log in', 'Sign in with Google', 'current-password'],
    ['/register', 'Create account', 'Sign up with Google', 'new-password'],
  ])('puts the disabled Google option after the form and reveals passwords at %s', async (path, submitName, googleName, autocomplete) => {
    const { client } = mockAuth(); route(path, client);
    const google = await screen.findByRole('button', { name: googleName, exact: true });
    const submit = screen.getByRole('button', { name: submitName, exact: true });
    expect(google).toBeDisabled();
    expect(google).toHaveTextContent(googleName);
    expect(google).not.toHaveTextContent('Soon');
    expect(submit.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const email = screen.getByLabelText('Email (required)');
    const password = screen.getByLabelText('Password (required)');
    const reveal = screen.getByRole('button', { name: 'Show password' });
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('autocomplete', autocomplete);
    expect(reveal).toHaveAttribute('aria-controls', password.id);
    expect(reveal).toHaveAttribute('type', 'button');
    expect(reveal).toHaveAttribute('aria-pressed', 'false');
    expect(password).toHaveAttribute('type', 'password');

    fireEvent.change(password, { target: { value: 'test-password' } });
    fireEvent.click(reveal);
    expect(password).toHaveAttribute('type', 'text');
    expect(reveal).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(reveal);
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveValue('test-password');
    expect(reveal).toHaveAttribute('aria-pressed', 'false');
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });
  it.each(['/dashboard', '/boards/private'])('guards %s and gives actionable missing config', async (path) => {
    vi.stubGlobal('fetch', vi.fn()); route(path);
    expect(await screen.findByRole('heading', { name: 'Log in to Kanban', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_PUBLISHABLE_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
  });
  it('holds protected content during initial session load and unsubscribes on unmount', async () => {
    const fixture = mockAuth(); let resolve;
    fixture.client.auth.getSession.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const view = route('/dashboard', fixture.client);
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Loading authentication');
    expect(screen.queryByRole('heading', { name: 'Log in to Kanban' })).not.toBeInTheDocument();
    await act(async () => resolve({ data: { session: null }, error: null }));
    expect(await screen.findByRole('heading', { name: 'Log in to Kanban', level: 1 })).toBeInTheDocument();
    view.unmount(); expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not redirect signup with a null session and blocks duplicate submissions', async () => {
    const { client } = mockAuth(); let resolve;
    client.auth.signUp.mockImplementation(() => new Promise((r) => { resolve = r; }));
    route('/register', client); await screen.findByLabelText('Email (required)'); fillAuth();
    const form = screen.getByRole('form', { name: 'Create an account' });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(client.auth.signUp).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    await act(async () => resolve({ data: { session: null }, error: null }));
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'My boards' })).not.toBeInTheDocument();
  });
  it('supports confirmation-disabled signup returning an SDK session', async () => {
    const { client, emit } = mockAuth();
    client.auth.signUp.mockImplementation(async () => { emit('SIGNED_IN', testSession); return { data: { session: testSession }, error: null }; });
    vi.stubGlobal('fetch', vi.fn(async () => reply({ boards: [] })));
    route('/register', client); await screen.findByLabelText('Email (required)'); fillAuth(); fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByRole('heading', { name: 'My boards', level: 1 })).toBeInTheDocument();
  });
  it('gives a neutral recovery response even when provider rejects', async () => {
    const { client } = mockAuth(); client.auth.resetPasswordForEmail.mockRejectedValue(new Error('No account'));
    route('/forgot-password', client); await screen.findByLabelText('Email (required)'); fireEvent.change(screen.getByLabelText('Email (required)'), { target: { value: 'nobody@example.test' } }); fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByText(/If an account exists/)).toBeInTheDocument(); expect(screen.queryByText('No account')).not.toBeInTheDocument();
  });
  it.each(['/reset-password', '/auth/reset-password'])('rejects arbitrary signed-in sessions at %s', async (path) => {
    const { client } = mockAuth(testSession); route(path, client);
    expect(await screen.findByText(/normal signed-in session cannot/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New password (required)')).not.toBeInTheDocument(); expect(client.auth.updateUser).not.toHaveBeenCalled();
  });
  it('allows updates only after SDK PASSWORD_RECOVERY and consumes recovery permission', async () => {
    const { client, emit } = mockAuth(); route('/auth/callback?next=/reset-password', client);
    await screen.findByText(/could not be verified/);
    await act(async () => emit('PASSWORD_RECOVERY', testSession));
    const input = await screen.findByLabelText('New password (required)'); fireEvent.change(input, { target: { value: 'new-password' } }); fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByText(/password has been updated/)).toBeInTheDocument(); expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
  });
  it('invalidates workspace content when SDK changes identity and signs out', async () => {
    const { client, emit } = mockAuth(testSession); let count = 0;
    vi.stubGlobal('fetch', vi.fn(async () => reply({ boards: [{ id: 'b1', name: ++count === 1 ? 'Private one' : 'Private two' }] })));
    route('/dashboard', client); await screen.findByText('Private one');
    await act(async () => emit('SIGNED_IN', { ...testSession, user: { id: 'other-user' } }));
    expect(await screen.findByText('Private two')).toBeInTheDocument(); expect(screen.queryByText('Private one')).not.toBeInTheDocument();
    await act(async () => emit('SIGNED_OUT', null)); expect(await screen.findByRole('heading', { name: 'Log in to Kanban', level: 1 })).toBeInTheDocument(); expect(screen.queryByText('Private two')).not.toBeInTheDocument();
  });
  it('ignores an old-account pending 401 after switching to a new SDK account', async () => {
    const { client, emit } = mockAuth(testSession); let resolveOld; let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => ++calls === 1 ? new Promise((r) => { resolveOld = r; }) : Promise.resolve(reply({ boards: [{ id: 'b2', name: 'New account board' }] }))));
    route('/dashboard', client); await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    await act(async () => emit('SIGNED_IN', { ...testSession, user: { id: 'account-b' } }));
    await screen.findByText('New account board');
    await act(async () => resolveOld(reply({}, 401)));
    expect(screen.getByText('New account board')).toBeInTheDocument(); expect(client.auth.signOut).not.toHaveBeenCalled(); expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });
  it('only accepts safe internal redirects', () => {
    for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/\nevil']) expect(safeRedirect(path)).toBe('/dashboard');
    expect(safeRedirect('/boards/id?view=all')).toBe('/boards/id?view=all');
  });
});

describe('board and card operations', () => {
  it('searches board cards and opens the create form over the dashboard', async () => {
    const { client } = mockAuth(testSession);
    vi.stubGlobal('fetch', vi.fn(async (path) => {
      if (path === '/api/boards') return reply({ boards: [
        { id: 'roadmap', name: 'Roadmap', description: 'Planning the next release' },
        { id: 'hiring', name: 'Hiring', description: 'Interviews and offers' },
      ] });
      if (path === '/api/boards/roadmap') return reply({ board: { id: 'roadmap', name: 'Roadmap' }, columns: [
        { id: 'todo', name: 'To Do', cards: [{ id: 't1', title: 'Ship the search' }] },
        { id: 'doing', name: 'In Progress', cards: [] },
        { id: 'done', name: 'Done', cards: [] },
      ] });
      if (path === '/api/boards/hiring') return reply({ board: { id: 'hiring', name: 'Hiring' }, columns: [] });
      throw new Error(`Unexpected path ${path}`);
    }));
    route('/dashboard', client);
    const roadmapLink = await screen.findByRole('link', { name: 'Roadmap' });
    expect(await screen.findByText('1 task')).toBeInTheDocument();
    expect(roadmapLink).toHaveAccessibleDescription('1 task: 1 to do.');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search boards' }), { target: { value: 'hir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Roadmap' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Hiring' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 board found.');

    const newBoard = screen.getByRole('button', { name: 'New board' });
    fireEvent.click(newBoard);
    expect(await screen.findByRole('dialog', { name: 'Create board' })).toBeInTheDocument();
    const nameField = screen.getByLabelText('Board name (required)');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(nameField).toHaveFocus();
    fireEvent.keyDown(nameField, { key: 'Tab', shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Tab' });
    expect(nameField).toHaveFocus();
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(newBoard).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
  it('opens the card editor in a focused modal and restores focus when dismissed', async () => {
    const { client } = mockAuth(testSession);
    vi.stubGlobal('fetch', vi.fn(async () => reply({ board: { id: 'b1', name: 'Work' }, columns: [
      { id: 'todo', name: 'To Do', cards: [{ id: 'c1', title: 'First task', priority: 'HIGH', dueDate: '2026-11-21' }] },
    ] })));
    route('/boards/b1', client);
    await screen.findByRole('heading', { name: 'Work', level: 1 });
    const cardButton = screen.getByRole('button', { name: 'Edit card First task' });
    cardButton.focus(); fireEvent.click(cardButton);
    expect(await screen.findByRole('dialog', { name: 'Edit card' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title (required)')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Edit card' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cardButton).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
  it('locks other controls while saving and displays server field errors without a fake save', async () => {
    const { client } = mockAuth(testSession); let resolve;
    vi.stubGlobal('fetch', vi.fn(async (_path, options) => options.method === 'GET' ? reply({ board: { id: 'b1', name: 'Work' }, columns: [{ id: 'todo', name: 'To Do', cards: [] }] }) : new Promise((r) => { resolve = r; })));
    route('/boards/b1', client); await screen.findByRole('heading', { name: 'Work', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Add card to To Do' }));
    const title = screen.getByLabelText('Title (required)');
    expect(title).toHaveAttribute('maxlength', '200'); expect(title).toHaveAttribute('pattern', '.*\\S.*');
    fireEvent.change(title, { target: { value: 'Task' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Add card to To Do' }));
    expect(screen.getByRole('button', { name: 'Edit board' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Add card to To Do' })).toBeDisabled();
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    await act(async () => resolve(reply({ error: { code: 'VALIDATION_ERROR', message: 'Check the highlighted fields.', fieldErrors: { title: 'A different title is required.' } } }, 400)));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the highlighted fields.');
    expect(title).toHaveAttribute('aria-invalid', 'true'); expect(title).toHaveAccessibleDescription('A different title is required.'); expect(title).toHaveValue('Task');
    expect(screen.getByRole('button', { name: 'Create card' })).toBeEnabled(); expect(screen.getByRole('status')).toHaveTextContent('');
  });
  it('closes a committed create form when the following reload fails and only retries GET', async () => {
    const { client } = mockAuth(testSession); let reads = 0;
    const fetcher = vi.fn(async (_path, options) => {
      if (options.method === 'POST') return reply({ card: { id: 'new' } }, 201);
      if (++reads === 2) return reply({ error: { message: 'Reload unavailable' } }, 503);
      return reply({ board: { id: 'b1', name: 'Work' }, columns: [{ id: 'todo', name: 'To Do', cards: [] }] });
    });
    vi.stubGlobal('fetch', fetcher); route('/boards/b1', client);
    await screen.findByRole('heading', { name: 'Work', level: 1 }); fireEvent.click(screen.getByRole('button', { name: 'Add card to To Do' }));
    fireEvent.change(screen.getByLabelText('Title (required)'), { target: { value: 'Committed task' } }); fireEvent.submit(screen.getByRole('form', { name: 'Add card to To Do' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload unavailable');
    expect(screen.queryByRole('button', { name: 'Create card' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('change was saved');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await screen.findByRole('heading', { name: 'Work', level: 1 });
    expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  });
  it('creates, edits with null clears, moves and deletes canonical cards', async () => {
    const { client } = mockAuth(testSession);
    let cards = []; const requests = [];
    const detail = () => ({ board: { id: 'b1', name: 'Work', description: null }, columns: [{ id: 'todo', name: 'To Do', cards: cards.filter((c) => c.columnId === 'todo') }, { id: 'done', name: 'Done', cards: cards.filter((c) => c.columnId === 'done') }] });
    vi.stubGlobal('fetch', vi.fn(async (path, options) => {
      const body = options.body && JSON.parse(options.body); requests.push([path, options.method, body]);
      if (options.method === 'GET') return reply(detail());
      if (options.method === 'POST' && path.endsWith('/cards')) cards.push({ id: 'c1', columnId: 'todo', ...body });
      if (options.method === 'PUT') cards = cards.map((c) => ({ ...c, ...body }));
      if (path.endsWith('/move')) cards = cards.map((c) => ({ ...c, columnId: body.targetColumnId }));
      if (options.method === 'DELETE') { cards = []; return reply(null, 204); }
      return reply({ card: cards[0] });
    }));
    route('/boards/b1', client); await screen.findByRole('heading', { name: 'Work', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Add card to To Do' }));
    fireEvent.change(screen.getByLabelText('Title (required)'), { target: { value: 'First task' } });
    fireEvent.change(screen.getByLabelText(/Description \(optional/), { target: { value: 'Details' } });
    fireEvent.change(screen.getByLabelText('Due date (optional)'), { target: { value: '2027-01-03' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Add card to To Do' })); await screen.findByRole('heading', { name: 'First task' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit card First task' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Edit card First task' }));
    fireEvent.change(screen.getByLabelText(/Description \(optional/), { target: { value: '' } }); fireEvent.change(screen.getByLabelText('Due date (optional)'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Edit card First task' })); await waitFor(() => expect(screen.queryByRole('button', { name: 'Save card' })).not.toBeInTheDocument());
    expect(requests).toContainEqual(['/api/cards/c1', 'PUT', { title: 'First task', description: null, priority: 'MEDIUM', dueDate: null }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit card First task' }));
    fireEvent.change(screen.getByLabelText('Move to column'), { target: { value: 'done' } }); fireEvent.submit(screen.getByRole('form', { name: 'Move First task' })); await screen.findByText('Card moved.');
    expect(requests).toContainEqual(['/api/cards/c1/move', 'POST', { targetColumnId: 'done', newPosition: 0 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit card First task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete card First task' })); expect(screen.getByRole('button', { name: 'Cancel deletion' })).toHaveFocus(); fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' })); await screen.findByText('Card deleted.'); expect(screen.queryByRole('heading', { name: 'First task' })).not.toBeInTheDocument();
    expect(requests.filter((r) => r[1] === 'GET')).toHaveLength(5);
  });
});

describe('health UI', () => {
  it('checks liveness only on request and reports honestly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply())); render(<HealthCheck />); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' })); expect(await screen.findByText(/Java API is reachable/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' }));
  });
});
