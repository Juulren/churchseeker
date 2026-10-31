import { defineConfig } from '@playwright/test'

// End-to-end and break tests run against the production build (with its CSP) served by `vite preview`,
// and the real API with demo data. They use the system Microsoft Edge, so no browser download is needed.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'msedge',
    headless: true,
    launchOptions: { args: ['--enable-precise-memory-info', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'dotnet run --project ../Backend/src/ChurchSeeker.WebAPI --launch-profile http',
      url: 'http://localhost:5054/api/public/churches',
      reuseExistingServer: true,
      timeout: 180_000,
      // Test administrator for the staff area (local test database only).
      env: { Seed__AdminEmail: process.env.E2E_ADMIN_EMAIL ?? 'admin@churchseeker.local', Seed__AdminPassword: process.env.E2E_ADMIN_PASSWORD ?? 'Adm1n!Passw0rd#', RateLimiting__Auth: '1000' },
    },
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
})
