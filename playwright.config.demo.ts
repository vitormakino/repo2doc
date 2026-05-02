import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120000, 
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      slowMo: 1000,
    },
  },
  projects: [
    {
      name: 'demo-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
