export function apiBase(value = import.meta.env.VITE_API_BASE_URL) {
  if (value === undefined || value === '' || value === '/api') return '/api';
  throw new Error('VITE_API_BASE_URL must be /api. Use a same-origin reverse proxy.');
}

export async function checkHealth({ timeoutMs = 5000, fetcher = fetch } = {}) {
  const controller = new AbortController();
  let timer;
  // A race bounds even an unresponsive fetch implementation. Abort also releases
  // the real browser request; tokens/credentials are never sent to this probe.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('The Java API did not respond in time. Start the backend and try again.'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(`${apiBase()}/health`, {
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          redirect: 'error',
        });
        if (!response.ok) throw new Error('The Java API is unavailable. Start the backend and try again.');
        if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
          throw new Error('The server did not return JSON. Check the /api proxy configuration.');
        }
        let data;
        try { data = await response.json(); }
        catch { throw new Error('The server returned invalid JSON. Check the Java API.'); }
        if (data?.status !== 'ok' || data?.service !== 'kanban-api') {
          throw new Error('The response was not the expected Kanban API health check.');
        }
        return data;
      })(),
      deadline,
    ]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The Java API did not respond in time. Start the backend and try again.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach the Java API. Start the backend and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
