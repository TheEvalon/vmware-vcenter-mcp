import { startReadOnlyServer, startWritableServer, type McpFixture } from './mcp-client.js';
import { discoverInventory, type Inventory } from './inventory.js';

/**
 * Shared, lazy-initialized fixtures used by every integration test file. We
 * memoize at module scope so that with `singleThread: true` in the vitest
 * config there is exactly one read-only server, one writable server, and one
 * inventory snapshot for the entire suite.
 */
interface SharedFixtures {
  readonly readOnly: McpFixture;
  readonly writable: McpFixture;
  readonly inventory: Inventory;
}

let cached: SharedFixtures | undefined;
let cachedPromise: Promise<SharedFixtures> | undefined;

const initialize = async (): Promise<SharedFixtures> => {
  const readOnly = await startReadOnlyServer();
  let writable: McpFixture | undefined;
  let inventory: Inventory | undefined;
  try {
    writable = await startWritableServer();
    inventory = await discoverInventory(readOnly);
  } catch (err) {
    await readOnly.close().catch(() => undefined);
    if (writable) await writable.close().catch(() => undefined);
    throw err;
  }
  cached = { readOnly, writable, inventory };
  registerExitHandler();
  return cached;
};

let exitHandlerInstalled = false;
const registerExitHandler = (): void => {
  if (exitHandlerInstalled) return;
  exitHandlerInstalled = true;
  const cleanup = (): void => {
    if (!cached) return;
    cached.readOnly.close().catch(() => undefined);
    cached.writable.close().catch(() => undefined);
    cached = undefined;
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
};

/**
 * Returns the shared fixtures, spawning servers and discovering inventory on
 * the first call. Subsequent calls await the same in-flight promise so two
 * test files importing this in parallel never spawn duplicate processes.
 */
export const getFixtures = async (): Promise<SharedFixtures> => {
  if (cached) return cached;
  if (cachedPromise) return cachedPromise;
  cachedPromise = initialize().finally(() => {
    cachedPromise = undefined;
  });
  return cachedPromise;
};

/**
 * Tears down the shared fixtures. Called automatically on process exit; tests
 * generally do not need to invoke this directly.
 */
export const closeFixtures = async (): Promise<void> => {
  if (!cached) return;
  const { readOnly, writable } = cached;
  cached = undefined;
  await readOnly.close().catch(() => undefined);
  await writable.close().catch(() => undefined);
};
