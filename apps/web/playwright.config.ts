// playwright.config.ts: UI tests for the screens in docs/design/.
// Runs from apps/web (the `ui` CI job). Needs the dev dependencies of the web
// app: npm i -D -w apps/web @playwright/test @axe-core/playwright, and e2e/
// excluded from Vitest. Serves the built Vite app on port 4173.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'reports/ui/results',          // screenshots and traces (CI artifact)
  reporter: [['html', { outputFolder: 'reports/ui/html', open: 'never' }], ['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  // the breakpoints of the design system: every test runs at each of them
  projects: [
    { name: 'mobile-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 }, hasTouch: true } },
    { name: 'tablet-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
