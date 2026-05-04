import { defineConfig } from 'vitest/config';

const integrationMode = process.env['VCENTER_INTEGRATION'] === 'true';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: integrationMode ? [] : ['tests/integration/**'],
    environment: 'node',
    globals: false,
    // Integration tests share two MCP server processes via module-scoped
    // memoization in tests/integration/helpers/fixtures.ts. That singleton is
    // only safe when every integration test runs in the same worker, so we
    // disable file parallelism and cap workers to 1 in integration mode.
    fileParallelism: !integrationMode,
    ...(integrationMode ? { maxWorkers: 1, minWorkers: 1, isolate: false } : {}),
    // Boot vCenter env validation once at the start of the integration run.
    globalSetup: integrationMode ? ['tests/integration/global-setup.ts'] : undefined,
    // Spawning + login + discovery + every read-only tool against a live
    // vCenter takes longer than the vitest default of 5s. 2 minutes per test
    // covers task polling for browse/search calls without hiding hangs.
    testTimeout: integrationMode ? 120_000 : 10_000,
    hookTimeout: integrationMode ? 120_000 : 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['dist', 'tests', '**/*.d.ts'],
    },
  },
});
