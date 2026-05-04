import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectOk, requireStructured } from '../helpers/assertions.js';
import { requireFirstOf, type Inventory } from '../helpers/inventory.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;
let inventory: Inventory;

beforeAll(async () => {
  ({ readOnly, inventory } = await getFixtures());
});

describe('read-only: hosts', () => {
  it('host_list returns at least one ESXi host', async () => {
    const result = await readOnly.callTool('host_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; hosts: unknown[] }>(result);
    expect(sc.count).toBe(sc.hosts.length);
    expect(sc.count).toBeGreaterThan(0);
  });

  it('host_list with connection state filter parses without error', async () => {
    const result = await readOnly.callTool('host_list', { connectionStates: ['CONNECTED'] });
    expectOk(result);
  });

  it('host_get returns summary for the first known host', async () => {
    const first = requireFirstOf(inventory.hosts, 'ESXi hosts');
    const result = await readOnly.callTool('host_get', { hostId: first.host });
    expectOk(result);
    const sc = requireStructured<{ summary: unknown; runtime?: unknown }>(result);
    expect(sc.summary).toBeDefined();
  });
});
