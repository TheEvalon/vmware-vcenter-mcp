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

describe('read-only: snapshots', () => {
  it('snapshot_list returns a stable envelope for the first VM', async () => {
    const first = firstOf(inventory.vms);
    if (!first) {
      console.warn('Skipping snapshot_list: no VMs in lab');
      return;
    }
    const result = await readOnly.callTool('snapshot_list', { vmId: first.vm });
    expectOk(result);
    const sc = requireStructured<{
      currentSnapshot?: string;
      rootSnapshotList?: unknown[];
      raw: unknown;
    }>(result);
    if (sc.rootSnapshotList !== undefined) {
      expect(Array.isArray(sc.rootSnapshotList)).toBe(true);
    }
  });
});
