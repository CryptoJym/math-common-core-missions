const { defineConfig } = require('@playwright/test');

const baseURL = process.env.BRADY_BASE_URL || 'https://math-common-core-missions.vercel.app';

module.exports = defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  retries: Number(process.env.CI || 0) ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
  ],
});
