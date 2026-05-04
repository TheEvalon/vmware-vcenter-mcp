import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { expectOk, requireStructured } from '../helpers/assertions.js';
import { firstOf, requireFirstOf, type Inventory } from '../helpers/inventory.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;
let inventory: Inventory;

beforeAll(async () => {
  ({ readOnly, inventory } = await getFixtures());
});

describe('read-only: clusters + DRS', () => {
  it('cluster_list returns the lab clusters', async () => {
    const result = await readOnly.callTool('cluster_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; clusters: unknown[] }>(result);
    expect(sc.count).toBe(sc.clusters.length);
    expect(sc.count).toBeGreaterThan(0);
  });

  it('cluster_get returns details + DRS/HA configuration for the first cluster', async () => {
    const first = requireFirstOf(inventory.clusters, 'clusters');
    const result = await readOnly.callTool('cluster_get', { clusterId: first.cluster });
    expectOk(result);
    const sc = requireStructured<{ cluster: unknown; configuration?: unknown }>(result);
    expect(sc.cluster).toBeDefined();
  });

  it('drs_recommendations returns an array (possibly empty)', async () => {
    const first = firstOf(inventory.clusters);
    if (!first) {
      console.warn('Skipping drs_recommendations: no clusters discovered');
      return;
    }
    const result = await readOnly.callTool('drs_recommendations', { clusterId: first.cluster });
    expectOk(result);
    const sc = requireStructured<{ recommendations: unknown[] }>(result);
    expect(Array.isArray(sc.recommendations)).toBe(true);
  });
});
