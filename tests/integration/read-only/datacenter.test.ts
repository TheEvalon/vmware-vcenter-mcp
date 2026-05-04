import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectOk, requireStructured } from '../helpers/assertions.js';
import { firstOf, type Inventory } from '../helpers/inventory.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;
let inventory: Inventory;

beforeAll(async () => {
  ({ readOnly, inventory } = await getFixtures());
});

describe('read-only: datacenters and folders', () => {
  it('datacenter_list returns at least one datacenter', async () => {
    const result = await readOnly.callTool('datacenter_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; datacenters: unknown[] }>(result);
    expect(sc.count).toBe(sc.datacenters.length);
    expect(sc.count).toBeGreaterThan(0);
  });

  it('folder_list returns the inventory folders', async () => {
    const result = await readOnly.callTool('folder_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; folders: unknown[] }>(result);
    expect(sc.count).toBe(sc.folders.length);
    expect(sc.count).toBeGreaterThan(0);
  });

  it('folder_list filtered by VIRTUAL_MACHINE type still parses', async () => {
    const result = await readOnly.callTool('folder_list', { type: 'VIRTUAL_MACHINE' });
    expectOk(result);
  });

  it('folder_list filtered by datacenter MoRef parses', async () => {
    const dc = firstOf(inventory.datacenters);
    if (!dc) return;
    const result = await readOnly.callTool('folder_list', { datacenters: [dc.datacenter] });
    expectOk(result);
  });
});
