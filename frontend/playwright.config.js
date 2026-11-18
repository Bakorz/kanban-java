import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    // Synthetic, non-secret endpoints only for network-intercepted SDK tests.
    // The production application has no fixture flag or authentication bypass.
    env: process.env.KANBAN_E2E_REAL_API === '1' ? {} : { VITE_SUPABASE_URL: 'https://auth.kanban.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_playwright_fixture_only' },
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
