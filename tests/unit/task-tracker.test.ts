import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockAgent } from 'undici';
import { TaskTracker } from '../../src/client/task-tracker.js';
import { TaskFailedError } from '../../src/client/errors.js';
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

const seedSession = (): void => {
  interceptOrigin(agent)
    .intercept({ path: '/api/session', method: 'POST' })
    .reply(200, '"sess-1"');
  interceptOrigin(agent)
    .intercept({
      path: '/sdk/vim25/release/ServiceInstance/ServiceInstance/content',
      method: 'GET',
    })
    .reply(200, { about: { apiVersion: '8.0.3.0' } });
};

describe('TaskTracker', () => {
  it('returns the TaskInfo when state becomes success', async () => {
    seedSession();
    interceptOrigin(agent)
      .intercept({ path: '/sdk/vim25/8.0.3.0/Task/task-1/info', method: 'GET' })
      .reply(200, { state: 'running', progress: 50 });
    interceptOrigin(agent)
      .intercept({ path: '/sdk/vim25/8.0.3.0/Task/task-1/info', method: 'GET' })
      .reply(200, { state: 'success', result: { value: 'snap-1' } });

    const session = new SessionManager(TEST_CONFIG);
    const vim = new VimJsonClient(TEST_CONFIG, session);
    await vim.getRelease();
    const tracker = new TaskTracker(TEST_CONFIG, vim);
    const info = await tracker.waitFor('task-1', { pollMs: 1, timeoutMs: 1_000 });
    expect(info.state).toBe('success');
    expect(info.result).toEqual({ value: 'snap-1' });
  });

  it('throws TaskFailedError on terminal error state', async () => {
    seedSession();
    interceptOrigin(agent)
      .intercept({ path: '/sdk/vim25/8.0.3.0/Task/task-2/info', method: 'GET' })
      .reply(200, { state: 'error', error: { localizedMessage: 'boom' } });

    const session = new SessionManager(TEST_CONFIG);
    const vim = new VimJsonClient(TEST_CONFIG, session);
    await vim.getRelease();
    const tracker = new TaskTracker(TEST_CONFIG, vim);
    await expect(tracker.waitFor('task-2', { pollMs: 1, timeoutMs: 1_000 })).rejects.toBeInstanceOf(TaskFailedError);
  });
});
