import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockAgent } from 'undici';
import { VimJsonClient } from '../../src/client/vimjson-client.js';
import { SessionManager } from '../../src/client/session-manager.js';
import { TEST_CONFIG, installMockAgent, interceptOrigin } from './test-helpers.js';

let agent: MockAgent;
let teardown: () => Promise<void>;

beforeEach(() => {
  ({ agent, teardown } = installMockAgent());
});

afterEach(async () => {
  await teardown();
});

const seedLogin = (): void => {
  interceptOrigin(agent)
    .intercept({ path: '/api/session', method: 'POST' })
    .reply(200, '"sess-1"');
};

describe('VimJsonClient', () => {
  it('detects the API release from ServiceInstance content', async () => {
    seedLogin();
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/release/ServiceInstance/ServiceInstance/content',
        method: 'GET',
      })
      .reply(200, { about: { apiVersion: '8.0.3.0' } });
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/8.0.3.0/VirtualMachine/vm-1/snapshot',
        method: 'GET',
      })
      .reply(200, { rootSnapshotList: [] });

    const vim = new VimJsonClient(TEST_CONFIG, new SessionManager(TEST_CONFIG));
    const release = await vim.getRelease();
    expect(release).toBe('8.0.3.0');
    await vim.get('/VirtualMachine/vm-1/snapshot');
  });

  it('postTask parses managed object reference', async () => {
    seedLogin();
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/release/ServiceInstance/ServiceInstance/content',
        method: 'GET',
      })
      .reply(200, { about: { apiVersion: '8.0.3.0' } });
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/8.0.3.0/VirtualMachine/vm-1/CreateSnapshotEx_Task',
        method: 'POST',
      })
      .reply(200, { _typeName: 'ManagedObjectReference', type: 'Task', value: 'task-7' });

    const vim = new VimJsonClient(TEST_CONFIG, new SessionManager(TEST_CONFIG));
    const ref = await vim.postTask('/VirtualMachine/vm-1/CreateSnapshotEx_Task', { name: 'snap' });
    expect(ref).toEqual({ type: 'Task', value: 'task-7' });
  });

  it('falls back to "release" when ServiceInstance is unreadable', async () => {
    seedLogin();
    interceptOrigin(agent)
      .intercept({
        path: '/sdk/vim25/release/ServiceInstance/ServiceInstance/content',
        method: 'GET',
      })
      .reply(500, {});

    const vim = new VimJsonClient(TEST_CONFIG, new SessionManager(TEST_CONFIG));
    expect(await vim.getRelease()).toBe('release');
  });
});
