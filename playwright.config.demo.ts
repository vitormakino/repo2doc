import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120000, 
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  outputDir: './demos',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
    video: 'on',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      slowMo: 500,
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'demo-chromium',
      use: { 
        browserName: 'chromium',
      },
    },
  ],
});
