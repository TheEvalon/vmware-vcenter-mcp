import { MockAgent } from 'undici';
import { setHttpAgentOverride } from '../../src/client/http-agent.js';
import type { VCenterConfig } from '../../src/config.js';
import { setLogLevel } from '../../src/utils/logger.js';

setLogLevel('error');

export const TEST_CONFIG: VCenterConfig = Object.freeze({
  host: 'vcenter.test',
  port: 443,
  user: 'admin@vsphere.local',
  pass: 'secret',
  insecure: true,
  logLevel: 'error',
  taskTimeoutMs: 5_000,
  taskPollMs: 5,
  readOnly: false,
  baseUrl: 'https://vcenter.test',
});

/**
 * Creates a fresh undici MockAgent and installs it as the global override
 * used by the http-agent module. Returns helpers for setting up matchers.
 */
export const installMockAgent = (): { agent: MockAgent; teardown: () => Promise<void> } => {
  const agent = new MockAgent({ connections: 1 });
  agent.disableNetConnect();
  setHttpAgentOverride(agent);
  return {
    agent,
    teardown: async () => {
      setHttpAgentOverride(undefined);
      await agent.close();
    },
  };
};

export const interceptOrigin = (agent: MockAgent, config: VCenterConfig = TEST_CONFIG) => agent.get(config.baseUrl);
