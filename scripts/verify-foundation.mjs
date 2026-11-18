import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

// Temporary integration test servers, not deployment. Never contacts Supabase.
if (process.platform === 'win32') throw new Error('Use Linux/macOS (process-group cleanup required).');
const children = [];
let cleanupPromise;
function signalGroup(child, signal) {
  if (!child.pid) return false;
  try { process.kill(-child.pid, signal); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
function cleanup() {
  return cleanupPromise ??= (async () => {
    for (const child of children) signalGroup(child, 'SIGTERM');
    // Check groups, not just parent exit: Maven/npm may exit before their servers.
    const deadline = Date.now() + 10000;
    while (children.some((child) => signalGroup(child, 0)) && Date.now() < deadline) await delay(100);
    for (const child of children) signalGroup(child, 'SIGKILL');
  })();
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.on(signal, () => { void cleanup().finally(() => process.exit(code)); });
}
function launch(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', detached: true, ...options });
  children.push(child);
  child.done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  // Capture a startup error immediately even while health is waiting.
  child.done.catch(() => {});
  return child;
}
try {
  for (const port of [8080, 5173]) {
    await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', () => reject(new Error(`Port ${port} must be free; refusing to reuse or stop another server.`)));
      probe.listen(port, '127.0.0.1', () => probe.close(resolve));
    });
  }
  const args = ['-B', '-ntp', '-f', 'backend/pom.xml', '-Pdev', 'package', 'exec:exec'];
  if (process.env.MAVEN_REPO_LOCAL) args.unshift(`-Dmaven.repo.local=${process.env.MAVEN_REPO_LOCAL}`);
  const backend = launch(process.env.MVN || 'mvn', args);
  let stopped = false;
  let startupError;
  backend.done.then(() => { stopped = true; }, (error) => { stopped = true; startupError = error; });
  let ready = false;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (stopped) throw startupError || new Error('Backend exited before health became ready.');
    try {
      const response = await fetch('http://127.0.0.1:8080/api/health', { signal: AbortSignal.timeout(1000) });
      const body = await response.json();
      if (response.ok && body.status === 'ok' && body.service === 'kanban-api') { ready = true; break; }
    } catch { /* Bounded readiness probe of the test server. */ }
    await delay(1000);
  }
  if (!ready) throw new Error('Backend health did not become ready within 180 seconds.');
  const browser = launch('npm', ['run', 'test:e2e'], {
    cwd: 'frontend', env: { ...process.env, KANBAN_E2E_REAL_API: '1' },
  });
  const result = await browser.done;
  if (result.code !== 0) throw new Error(`Browser integration failed (exit ${result.code}, signal ${result.signal}).`);
  console.log('Real React → Vite proxy → Servlet health integration passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
