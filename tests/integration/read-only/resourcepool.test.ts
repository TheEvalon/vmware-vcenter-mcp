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

describe('read-only: resource pools', () => {
  it('resourcepool_list returns the lab pool list (always non-empty when at least one cluster exists)', async () => {
    const result = await readOnly.callTool('resourcepool_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; resourcePools: unknown[] }>(result);
    expect(sc.count).toBe(sc.resourcePools.length);
    if (inventory.clusters.length > 0) {
      // Every cluster has an implicit Resources pool, so this should be > 0.
      expect(sc.count).toBeGreaterThan(0);
    }
  });

  it('resourcepool_list filtered by cluster MoRef parses', async () => {
    const cluster = firstOf(inventory.clusters);
    if (!cluster) return;
    const result = await readOnly.callTool('resourcepool_list', { clusters: [cluster.cluster] });
    expectOk(result);
  });
});
