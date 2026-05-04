import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockAgent } from 'undici';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerVmList } from '../../src/tools/vm/list.js';
import { RestClient } from '../../src/client/rest-client.js';
import { SessionManager } from '../../src/client/session-manager.js';
import { VimJsonClient } from '../../src/client/vimjson-client.js';
import { TaskTracker } from '../../src/client/task-tracker.js';
import type { Clients } from '../../src/client/index.js';
import { TEST_CONFIG, installMockAgent, interceptOrigin } from './test-helpers.js';

let agent: MockAgent;
let teardown: () => Promise<void>;

const buildClients = (): Clients => {
  const session = new SessionManager(TEST_CONFIG);
  const rest = new RestClient(TEST_CONFIG, session);
  const vimjson = new VimJsonClient(TEST_CONFIG, session);
  return {
    config: TEST_CONFIG,
    session,
    rest,
    vimjson,
    tasks: new TaskTracker(TEST_CONFIG, vimjson),
    async getSoap() {
      throw new Error('not used in vm_list test');
    },
  };
};

beforeEach(() => {
  ({ agent, teardown } = installMockAgent());
});

afterEach(async () => {
  await teardown();
});

describe('vm_list tool', () => {
  it('returns the parsed vCenter VM list and a summary message', async () => {
    interceptOrigin(agent)
      .intercept({ path: '/api/session', method: 'POST' })
      .reply(200, '"sess-1"');
    interceptOrigin(agent)
      .intercept({ path: '/api/vcenter/vm?names=web-01', method: 'GET' })
      .reply(200, [{ vm: 'vm-101', name: 'web-01', power_state: 'POWERED_ON', cpu_count: 2, memory_size_MiB: 4096 }]);

    const server = new McpServer({ name: 't', version: '0.0.0' });
    registerVmList(server, buildClients());

    const internal = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })._registeredTools;
    const handler = internal['vm_list']?.handler;
    expect(typeof handler).toBe('function');
    const result = (await handler!({ names: ['web-01'] })) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: { count: number; vms: unknown[] };
    };
    expect(result.content[0]?.text).toMatch(/Found 1 VM/);
    expect(result.structuredContent.count).toBe(1);
    expect(result.structuredContent.vms).toHaveLength(1);
  });
});
