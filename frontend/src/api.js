export class ApiError extends Error {
  constructor(message, status = 0, code = '', fieldErrors = {}) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.fieldErrors = fieldErrors;
  }
}

export function createApi({ client, onAuthFailure = () => {}, isCurrent = () => true, fetcher = (...args) => fetch(...args), timeoutMs = 12000 }) {
  return async function api(path, { method = 'GET', body } = {}) {
    if (!/^\/api\/(?:boards|columns|cards)(?:\/[A-Za-z0-9_-]+)*(?:\/)?$/.test(path)) throw new ApiError('Invalid API path.');
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new ApiError('Unsupported API method.');
    const assertCurrent = () => { if (!isCurrent()) throw new ApiError('This workspace session changed. Reload the current workspace.', 0, 'STALE_SESSION'); };
    const failAuth = () => { assertCurrent(); onAuthFailure(); throw new ApiError('Your session has expired. Please log in again.', 401, 'UNAUTHORIZED'); };
    async function sdkCall(action) {
      let timer;
      try { return await Promise.race([action(), new Promise((_, reject) => { timer = setTimeout(() => reject(new ApiError('Authentication timed out. Please log in again.', 401)), timeoutMs); })]); }
      finally { clearTimeout(timer); }
    }
    assertCurrent();
    if (!client) return failAuth();
    let session;
    let initial;
    try { initial = await sdkCall(() => client.auth.getSession()); }
    catch { return failAuth(); }
    assertCurrent();
    if (initial.error || !initial.data.session?.access_token) return failAuth();
    session = initial.data.session;
    for (let attempt = 0; attempt < 2; attempt++) {
      assertCurrent();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response, data;
      try {
        response = await fetcher(path, { method, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
          headers: { Accept: 'application/json', Authorization: `Bearer ${session.access_token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
        if (response.status !== 204) {
          if (!response.headers.get('content-type')?.includes('application/json')) {
            if (response.status !== 401) throw new ApiError('The API did not return JSON. Please try again.', response.status);
          } else {
            try { data = await response.json(); }
            catch { if (response.status !== 401) throw new ApiError('The API returned unreadable JSON. Please try again.', response.status); }
          }
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(controller.signal.aborted ? 'The request timed out. Check your connection and try again.' : 'Could not reach the API. Check your connection and try again.');
      } finally { clearTimeout(timer); }
      assertCurrent();
      if (response.status === 401) {
        if (method !== 'GET' || attempt === 1) return failAuth();
        let refreshed;
        try { refreshed = await sdkCall(() => client.auth.refreshSession()); }
        catch { return failAuth(); }
        assertCurrent();
        if (refreshed.error || !refreshed.data.session?.access_token) return failAuth();
        session = refreshed.data.session;
        continue;
      }
      if (!response.ok) throw new ApiError(data?.error?.message || `Request failed (${response.status}). Please try again.`, response.status, data?.error?.code, data?.error?.fieldErrors);
      return response.status === 204 ? null : data;
    }
  };
}
