import { Agent } from 'undici';
import type { Dispatcher } from 'undici';
import type { VCenterConfig } from '../config.js';

let cachedAgent: Agent | undefined;
let cachedKey: string | undefined;
let testOverride: Dispatcher | undefined;

/**
 * Returns the singleton undici dispatcher used by every HTTP client. The
 * agent re-uses keep-alive sockets and toggles TLS verification based on
 * `config.insecure` (used for homelab / self-signed certs).
 *
 * If a test override has been installed via `setHttpAgentOverride`, that
 * dispatcher is returned regardless of config.
 */
export const getHttpAgent = (config: VCenterConfig): Dispatcher => {
  if (testOverride) return testOverride;
  const key = `${config.host}:${config.port}:${String(config.insecure)}`;
  if (cachedAgent && cachedKey === key) return cachedAgent;
  cachedAgent?.close().catch(() => undefined);
  cachedAgent = new Agent({
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    connect: {
      rejectUnauthorized: !config.insecure,
    },
  });
  cachedKey = key;
  return cachedAgent;
};

/**
 * Installs a custom dispatcher (e.g. undici MockAgent) for tests.
 * Pass `undefined` to clear the override.
 */
export const setHttpAgentOverride = (dispatcher: Dispatcher | undefined): void => {
  testOverride = dispatcher;
};

/**
 * Closes the cached agent. Intended for tests and graceful shutdown.
 */
export const closeHttpAgent = async (): Promise<void> => {
  if (cachedAgent) {
    await cachedAgent.close();
    cachedAgent = undefined;
    cachedKey = undefined;
  }
};
