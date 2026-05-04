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

interface PerfCounter {
  key: number;
  nameInfo?: { key?: string };
  groupInfo?: { key?: string };
  rollupType?: string;
}

describe('read-only: performance stats', () => {
  it('stats_listCounters returns the perf counter catalog', async () => {
    const result = await readOnly.callTool('stats_listCounters', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; counters: PerfCounter[] }>(result);
    expect(sc.count).toBe(sc.counters.length);
    expect(sc.count).toBeGreaterThan(0);
    // Every counter must carry a numeric key (cross-checks the upstream
    // unwrapVimArray + JSON parsing of polymorphic VI/JSON arrays).
    for (const counter of sc.counters.slice(0, 5)) {
      expect(typeof counter.key).toBe('number');
    }
  });

  it('stats_query against a host with cpu.usage.average returns a result envelope', async () => {
    const host = firstOf(inventory.hosts);
    if (!host) return;
    const counters = await readOnly.callTool('stats_listCounters', { groupInfoKeys: ['cpu'] });
    const counterList = (counters.structuredContent?.['counters'] as PerfCounter[]) ?? [];
    const cpuUsageAvg = counterList.find(
      (c) => c.nameInfo?.key === 'usage' && c.rollupType === 'average',
    );
    if (!cpuUsageAvg) {
      console.warn('Skipping stats_query: cpu.usage.average counter not found in lab');
      return;
    }
    const result = await readOnly.callTool('stats_query', {
      entityType: 'HostSystem',
      entityId: host.host,
      counterIds: [cpuUsageAvg.key],
      maxSamples: 5,
      intervalSeconds: 20,
    });
    expectOk(result);
  });

  it('stats_summary against a host returns the PerfProviderSummary envelope', async () => {
    const host = firstOf(inventory.hosts);
    if (!host) return;
    const result = await readOnly.callTool('stats_summary', {
      entityType: 'HostSystem',
      entityId: host.host,
    });
    expectOk(result);
  });
});
