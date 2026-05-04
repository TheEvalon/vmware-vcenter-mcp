import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { buildClients, shutdownClients } from '../../src/client/index.js';
import { SERVICE_INSTANCE_MOID } from '../../src/client/vimjson-client.js';

const enabled = process.env['VCENTER_INTEGRATION'] === 'true';

describe.skipIf(!enabled)('integration: live vCenter smoke test', () => {
  const config = enabled ? loadConfig() : undefined;
  const clients = enabled && config ? buildClients(config) : undefined;

  afterAll(async () => {
    if (clients) await shutdownClients(clients);
  });

  it('logs in and reads ServiceInstance content', async () => {
    if (!clients) return;
    const content = await clients.vimjson.get<Record<string, unknown>>(
      `/${SERVICE_INSTANCE_MOID}/${SERVICE_INSTANCE_MOID}/content`,
    );
    expect(content).toBeTypeOf('object');
    expect(content?.['about']).toBeTypeOf('object');
  });

  it('lists VMs via REST', async () => {
    if (!clients) return;
    const vms = await clients.rest.get<unknown[]>('/vcenter/vm');
    expect(Array.isArray(vms)).toBe(true);
  });
});
