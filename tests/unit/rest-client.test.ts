import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockAgent } from 'undici';
import { RestClient } from '../../src/client/rest-client.js';
import { SessionManager } from '../../src/client/session-manager.js';
import { AuthenticationError, NotFoundError } from '../../src/client/errors.js';
import { TEST_CONFIG, installMockAgent, interceptOrigin } from './test-helpers.js';

let agent: MockAgent;
let teardown: () => Promise<void>;

beforeEach(() => {
  ({ agent, teardown } = installMockAgent());
});

afterEach(async () => {
  await teardown();
});

const seedLogin = (sessionId = 'sess-1'): void => {
  interceptOrigin(agent)
    .intercept({ path: '/api/session', method: 'POST' })
    .reply(200, `"${sessionId}"`);
};

describe('RestClient', () => {
  it('GETs JSON with the session header and returns the parsed body', async () => {
    seedLogin();
    interceptOrigin(agent)
      .intercept({
        path: '/api/vcenter/vm',
        method: 'GET',
      })
      .reply(200, [{ vm: 'vm-1', name: 'web-01' }]);

    const session = new SessionManager(TEST_CONFIG);
    const rest = new RestClient(TEST_CONFIG, session);
    const vms = await rest.get<Array<{ vm: string; name: string }>>('/vcenter/vm');
    expect(vms).toEqual([{ vm: 'vm-1', name: 'web-01' }]);
  });

  it('serializes query parameters', async () => {
    seedLogin();
    interceptOrigin(agent)
      .intercept({
        path: '/api/vcenter/vm?names=web-01',
        method: 'GET',
      })
      .reply(200, []);

    const rest = new RestClient(TEST_CONFIG, new SessionManager(TEST_CONFIG));
    await rest.get('/vcenter/vm', { query: { names: 'web-01' } });
  });

  it('re-authenticates once on 401 then retries', async () => {
    seedLogin('first');
    interceptOrigin(agent)
      .intercept({ path: '/api/vcenter/vm', method: 'GET' })
      .reply(401, { error_message: 'expired' });
    interceptOrigin(agent)
      .intercept({ path: '/api/session', method: 'POST' })
      .reply(200, '"second"');
    interceptOrigin(agent)
      .intercept({ path: '/api/vcenter/vm', method: 'GET' })
      .reply(200, [{ vm: 'vm-1', name: 'ok' }]);

    const rest = new RestClient(TEST_CONFIG, new SessionManager(TEST_CONFIG));
    const vms = await rest.get<unknown[]>('/vcenter/vm');
    expect(vms).toHaveLength(1);
  });

  it('throws AuthenticationError if 401 persists after retry', async () => {
    seedLogin('first');
    interceptOrigin(agent)
      .intercept({ path: '/api/vcenter/vm', method: 'GET' })
      .reply(401, {});
    interceptOrigin(agent)
      .intercept({ path: '/api/session', method: 'POST' })
      .reply(200, '"second"');
    interceptOrigin(agent)
      .intercept({ path: '/api/vcenter/vm', method: 'GET' })
      .reply(401, {});

    const rest = new RestClient(TEST_CONFIG, new SessionManager(TEST_CONFIG));
    await expect(rest.get('/vcenter/vm')).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('maps 404 to NotFoundError', async () => {
    seedLogin();
    interceptOrigin(agent)
      .intercept({ path: '/api/vcenter/vm/vm-missing', method: 'GET' })
      .reply(404, { error_message: 'not found' });

    const rest = new RestClient(TEST_CONFIG, new SessionManager(TEST_CONFIG));
    await expect(rest.get('/vcenter/vm/vm-missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('POSTs JSON body and returns the parsed result', async () => {
    seedLogin();
    interceptOrigin(agent)
      .intercept({
        path: '/api/vcenter/vm',
        method: 'POST',
        body: JSON.stringify({ name: 'new-vm' }),
      })
      .reply(200, '"vm-99"');

    const rest = new RestClient(TEST_CONFIG, new SessionManager(TEST_CONFIG));
    const result = await rest.post<string>('/vcenter/vm', { name: 'new-vm' });
    expect(result).toBe('vm-99');
  });
});
