import { describe, expect, it, vi } from 'vitest';
import { apiBase, checkHealth } from './health.js';

const response = (data, contentType = 'application/json') => ({ ok: true, headers: new Headers({ 'content-type': contentType }), json: async () => data });

describe('API origin guard', () => {
  it.each([undefined, '', '/api'])('allows %s', (value) => expect(apiBase(value)).toBe('/api'));
  it.each(['https://other.example/api', '//other.example', '/api/', '/api?token=x', '/api/../other'])('rejects %s', (value) => expect(() => apiBase(value)).toThrow('must be /api'));
});

describe('health response validation', () => {
  it('accepts the expected service and status', async () => {
    const data = { status: 'ok', service: 'kanban-api' };
    await expect(checkHealth({ fetcher: vi.fn().mockResolvedValue(response(data)) })).resolves.toEqual(data);
  });
  it('rejects HTTP failures', async () => {
    await expect(checkHealth({ fetcher: vi.fn().mockResolvedValue({ ok: false }) })).rejects.toThrow('unavailable');
  });
  it('rejects HTML instead of JSON', async () => {
    await expect(checkHealth({ fetcher: vi.fn().mockResolvedValue(response({}, 'text/html')) })).rejects.toThrow('did not return JSON');
  });
  it('rejects malformed JSON', async () => {
    await expect(checkHealth({ fetcher: vi.fn().mockResolvedValue({ ...response({}), json: () => Promise.reject(new SyntaxError()) }) })).rejects.toThrow('invalid JSON');
  });
  it.each([null, [], {}, { status: 'ok', service: 'another-api' }, { status: 'down', service: 'kanban-api' }])('rejects unexpected payload %j', async (data) => {
    await expect(checkHealth({ fetcher: vi.fn().mockResolvedValue(response(data)) })).rejects.toThrow('not the expected');
  });
  it('bounds a hung request and aborts its signal', async () => {
    vi.useFakeTimers();
    let signal;
    const result = checkHealth({ timeoutMs: 20, fetcher: vi.fn((_, options) => { signal = options.signal; return new Promise(() => {}); }) });
    const assertion = expect(result).rejects.toThrow('did not respond in time');
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    expect(signal.aborted).toBe(true);
  });
  it('rejects invalid API environment configuration before fetching', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://other.example');
    const fetcher = vi.fn();
    await expect(checkHealth({ fetcher })).rejects.toThrow('must be /api');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
