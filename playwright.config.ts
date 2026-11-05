import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8788',
    headless: true,
  },
  webServer: {
    command: 'npx wrangler pages dev public --port 8788',
    port: 8788,
    timeout: 30000,
    reuseExistingServer: true,
  },
});
