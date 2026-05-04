import type { VCenterConfig } from '../config.js';
import { RestClient } from './rest-client.js';
import { SessionManager } from './session-manager.js';
import { TaskTracker } from './task-tracker.js';
import { VimJsonClient } from './vimjson-client.js';
import { closeHttpAgent } from './http-agent.js';

/**
 * Aggregate handle passed to every tool module. Holds the singleton clients
 * built off a single SessionManager so the cached vCenter session is shared
 * across REST and VI/JSON.
 */
export interface Clients {
  readonly config: VCenterConfig;
  readonly session: SessionManager;
  readonly rest: RestClient;
  readonly vimjson: VimJsonClient;
  readonly tasks: TaskTracker;
  /**
   * Lazily-loaded SOAP client. Returns the cached instance after the first
   * call.
   */
  getSoap(): Promise<import('./soap-client.js').SoapClient>;
}

/**
 * Builds the aggregate Clients object. Idempotent within a single config.
 */
export const buildClients = (config: VCenterConfig): Clients => {
  const session = new SessionManager(config);
  const rest = new RestClient(config, session);
  const vimjson = new VimJsonClient(config, session);
  const tasks = new TaskTracker(config, vimjson);
  let soap: import('./soap-client.js').SoapClient | undefined;
  return {
    config,
    session,
    rest,
    vimjson,
    tasks,
    async getSoap() {
      if (soap) return soap;
      const { SoapClient } = await import('./soap-client.js');
      soap = new SoapClient(config);
      await soap.connect();
      return soap;
    },
  };
};

/**
 * Releases all client resources. Called on process shutdown.
 */
export const shutdownClients = async (clients: Clients): Promise<void> => {
  await clients.session.logout().catch(() => undefined);
  await closeHttpAgent().catch(() => undefined);
};
