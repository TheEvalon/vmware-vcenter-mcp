import { beforeAll, describe, expect, it } from 'vitest';
import { getFixtures } from '../helpers/fixtures.js';
import { firstOf, type Inventory } from '../helpers/inventory.js';
import type { McpFixture } from '../helpers/mcp-client.js';

let readOnly: McpFixture;
let inventory: Inventory;

beforeAll(async () => {
  ({ readOnly, inventory } = await getFixtures());
});

/**
 * vSphere Lifecycle Manager (vLCM) is opt-in per cluster, so the calls below
 * may either succeed (cluster managed by image) or return a vCenter error
 * (cluster managed by baselines / unmanaged). Both outcomes are acceptable -
 * the bug we're guarding against is the MCP server crashing or returning a
 * malformed response.
 */
describe('read-only: vSphere Lifecycle Manager', () => {
  it('lifecycle_listClusterImage either returns the desired image or a clean error', async () => {
    const cluster = firstOf(inventory.clusters);
    if (!cluster) return;
    const result = await readOnly.callTool('lifecycle_listClusterImage', {
      clusterId: cluster.cluster,
    });
    expect(result.content.length).toBeGreaterThan(0);
    if (!result.isError) {
      expect(result.structuredContent).toBeDefined();
    }
  });

  it('lifecycle_checkCompliance either returns a compliance result or a clean error', async () => {
    const cluster = firstOf(inventory.clusters);
    if (!cluster) return;
    const result = await readOnly.callTool('lifecycle_checkCompliance', {
      clusterId: cluster.cluster,
    });
    expect(result.content.length).toBeGreaterThan(0);
    if (!result.isError) {
      expect(result.structuredContent).toBeDefined();
    }
  });
});
