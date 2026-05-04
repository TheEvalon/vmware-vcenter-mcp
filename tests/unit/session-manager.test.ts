import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockAgent } from 'undici';
import { SessionManager } from '../../src/client/session-manager.js';
import { AuthenticationError } from '../../src/client/errors.js';
import { TEST_CONFIG, installMockAgent, interceptOrigin } from './test-helpers.js';

let agent: MockAgent;
let teardown: () => Promise<void>;

beforeEach(() => {
  ({ agent, teardown } = installMockAgent());
});

afterEach(async () => {
  await teardown();
});

describe('SessionManager', () => {
  it('logs in with basic auth and caches the session id', async () => {
    interceptOrigin(agent)
      .intercept({ path: '/api/session', method: 'POST' })
      .reply(200, '"session-abc"', { headers: { 'content-type': 'application/json' } });

    const sm = new SessionManager(TEST_CONFIG);
    const id = await sm.getSessionId();
    expect(id).toBe('session-abc');
    expect(await sm.getSessionId()).toBe('session-abc');
  });

  it('parses the {value: ...} response shape', async () => {
    interceptOrigin(agent)
      .intercept({ path: '/api/session', method: 'POST' })
      .reply(200, { value: 'session-xyz' });

    const sm = new SessionManager(TEST_CONFIG);
    expect(await sm.getSessionId()).toBe('session-xyz');
  });

  it('coalesces concurrent login calls into a single round trip', async () => {
    interceptOrigin(agent)
      .intercept({ path: '/api/session', method: 'POST' })
      .reply(200, '"once"');

    const sm = new SessionManager(TEST_CONFIG);
    const [a, b] = await Promise.all([sm.getSessionId(), sm.getSessionId()]);
    expect(a).toBe('once');
    expect(b).toBe('once');
  });

  it('throws AuthenticationError on 401', async () => {
    interceptOrigin(agent)
      .intercept({ path: '/api/session', method: 'POST' })
      .reply(401, { error_message: 'bad creds' });

    const sm = new SessionManager(TEST_CONFIG);
    await expect(sm.getSessionId()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('invalidate forces a fresh login', async () => {
    interceptOrigin(agent)
      .intercept({ path: '/api/session', method: 'POST' })
      .reply(200, '"first"');
    interceptOrigin(agent)
      .intercept({ path: '/api/session', method: 'POST' })
      .reply(200, '"second"');

    const sm = new SessionManager(TEST_CONFIG);
    expect(await sm.getSessionId()).toBe('first');
    sm.invalidate();
    expect(await sm.getSessionId()).toBe('second');
  });
});
