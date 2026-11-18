import { describe, expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { mockAuth, testSession } from './testAuth.js';
const response = (data, status = 200, contentType = 'application/json') => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': contentType } });

describe('central API policy', () => {
  it('refreshes GET once and retries with the new SDK token', async () => {
    const { client } = mockAuth(testSession); client.auth.refreshSession.mockResolvedValue({ data: { session: { ...testSession, access_token: 'refreshed-token' } }, error: null });
    const fetcher = vi.fn().mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({ boards: [] }));
    const api = createApi({ client, fetcher }); expect(await api('/api/boards')).toEqual({ boards: [] });
    expect(fetcher).toHaveBeenCalledTimes(2); expect(client.auth.refreshSession).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer refreshed-token' } });
  });
  it('discards delayed old-account 401 without refreshing or clearing the current account', async () => {
    const { client } = mockAuth(testSession); let scope = 1; let resolve;
    const fetcher = vi.fn(() => new Promise((r) => { resolve = r; })); const clear = vi.fn();
    const request = createApi({ client, fetcher, onAuthFailure: clear, getScope: () => scope })('/api/boards');
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    scope = 2; resolve(response({}, 401));
    await expect(request).rejects.toMatchObject({ code: 'STALE_SESSION' });
    expect(client.auth.refreshSession).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledOnce();
  });
  it('blocks a stale 401 even when the account switch happens before React renders', async () => {
    const { client } = mockAuth(testSession); let scope = 7; let resolve;
    const fetcher = vi.fn(() => new Promise((r) => { resolve = r; })); const clear = vi.fn();
    const request = createApi({ client, fetcher, onAuthFailure: clear, getScope: () => scope })('/api/cards/id', { method: 'DELETE' });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    // Simulates a synchronous SDK callback: the ref changes without any awaited render.
    scope += 1; resolve(response({}, 401));
    await expect(request).rejects.toMatchObject({ code: 'STALE_SESSION' });
    expect(clear).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledOnce();
  });
  it('bounds repeated 401s and clears session state', async () => {
    const { client } = mockAuth(testSession); const onAuthFailure = vi.fn(); const fetcher = vi.fn(async () => response({}, 401));
    await expect(createApi({ client, fetcher, onAuthFailure })('/api/boards')).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(2); expect(client.auth.refreshSession).toHaveBeenCalledOnce(); expect(onAuthFailure).toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'DELETE'])('never retries %s mutations after 401', async (method) => {
    const { client } = mockAuth(testSession); const fetcher = vi.fn(async () => response({}, 401)); const clear = vi.fn();
    await expect(createApi({ client, fetcher, onAuthFailure: clear })('/api/cards/id', { method, body: { description: null } })).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledOnce(); expect(client.auth.refreshSession).not.toHaveBeenCalled(); expect(clear).toHaveBeenCalled();
  });
  it('parses 204 and structured errors and rejects HTML', async () => {
    const { client } = mockAuth(testSession);
    expect(await createApi({ client, fetcher: async () => response(null, 204) })('/api/cards/id', { method: 'DELETE' })).toBeNull();
    await expect(createApi({ client, fetcher: async () => response({ error: { code: 'VALIDATION_ERROR', message: 'Fix title', fieldErrors: { title: 'Required' } } }, 400) })('/api/boards')).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { title: 'Required' } });
    await expect(createApi({ client, fetcher: async () => response({}, 200, 'text/html') })('/api/boards')).rejects.toThrow('did not return JSON');
  });
  it('rejects non-API destinations before networking', async () => {
    const { client } = mockAuth(testSession); const fetcher = vi.fn();
    for (const path of ['https://evil.test/api/boards', '//evil.test/api/boards', '/api/boards/../users', '/api/health', '/api/boards?x=1']) await expect(createApi({ client, fetcher })(path)).rejects.toThrow('Invalid API path');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['getSession', 'refreshSession'])('bounds stalled SDK %s', async (method) => {
    const { client } = mockAuth(testSession); client.auth[method].mockImplementation(() => new Promise(() => {}));
    const clear = vi.fn(); const fetcher = vi.fn(async () => response({}, 401));
    await expect(createApi({ client, fetcher, onAuthFailure: clear, timeoutMs: 5 })('/api/boards')).rejects.toMatchObject({ status: 401 });
    expect(clear).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(method === 'getSession' ? 0 : 1);
  });
  it('has a finite timeout', async () => {
    const { client } = mockAuth(testSession);
    const fetcher = (_path, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    await expect(createApi({ client, fetcher, timeoutMs: 5 })('/api/boards')).rejects.toThrow('timed out');
  });
});
