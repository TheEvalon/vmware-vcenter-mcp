import { config as loadDotenv } from 'dotenv';

/**
 * Vitest globalSetup runs once in the parent process before any test worker
 * starts. We use it to validate the lab connection variables up front so the
 * suite fails loudly with a single, clear message instead of dozens of
 * confusing per-test login failures.
 *
 * We intentionally do NOT spawn the MCP server here: globalSetup runs in a
 * separate process from the workers and cannot share live handles. Servers
 * are spawned lazily by `helpers/fixtures.ts` inside the worker.
 */
const REQUIRED_VARS = ['VCENTER_HOST', 'VCENTER_USER', 'VCENTER_PASS'] as const;

export default function setup(): void | (() => void) {
  loadDotenv();
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `\nIntegration tests require a live vCenter. Missing env vars: ${missing.join(', ')}.\n` +
        'Copy .env.example to .env, fill in your vCenter credentials, then re-run.\n' +
        'Or pass the variables on the command line for one-off runs.',
    );
  }
  if (process.env['VCENTER_INTEGRATION'] !== 'true') {
    process.env['VCENTER_INTEGRATION'] = 'true';
  }
  // Default to a low log level inside the spawned server so its stderr does
  // not drown out vitest output.
  if (!process.env['VCENTER_LOG_LEVEL']) {
    process.env['VCENTER_LOG_LEVEL'] = 'warn';
  }
  // No teardown needed: child processes die with the parent on exit.
  return undefined;
}
