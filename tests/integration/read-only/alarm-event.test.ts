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

describe('read-only: alarms and events', () => {
  it('alarm_list with no entity returns the global alarm catalog', async () => {
    const result = await readOnly.callTool('alarm_list', {});
    expectOk(result);
    const sc = requireStructured<{ count: number; alarms: unknown[] }>(result);
    expect(sc.count).toBe(sc.alarms.length);
  });

  it('alarm_list scoped to a folder still parses', async () => {
    const folder = firstOf(inventory.folders);
    if (!folder) return;
    const result = await readOnly.callTool('alarm_list', {
      entityType: 'Folder',
      entityId: folder.folder,
    });
    expectOk(result);
  });

  it('event_list with a small limit returns recent events', async () => {
    const result = await readOnly.callTool('event_list', { limit: 5 });
    expectOk(result);
    const sc = requireStructured<{ count: number; events: unknown[] }>(result);
    expect(sc.count).toBe(sc.events.length);
    // Some labs have no events at all on a fresh deploy; just make sure the
    // limit was respected and the array shape is consistent.
    expect(sc.count).toBeLessThanOrEqual(5);
  });
});
