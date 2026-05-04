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

describe('read-only: networks', () => {
  it('network_list returns at least one network', async () => {
    const result = await readOnly.callTool('network_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; networks: unknown[] }>(result);
    expect(sc.count).toBe(sc.networks.length);
    expect(sc.count).toBeGreaterThan(0);
  });

  it('dvswitch_list with a known datacenter parses without crashing', async () => {
    const dc = firstOf(inventory.datacenters);
    if (!dc) {
      console.warn('Skipping dvswitch_list: no datacenters discovered');
      return;
    }
    const result = await readOnly.callTool('dvswitch_list', { datacenterId: dc.datacenter });
    expectOk(result);
    const sc = requireStructured<{ count: number; switches: unknown[] }>(result);
    expect(sc.count).toBe(sc.switches.length);
  });

  it('dvswitch_list without a datacenter argument returns the friendly empty result', async () => {
    const result = await readOnly.callTool('dvswitch_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; switches: unknown[] }>(result);
    expect(sc.count).toBe(0);
  });

  it('dvportgroup_list parses against the first dvSwitch (if any)', async () => {
    const dc = firstOf(inventory.datacenters);
    if (!dc) return;
    const dvsResult = await readOnly.callTool('dvswitch_list', { datacenterId: dc.datacenter });
    if (dvsResult.isError) return;
    const dvsList = dvsResult.structuredContent as { switches?: Array<{ value?: string }> } | undefined;
    const first = dvsList?.switches?.[0];
    if (!first?.value) {
      console.warn('Skipping dvportgroup_list: no dvSwitches discovered');
      return;
    }
    const result = await readOnly.callTool('dvportgroup_list', { dvswitchId: first.value });
    expectOk(result);
    const sc = requireStructured<{ count: number; portgroups: unknown[] }>(result);
    expect(sc.count).toBe(sc.portgroups.length);
  });
});
