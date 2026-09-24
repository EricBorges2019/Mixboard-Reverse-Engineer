import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: 'http://localhost:5174' },
  webServer: [
    { command: 'pnpm --filter @mixboard/server e2e-server', port: 8788, reuseExistingServer: !process.env.CI },
    { command: 'API_PORT=8788 pnpm --filter @mixboard/web exec vite --port 5174', port: 5174, reuseExistingServer: !process.env.CI },
  ],
});
