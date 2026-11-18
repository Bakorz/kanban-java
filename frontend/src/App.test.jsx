import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App, HealthCheck } from './App.jsx';

const reply = (data = { status: 'ok', service: 'kanban-api' }) => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => data });

function route(path) { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }

describe('foundation routing', () => {
  it.each([
    ['/dashboard', 'My boards'], ['/login', 'Log in'], ['/register', 'Create an account'],
    ['/forgot-password', 'Reset your password'], ['/reset-password', 'Choose a new password'],
    ['/auth/reset-password', 'Choose a new password'], ['/auth/callback', 'Authentication callback'],
    ['/boards/preview', 'Board preview'], ['/boards/not-owned', 'Board unavailable'],
    ['/missing', 'Page not found'],
  ])('%s has a descriptive title and focused heading', async (path, title) => {
    route(path);
    const heading = screen.getByRole('heading', { level: 1, name: title });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(document.title).toBe(`${title} | Kanban`);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#content');
  });
  it('redirects the root to the public dashboard preview', () => {
    route('/');
    expect(screen.getByRole('heading', { level: 1, name: 'My boards' })).toBeInTheDocument();
    expect(screen.getByText(/not a signed-in workspace/)).toBeInTheDocument();
  });
  it('navigates to the board preview without claiming saved data', async () => {
    route('/dashboard');
    fireEvent.click(screen.getByRole('link', { name: 'Open board preview' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Board preview' })).toBeInTheDocument();
    expect(screen.getByText(/No board has been created/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'To Do' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'In Progress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Done' })).toBeInTheDocument();
  });
  it('never collects credentials in authentication placeholders', () => {
    route('/login');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/No credentials are collected/)).toBeInTheDocument();
  });
});

describe('health UI', () => {
  it('only checks on request and announces successful liveness honestly', async () => {
    let resolve;
    const fetcher = vi.fn(() => new Promise((r) => { resolve = r; }));
    vi.stubGlobal('fetch', fetcher);
    render(<HealthCheck />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }));
    expect(screen.getByRole('button', { name: /Checking connection/ })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Checking Java API connection');
    resolve(reply());
    expect(await screen.findByText(/Java API is reachable/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/database connectivity are not checked/);
    expect(fetcher).toHaveBeenCalledWith('/api/health', expect.objectContaining({ credentials: 'omit', cache: 'no-store', redirect: 'error' }));
  });
  it('allows retry after failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(reply()));
    render(<HealthCheck />);
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }));
    expect(await screen.findByText(/Could not reach/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }));
    expect(await screen.findByText(/Java API is reachable/)).toBeInTheDocument();
  });
});
